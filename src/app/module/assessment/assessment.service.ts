import crypto from "crypto";
import httpStatus from "http-status";
import {
	AssessmentStatus,
	AttemptStatus,
	CompanyMemberRole,
	InvitationStatus,
	ResultStatus,
	SubmissionStatus,
	TestCaseType,
	UserRole,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	IAddProblemsPayload,
	IAssessmentFilterOptions,
	IAttemptFilterOptions,
	ICreateAssessmentPayload,
	IInviteCandidatesPayload,
	IPublishResultsPayload,
	IResultFilterOptions,
	IStartAttemptPayload,
	ISubmitAttemptPayload,
	IUpdateAssessmentPayload,
} from "./assessment.interface";

/**
 * Standard relations to include when querying assessment details
 */
const assessmentDetailInclude = {
	settings: true,
	problems: {
		orderBy: { questionOrder: "asc" as const },
		include: {
			problem: {
				select: {
					id: true,
					title: true,
					type: true,
					difficulty: true,
					marks: true,
				},
			},
		},
	},
	company: {
		select: {
			id: true,
			name: true,
			slug: true,
			logoUrl: true,
		},
	},
	creator: {
		select: {
			id: true,
			name: true,
			email: true,
		},
	},
};

/**
 * Validates company access for creating assessments.
 * - Platform Admins (SUPER_ADMIN, ADMIN) can create assessments for any company.
 * - Company Members (COMPANY_OWNER, COMPANY_ADMIN, ASSESSMENT_CREATOR) can only create for their assigned company.
 */
const resolveAndVerifyCompanyAccess = async (
	user: RequestUser,
	requestedCompanyId?: string,
): Promise<string> => {
	const targetCompanyId = requestedCompanyId || user.companyId;

	if (!targetCompanyId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"A valid companyId is required to create an assessment.",
		);
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (isPlatformAdmin) {
		const company = await prisma.company.findUnique({
			where: { id: targetCompanyId },
		});
		if (!company) {
			throw new AppError(httpStatus.NOT_FOUND, "Target company not found.");
		}
		return targetCompanyId;
	}

	// Verify company membership and proper role
	const membership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: user.userId,
				companyId: targetCompanyId,
			},
		},
	});

	const authorizedCompanyRoles: CompanyMemberRole[] = [
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	];

	if (!membership || !authorizedCompanyRoles.includes(membership.role)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to create assessments for this company.",
		);
	}

	return targetCompanyId;
};

/**
 * Creates a new technical assessment with settings and optional problems.
 * Executed atomically in a database transaction.
 */
const createAssessment = async (
	user: RequestUser,
	payload: ICreateAssessmentPayload,
) => {
	const companyId = await resolveAndVerifyCompanyAccess(
		user,
		payload.companyId,
	);

	// 2. Validate and prepare problems if provided
	type PreparedProblem = {
		problemId: string;
		marks: number;
		questionOrder: number;
		isRequired: boolean;
	};

	const preparedProblems: PreparedProblem[] = [];
	let calculatedTotalMarks = payload.totalMarks ?? 0;

	if (payload.problems && payload.problems.length > 0) {
		const problemIds = payload.problems.map((p) => p.problemId);

		const existingProblems = await prisma.problem.findMany({
			where: { id: { in: problemIds } },
			select: {
				id: true,
				title: true,
				marks: true,
				companyId: true,
			},
		});

		const problemMap = new Map(existingProblems.map((p) => [p.id, p]));

		// Ensure all problems exist
		const missingProblemIds = problemIds.filter((id) => !problemMap.has(id));
		if (missingProblemIds.length > 0) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`The following problem(s) were not found: ${missingProblemIds.join(", ")}`,
			);
		}

		// Ensure tenant isolation: problems must be global (null) or belong to this company
		for (const problem of existingProblems) {
			if (problem.companyId && problem.companyId !== companyId) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					`Problem '${problem.title}' belongs to another organization and cannot be used in this assessment.`,
				);
			}
		}

		// Prepare problem entries with order and marks
		let totalScoreFromProblems = 0;
		payload.problems.forEach((item, index) => {
			const dbProblem = problemMap.get(item.problemId);
			if (!dbProblem) return;

			const marks = item.marks ?? dbProblem.marks ?? 1;
			const questionOrder = item.questionOrder ?? index + 1;
			const isRequired = item.isRequired !== undefined ? item.isRequired : true;

			totalScoreFromProblems += marks;
			preparedProblems.push({
				problemId: item.problemId,
				marks,
				questionOrder,
				isRequired,
			});
		});

		// If totalMarks wasn't explicitly supplied, derive it from the problems
		if (!payload.totalMarks) {
			calculatedTotalMarks = totalScoreFromProblems;
		}
	}

	// 3. Validate passing score relative to total marks
	if (
		payload.passingScore !== undefined &&
		payload.passingScore !== null &&
		calculatedTotalMarks > 0
	) {
		if (payload.passingScore > calculatedTotalMarks) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Passing score (${payload.passingScore}) cannot be greater than total marks (${calculatedTotalMarks}).`,
			);
		}
	}

	// 4. Atomic assessment creation inside database transaction
	const result = await prisma.$transaction(async (tx) => {
		// Create the assessment header & default settings
		const newAssessment = await tx.assessment.create({
			data: {
				title: payload.title.trim(),
				description: payload.description?.trim() || null,
				companyId,
				creatorId: user.userId,
				durationMinutes: payload.durationMinutes,
				totalMarks: calculatedTotalMarks,
				passingScore: payload.passingScore ?? null,
				startDate: payload.startDate ? new Date(payload.startDate) : null,
				endDate: payload.endDate ? new Date(payload.endDate) : null,
				status: payload.status ?? AssessmentStatus.DRAFT,
				settings: {
					create: {
						maxAttempts: payload.settings?.maxAttempts ?? 1,
						shuffleQuestions: payload.settings?.shuffleQuestions ?? false,
						shuffleMCQOptions: payload.settings?.shuffleMCQOptions ?? false,
						allowMultipleAttempts:
							payload.settings?.allowMultipleAttempts ?? false,
						preventCopyPaste: payload.settings?.preventCopyPaste ?? false,
						requireFullscreen: payload.settings?.requireFullscreen ?? false,
						autoSubmitOnExpiry: payload.settings?.autoSubmitOnExpiry ?? true,
					},
				},
			},
		});

		// Link problems if any were attached
		if (preparedProblems.length > 0) {
			await tx.assessmentProblem.createMany({
				data: preparedProblems.map((problem) => ({
					assessmentId: newAssessment.id,
					problemId: problem.problemId,
					marks: problem.marks,
					questionOrder: problem.questionOrder,
					isRequired: problem.isRequired,
				})),
			});
		}

		// Return fully populated assessment
		return await tx.assessment.findUnique({
			where: { id: newAssessment.id },
			include: assessmentDetailInclude,
		});
	});

	return result;
};

/**
 * Retrieves assessments accessible to the current user (by company or creator)
 */
const getMyAssessments = async (
	user: RequestUser,
	options: IAssessmentFilterOptions,
) => {
	const page = Number(options.page) || 1;
	const limit = Number(options.limit) || 10;
	const skip = (page - 1) * limit;

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	// Build filter conditions
	const whereCondition: Record<string, unknown> = {};

	if (!isPlatformAdmin) {
		if (user.companyId) {
			whereCondition.companyId = user.companyId;
		} else {
			whereCondition.creatorId = user.userId;
		}
	} else if (options.companyId) {
		whereCondition.companyId = options.companyId;
	}

	if (options.status) {
		whereCondition.status = options.status;
	}

	if (options.searchTerm) {
		whereCondition.OR = [
			{ title: { contains: options.searchTerm, mode: "insensitive" } },
			{ description: { contains: options.searchTerm, mode: "insensitive" } },
		];
	}

	const [total, assessments] = await Promise.all([
		prisma.assessment.count({ where: whereCondition }),
		prisma.assessment.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: {
				[options.sortBy || "createdAt"]: options.sortOrder || "desc",
			},
			include: assessmentDetailInclude,
		}),
	]);

	return {
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data: assessments,
	};
};

/**
 * Retrieves a single assessment by its ID with tenant security and anti-cheat data sanitization.
 */
const getSingleAssessment = async (user: RequestUser, assessmentId: string) => {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			settings: true,
			problems: {
				orderBy: { questionOrder: "asc" as const },
				include: {
					problem: {
						include: {
							mcqQuestion: {
								include: {
									options: {
										orderBy: { optionOrder: "asc" as const },
									},
								},
							},
							codingQuestion: {
								include: {
									testCases: true,
								},
							},
							writtenQuestion: true,
						},
					},
				},
			},
			company: {
				select: {
					id: true,
					name: true,
					slug: true,
					logoUrl: true,
					website: true,
					email: true,
				},
			},
			creator: {
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
				},
			},
			_count: {
				select: {
					problems: true,
					invitations: true,
					attempts: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	const isCompanyStaff =
		user.companyId === assessment.companyId ||
		user.userId === assessment.creatorId;

	const isCandidate = user.role === UserRole.CANDIDATE;

	// Permission verification
	if (!isPlatformAdmin && !isCompanyStaff) {
		if (isCandidate) {
			// Check if candidate is invited or assessment is actively accessible
			const invitation = await prisma.assessmentInvitation.findUnique({
				where: {
					assessmentId_candidateId: {
						assessmentId: assessment.id,
						candidateId: user.userId,
					},
				},
			});

			const isPubliclyAccessible =
				assessment.status === AssessmentStatus.PUBLISHED ||
				assessment.status === AssessmentStatus.ACTIVE;

			if (!invitation && !isPubliclyAccessible) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"You do not have permission to access this assessment.",
				);
			}
		} else {
			// User belongs to another company and has no relation to this assessment
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view assessments from another organization.",
			);
		}
	}

	// If accessed by a Candidate, sanitize solution data (anti-cheat protection)
	if (isCandidate) {
		const sanitizedProblems = assessment.problems.map((ap) => {
			const problem = ap.problem;
			return {
				...ap,
				problem: {
					...problem,
					// MCQ: hide which option is correct and explanation
					mcqQuestion: problem.mcqQuestion
						? {
								...problem.mcqQuestion,
								explanation: undefined,
								options: problem.mcqQuestion.options.map((opt) => ({
									id: opt.id,
									optionText: opt.optionText,
									optionOrder: opt.optionOrder,
								})),
							}
						: null,
					// Coding: hide hidden test cases from candidates
					codingQuestion: problem.codingQuestion
						? {
								...problem.codingQuestion,
								testCases: problem.codingQuestion.testCases.filter(
									(tc) => tc.type === "PUBLIC",
								),
							}
						: null,
					// Written: hide expected answer
					writtenQuestion: problem.writtenQuestion
						? {
								...problem.writtenQuestion,
								expectedAnswer: undefined,
							}
						: null,
				},
			};
		});

		return {
			...assessment,
			problems: sanitizedProblems,
		};
	}

	return assessment;
};

/**
 * Updates an existing assessment, its settings, and problem list.
 * Atomic transaction ensures data consistency and preserves assessment integrity.
 */
const updateAssessment = async (
	user: RequestUser,
	assessmentId: string,
	payload: IUpdateAssessmentPayload,
) => {
	// 1. Fetch existing assessment
	const existingAssessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			settings: true,
			problems: true,
		},
	});

	if (!existingAssessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Authorize requester
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: existingAssessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
			CompanyMemberRole.ASSESSMENT_CREATOR,
		];

		const isCreator = existingAssessment.creatorId === user.userId;

		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to update this assessment.",
			);
		}
	}

	// 3. Business rule invariants: Completed or archived assessments cannot be modified
	// Only allow a status-only transition back to DRAFT/ACTIVE — no other fields
	if (
		existingAssessment.status === AssessmentStatus.COMPLETED ||
		existingAssessment.status === AssessmentStatus.ARCHIVED
	) {
		const isStatusOnlyRestore =
			payload.status === AssessmentStatus.ACTIVE ||
			payload.status === AssessmentStatus.DRAFT;

		if (!isStatusOnlyRestore) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Cannot modify an assessment that has been completed or archived.",
			);
		}

		// Guard: only the status field is allowed to change — block everything else
		const restrictedFields = [
			"title",
			"description",
			"durationMinutes",
			"totalMarks",
			"passingScore",
			"startDate",
			"endDate",
			"problems",
			"settings",
		] as const;

		const hasOtherChanges = restrictedFields.some(
			(field) => payload[field as keyof typeof payload] !== undefined,
		);

		if (hasOtherChanges) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Only the status field can be restored on a completed or archived assessment. Other fields cannot be modified.",
			);
		}
	}

	// 4. Validate problems and score calculation if problems are modified
	type PreparedProblem = {
		problemId: string;
		marks: number;
		questionOrder: number;
		isRequired: boolean;
	};

	let preparedProblems: PreparedProblem[] | null = null;
	let calculatedTotalMarks =
		payload.totalMarks ?? existingAssessment.totalMarks;

	if (payload.problems !== undefined) {
		// Prevent modifying questions if candidate attempts have already started
		const attemptsCount = await prisma.assessmentAttempt.count({
			where: { assessmentId },
		});

		if (attemptsCount > 0) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Cannot modify assessment problems because candidate attempts have already started.",
			);
		}

		if (payload.problems.length > 0) {
			const problemIds = payload.problems.map((p) => p.problemId);

			const existingProblems = await prisma.problem.findMany({
				where: { id: { in: problemIds } },
				select: {
					id: true,
					title: true,
					marks: true,
					companyId: true,
				},
			});

			const problemMap = new Map(existingProblems.map((p) => [p.id, p]));

			const missingIds = problemIds.filter((id) => !problemMap.has(id));
			if (missingIds.length > 0) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					`The following problem(s) were not found: ${missingIds.join(", ")}`,
				);
			}

			// Ensure problems belong to company or are global
			for (const problem of existingProblems) {
				if (
					problem.companyId &&
					problem.companyId !== existingAssessment.companyId
				) {
					throw new AppError(
						httpStatus.FORBIDDEN,
						`Problem '${problem.title}' belongs to another organization and cannot be used.`,
					);
				}
			}

			let totalScoreFromProblems = 0;
			const problemsList: PreparedProblem[] = [];

			payload.problems.forEach((item, index) => {
				const dbProblem = problemMap.get(item.problemId);
				if (!dbProblem) return;

				const marks = item.marks ?? dbProblem.marks ?? 1;
				const questionOrder = item.questionOrder ?? index + 1;
				const isRequired =
					item.isRequired !== undefined ? item.isRequired : true;

				totalScoreFromProblems += marks;
				problemsList.push({
					problemId: item.problemId,
					marks,
					questionOrder,
					isRequired,
				});
			});

			preparedProblems = problemsList;

			if (payload.totalMarks === undefined) {
				calculatedTotalMarks = totalScoreFromProblems;
			}
		} else {
			preparedProblems = [];
			if (payload.totalMarks === undefined) {
				calculatedTotalMarks = 0;
			}
		}
	}

	// Validate passing score against total marks
	const effectivePassingScore =
		payload.passingScore !== undefined
			? payload.passingScore
			: existingAssessment.passingScore;

	if (
		effectivePassingScore !== null &&
		effectivePassingScore !== undefined &&
		calculatedTotalMarks > 0
	) {
		if (effectivePassingScore > calculatedTotalMarks) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Passing score (${effectivePassingScore}) cannot exceed total marks (${calculatedTotalMarks}).`,
			);
		}
	}

	// 5. Execute atomic transaction
	const updated = await prisma.$transaction(async (tx) => {
		// Update problem joins if problems were included in payload
		if (preparedProblems !== null) {
			await tx.assessmentProblem.deleteMany({
				where: { assessmentId },
			});

			if (preparedProblems.length > 0) {
				const problemsToInsert = preparedProblems;
				await tx.assessmentProblem.createMany({
					data: problemsToInsert.map((p) => ({
						assessmentId,
						problemId: p.problemId,
						marks: p.marks,
						questionOrder: p.questionOrder,
						isRequired: p.isRequired,
					})),
				});
			}
		}

		// Update or upsert settings if provided
		if (payload.settings) {
			await tx.assessmentSetting.upsert({
				where: { assessmentId },
				update: {
					maxAttempts: payload.settings.maxAttempts,
					shuffleQuestions: payload.settings.shuffleQuestions,
					shuffleMCQOptions: payload.settings.shuffleMCQOptions,
					allowMultipleAttempts: payload.settings.allowMultipleAttempts,
					preventCopyPaste: payload.settings.preventCopyPaste,
					requireFullscreen: payload.settings.requireFullscreen,
					autoSubmitOnExpiry: payload.settings.autoSubmitOnExpiry,
				},
				create: {
					assessmentId,
					maxAttempts: payload.settings.maxAttempts ?? 1,
					shuffleQuestions: payload.settings.shuffleQuestions ?? false,
					shuffleMCQOptions: payload.settings.shuffleMCQOptions ?? false,
					allowMultipleAttempts:
						payload.settings.allowMultipleAttempts ?? false,
					preventCopyPaste: payload.settings.preventCopyPaste ?? false,
					requireFullscreen: payload.settings.requireFullscreen ?? false,
					autoSubmitOnExpiry: payload.settings.autoSubmitOnExpiry ?? true,
				},
			});
		}

		// Update assessment attributes
		const updateData: Record<string, unknown> = {};
		if (payload.title !== undefined) updateData.title = payload.title.trim();
		if (payload.description !== undefined)
			updateData.description = payload.description?.trim() || null;
		if (payload.durationMinutes !== undefined)
			updateData.durationMinutes = payload.durationMinutes;
		if (calculatedTotalMarks !== undefined)
			updateData.totalMarks = calculatedTotalMarks;
		if (payload.passingScore !== undefined)
			updateData.passingScore = payload.passingScore;
		if (payload.startDate !== undefined)
			updateData.startDate = payload.startDate
				? new Date(payload.startDate)
				: null;
		if (payload.endDate !== undefined)
			updateData.endDate = payload.endDate ? new Date(payload.endDate) : null;
		if (payload.status !== undefined) updateData.status = payload.status;

		await tx.assessment.update({
			where: { id: assessmentId },
			data: updateData,
		});

		return await tx.assessment.findUnique({
			where: { id: assessmentId },
			include: assessmentDetailInclude,
		});
	});

	return updated;
};

/**
 * Permanently deletes an assessment and its associated settings, problem associations, and records.
 * Cascade deletion is handled cleanly with permission and ongoing session protection.
 */
const deleteAssessment = async (user: RequestUser, assessmentId: string) => {
	// 1. Fetch the existing assessment
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			_count: {
				select: {
					attempts: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Permission check: Platform Admins or Company Owners/Admins/Creator
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		const isCreator = assessment.creatorId === user.userId;

		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to delete this assessment.",
			);
		}
	}

	// 3. Prevent deleting an assessment while candidate attempts are currently in progress
	const inProgressAttempts = await prisma.assessmentAttempt.count({
		where: {
			assessmentId,
			status: "IN_PROGRESS",
		},
	});

	if (inProgressAttempts > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot delete assessment while candidates currently have active test sessions in progress.",
		);
	}

	// 4. Delete the assessment (cascades to AssessmentProblem, AssessmentSetting, Invitations, Attempts)
	const deleted = await prisma.assessment.delete({
		where: { id: assessmentId },
		select: {
			id: true,
			title: true,
			companyId: true,
		},
	});

	return deleted;
};

/**
 * Publishes an assessment, transitioning it from DRAFT to PUBLISHED.
 * Validates readiness criteria: must contain problems, positive duration, and valid dates.
 */
const publishAssessment = async (user: RequestUser, assessmentId: string) => {
	// 1. Retrieve the assessment with its questions and settings
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			settings: true,
			_count: {
				select: {
					problems: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Authorize requester (Platform Admin or Company Member with proper role)
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
			CompanyMemberRole.ASSESSMENT_CREATOR,
		];

		const isCreator = assessment.creatorId === user.userId;

		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to publish this assessment.",
			);
		}
	}

	// 3. Status checks
	if (
		assessment.status === AssessmentStatus.PUBLISHED ||
		assessment.status === AssessmentStatus.ACTIVE
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Assessment is already published.",
		);
	}

	if (
		assessment.status === AssessmentStatus.COMPLETED ||
		assessment.status === AssessmentStatus.ARCHIVED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot publish an assessment that has been completed or archived.",
		);
	}

	// 4. Readiness checks
	if (assessment._count.problems === 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot publish an assessment with no questions. Please attach at least one problem first.",
		);
	}

	if (assessment.durationMinutes <= 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Assessment must have a valid positive duration in minutes before publishing.",
		);
	}

	if (assessment.endDate && new Date(assessment.endDate) <= new Date()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot publish an assessment whose end date is already in the past. Please update the end date first.",
		);
	}

	// 5. Publish transition
	const published = await prisma.assessment.update({
		where: { id: assessmentId },
		data: {
			status: AssessmentStatus.PUBLISHED,
		},
		include: assessmentDetailInclude,
	});

	return published;
};

/**
 * Adds new problems to an existing assessment.
 * Ensures question sequence integrity, tenant isolation, and automatically increments totalMarks.
 */
const addProblemsToAssessment = async (
	user: RequestUser,
	assessmentId: string,
	payload: IAddProblemsPayload,
) => {
	// 1. Retrieve the assessment with existing problems
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			problems: {
				orderBy: { questionOrder: "desc" as const },
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Authorize requester
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
			CompanyMemberRole.ASSESSMENT_CREATOR,
		];

		const isCreator = assessment.creatorId === user.userId;

		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to modify problems for this assessment.",
			);
		}
	}

	// 3. Status and attempt guards
	if (
		assessment.status === AssessmentStatus.COMPLETED ||
		assessment.status === AssessmentStatus.ARCHIVED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot add problems to an assessment that has been completed or archived.",
		);
	}

	const attemptsCount = await prisma.assessmentAttempt.count({
		where: { assessmentId },
	});

	if (attemptsCount > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot add problems because candidate attempts have already started for this assessment.",
		);
	}

	// 4. Validate problem list
	const newProblemIds = payload.problems.map((p) => p.problemId);

	// Guard against duplicate problems already in the assessment
	const existingProblemIdSet = new Set(
		assessment.problems.map((p) => p.problemId),
	);
	const duplicates = newProblemIds.filter((id) => existingProblemIdSet.has(id));
	if (duplicates.length > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`The following problem(s) are already added to this assessment: ${duplicates.join(", ")}`,
		);
	}

	// Fetch problems from Problem Bank
	const dbProblems = await prisma.problem.findMany({
		where: { id: { in: newProblemIds } },
		select: {
			id: true,
			title: true,
			marks: true,
			companyId: true,
		},
	});

	const dbProblemMap = new Map(dbProblems.map((p) => [p.id, p]));
	const missingIds = newProblemIds.filter((id) => !dbProblemMap.has(id));
	if (missingIds.length > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`The following problem(s) were not found: ${missingIds.join(", ")}`,
		);
	}

	// Tenant isolation check
	for (const p of dbProblems) {
		if (p.companyId && p.companyId !== assessment.companyId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				`Problem '${p.title}' belongs to another organization and cannot be added.`,
			);
		}
	}

	// 5. Sequence and score preparation
	// Use Math.max to safely derive highest order regardless of sort direction
	let currentMaxOrder =
		assessment.problems.length > 0
			? Math.max(...assessment.problems.map((p) => p.questionOrder))
			: 0;
	const usedOrders = new Set(assessment.problems.map((p) => p.questionOrder));
	let additionalScore = 0;

	type PreparedProblem = {
		assessmentId: string;
		problemId: string;
		marks: number;
		questionOrder: number;
		isRequired: boolean;
	};

	const preparedList: PreparedProblem[] = [];

	payload.problems.forEach((item) => {
		const dbProblem = dbProblemMap.get(item.problemId);
		if (!dbProblem) return;

		const marks = item.marks ?? dbProblem.marks ?? 1;
		additionalScore += marks;

		let questionOrder = item.questionOrder;
		if (!questionOrder || usedOrders.has(questionOrder)) {
			currentMaxOrder += 1;
			questionOrder = currentMaxOrder;
		}
		usedOrders.add(questionOrder);

		preparedList.push({
			assessmentId,
			problemId: item.problemId,
			marks,
			questionOrder,
			isRequired: item.isRequired !== undefined ? item.isRequired : true,
		});
	});

	// 6. Atomic Transaction
	const result = await prisma.$transaction(async (tx) => {
		await tx.assessmentProblem.createMany({
			data: preparedList,
		});

		await tx.assessment.update({
			where: { id: assessmentId },
			data: {
				totalMarks: {
					increment: additionalScore,
				},
			},
		});

		return await tx.assessment.findUnique({
			where: { id: assessmentId },
			include: assessmentDetailInclude,
		});
	});

	return result;
};

/**
 * Invites candidates to an assessment via email.
 * Creates candidate accounts if they do not already exist, generates secure unique invitation tokens,
 * saves/updates invitation records, and dispatches invitation emails with instructions and test link.
 */
const inviteCandidates = async (
	user: RequestUser,
	assessmentId: string,
	payload: IInviteCandidatesPayload,
) => {
	// 1. Fetch assessment with company info
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			company: {
				select: {
					id: true,
					name: true,
					slug: true,
					logoUrl: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Authorize requester
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
			CompanyMemberRole.ASSESSMENT_CREATOR,
		];

		const isCreator = assessment.creatorId === user.userId;

		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to invite candidates to this assessment.",
			);
		}
	}

	// 3. Status checks: cannot invite to completed or archived assessments
	if (
		assessment.status === AssessmentStatus.COMPLETED ||
		assessment.status === AssessmentStatus.ARCHIVED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot invite candidates to an assessment that has been completed or archived.",
		);
	}

	if (assessment.endDate && new Date(assessment.endDate) <= new Date()) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot invite candidates because the assessment deadline has already passed.",
		);
	}

	// 4. Normalize candidate emails
	const emailSet = new Set<string>();
	if (payload.email) emailSet.add(payload.email.trim().toLowerCase());
	if (payload.emails && Array.isArray(payload.emails)) {
		payload.emails.forEach((e) => {
			if (typeof e === "string" && e.trim()) {
				emailSet.add(e.trim().toLowerCase());
			}
		});
	}

	const candidateEmails = Array.from(emailSet);
	if (candidateEmails.length === 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Please provide at least one valid candidate email address.",
		);
	}

	// Expiry determination
	const defaultExpiresAt = assessment.endDate
		? new Date(assessment.endDate)
		: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

	const expiresAt = payload.expiresAt
		? new Date(payload.expiresAt)
		: defaultExpiresAt;

	// 5. Process invitations
	const processedInvitations = [];

	for (const candidateEmail of candidateEmails) {
		// Ensure candidate User account exists
		let candidateUser = await prisma.user.findUnique({
			where: { email: candidateEmail },
		});

		if (!candidateUser) {
			candidateUser = await prisma.user.create({
				data: {
					email: candidateEmail,
					name: candidateEmail.split("@")[0],
					role: UserRole.CANDIDATE,
					isVerified: false,
				},
			});
		}

		// Generate secure cryptographic invitation token
		const token = crypto.randomBytes(32).toString("hex");

		// Upsert invitation record
		const invitation = await prisma.assessmentInvitation.upsert({
			where: {
				assessmentId_candidateId: {
					assessmentId,
					candidateId: candidateUser.id,
				},
			},
			update: {
				token,
				email: candidateEmail,
				status: InvitationStatus.PENDING,
				invitedAt: new Date(),
				expiresAt,
			},
			create: {
				assessmentId,
				candidateId: candidateUser.id,
				email: candidateEmail,
				token,
				status: InvitationStatus.PENDING,
				expiresAt,
			},
			include: {
				candidate: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});

		// Dispatch email invitation
		const frontendUrl = config.frontend_url || "http://localhost:3000";
		const invitationUrl = `${frontendUrl}/assessment/invitation?token=${token}`;

		try {
			await transporter.sendMail({
				from: config.SENDER_EMAIL_USER,
				to: candidateEmail,
				subject: `Technical Assessment Invitation: ${assessment.title} - ${assessment.company.name}`,
				html: `
					<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #24292e; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e1e4e8; border-radius: 8px;">
						<h2 style="color: #0366d6; margin-top: 0;">Developer Assessment Invitation</h2>
						<p>Hello <strong>${candidateUser.name}</strong>,</p>
						<p>You have been invited by <strong>${assessment.company.name}</strong> to undertake the technical assessment <strong>${assessment.title}</strong>.</p>
						<div style="background-color: #f6f8fa; padding: 16px; border-radius: 6px; margin: 20px 0;">
							<p style="margin: 6px 0;"><strong>Assessment:</strong> ${assessment.title}</p>
							<p style="margin: 6px 0;"><strong>Duration:</strong> ${assessment.durationMinutes} minutes</p>
							<p style="margin: 6px 0;"><strong>Total Marks:</strong> ${assessment.totalMarks}</p>
							<p style="margin: 6px 0;"><strong>Expires On:</strong> ${expiresAt.toLocaleString()}</p>
						</div>
						<p>Click the button below when you are ready to review the assessment instructions and start your test:</p>
						<div style="text-align: center; margin: 28px 0;">
							<a href="${invitationUrl}" style="background-color: #2ea44f; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Take Assessment</a>
						</div>
						<p style="font-size: 13px; color: #586069;">If you encounter any issues with the button, open this link directly in your browser:<br/><a href="${invitationUrl}" style="color: #0366d6;">${invitationUrl}</a></p>
					</div>
				`,
			});
		} catch (mailError) {
			console.warn(
				`Failed to send assessment invitation email to ${candidateEmail}:`,
				mailError,
			);
		}

		processedInvitations.push(invitation);
	}

	return {
		count: processedInvitations.length,
		invitations: processedInvitations,
	};
};

/**
 * Retrieves all invitations associated with a specific assessment.
 */
const getAssessmentInvitations = async (
	user: RequestUser,
	assessmentId: string,
) => {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			companyId: true,
			creatorId: true,
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const isCreator = assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view invitations for this assessment.",
			);
		}
	}

	const invitations = await prisma.assessmentInvitation.findMany({
		where: { assessmentId },
		include: {
			candidate: {
				select: {
					id: true,
					name: true,
					email: true,
					profilePictureUrl: true,
				},
			},
		},
		orderBy: { invitedAt: "desc" },
	});

	return invitations;
};

interface ISanitizeAssessmentInput {
	settings?: {
		shuffleQuestions?: boolean | null;
		shuffleMCQOptions?: boolean | null;
	} | null;
	problems: Array<{
		id: string;
		assessmentId: string;
		problemId: string;
		questionOrder: number;
		marks: number;
		isRequired: boolean;
		problem: {
			id: string;
			title: string;
			description: string;
			type: string;
			difficulty: string;
			marks: number;
			mcqQuestion?: {
				id: string;
				explanation?: string | null;
				options: Array<{
					id: string;
					optionText: string;
					optionOrder: number;
					isCorrect?: boolean;
				}>;
			} | null;
			codingQuestion?: {
				id: string;
				inputFormat?: string | null;
				outputFormat?: string | null;
				constraints?: string | null;
				starterCode?: unknown;
				supportedLanguages: string[];
				timeLimitMs: number;
				memoryLimitMb: number;
				testCases: Array<{
					id: string;
					type: TestCaseType;
					input: string;
					expectedOutput: string;
					timeLimitMs?: number | null;
					memoryLimitMb?: number | null;
				}>;
			} | null;
			writtenQuestion?: {
				id: string;
				wordLimit?: number | null;
				expectedAnswer?: string | null;
			} | null;
		};
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}

/**
 * Sanitizes assessment and problem content for candidate consumption to prevent cheating.
 * Respects assessment settings for shuffling questions and MCQ options.
 */
const sanitizeAssessmentForCandidate = <T extends ISanitizeAssessmentInput>(
	assessment: T,
) => {
	let problems = assessment.problems.map((ap) => {
		const problem = ap.problem;
		let mcqQuestion = null;

		if (problem.mcqQuestion) {
			let options = problem.mcqQuestion.options.map((opt) => ({
				id: opt.id,
				optionText: opt.optionText,
				optionOrder: opt.optionOrder,
			}));

			if (assessment.settings?.shuffleMCQOptions) {
				options = [...options].sort(() => Math.random() - 0.5);
			}

			mcqQuestion = {
				...problem.mcqQuestion,
				explanation: undefined,
				options,
			};
		}

		return {
			...ap,
			problem: {
				...problem,
				mcqQuestion,
				codingQuestion: problem.codingQuestion
					? {
							...problem.codingQuestion,
							testCases: problem.codingQuestion.testCases.filter(
								(tc) => tc.type === TestCaseType.PUBLIC,
							),
						}
					: null,
				writtenQuestion: problem.writtenQuestion
					? {
							...problem.writtenQuestion,
							expectedAnswer: undefined,
						}
					: null,
			},
		};
	});

	if (assessment.settings?.shuffleQuestions) {
		problems = [...problems].sort(() => Math.random() - 0.5);
	}

	return {
		...assessment,
		problems,
	};
};

/**
 * Starts an assessment attempt for a candidate.
 * Server is the final authority on timer. If an active attempt exists and is not expired,
 * resumes the attempt idempotently. Sanitizes questions to prevent cheating.
 */
const startAttempt = async (
	user: RequestUser,
	assessmentId: string,
	payload: IStartAttemptPayload,
) => {
	// Guard: only CANDIDATEs can take assessments — recruiters and admins cannot sit exams
	if (user.role !== UserRole.CANDIDATE) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only candidates are permitted to start an assessment attempt.",
		);
	}
	// 1. Fetch assessment with settings and problems
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			settings: true,
			problems: {
				orderBy: { questionOrder: "asc" as const },
				include: {
					problem: {
						include: {
							mcqQuestion: {
								include: {
									options: {
										orderBy: { optionOrder: "asc" as const },
									},
								},
							},
							codingQuestion: {
								include: {
									testCases: true,
								},
							},
							writtenQuestion: true,
						},
					},
				},
			},
			company: {
				select: {
					id: true,
					name: true,
					slug: true,
					logoUrl: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	// 2. Validate assessment readiness & lifecycle
	if (
		assessment.status !== AssessmentStatus.PUBLISHED &&
		assessment.status !== AssessmentStatus.ACTIVE
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This assessment is not currently open for candidate attempts.",
		);
	}

	const now = new Date();
	if (assessment.startDate && assessment.startDate > now) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`This assessment has not started yet. It will open at ${assessment.startDate.toISOString()}.`,
		);
	}

	if (assessment.endDate && assessment.endDate <= now) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"The deadline for this assessment has already passed.",
		);
	}

	// 3. Invitation validation
	if (payload.invitationToken) {
		const invitation = await prisma.assessmentInvitation.findUnique({
			where: { token: payload.invitationToken },
		});

		if (!invitation || invitation.assessmentId !== assessmentId) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Invalid invitation token for this assessment.",
			);
		}

		if (invitation.expiresAt && invitation.expiresAt <= now) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Your invitation for this assessment has expired.",
			);
		}

		// If candidate accepted for the first time, mark as ACCEPTED
		if (invitation.status === InvitationStatus.PENDING) {
			await prisma.assessmentInvitation.update({
				where: { id: invitation.id },
				data: {
					status: InvitationStatus.ACCEPTED,
					acceptedAt: now,
				},
			});
		}
	} else {
		// Verify candidate invitation exists
		const invitation = await prisma.assessmentInvitation.findUnique({
			where: {
				assessmentId_candidateId: {
					assessmentId,
					candidateId: user.userId,
				},
			},
		});

		if (!invitation) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have an active invitation to start this assessment.",
			);
		}
	}

	// 4. Check existing candidate attempts
	const previousAttempts = await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId,
			candidateId: user.userId,
		},
		orderBy: { attemptNumber: "desc" as const },
		include: {
			submissions: true,
		},
	});

	// Check if there is an attempt currently in progress
	const activeAttempt = previousAttempts.find(
		(a) => a.status === AttemptStatus.IN_PROGRESS,
	);

	if (activeAttempt) {
		const isExpired =
			activeAttempt.expiresAt &&
			activeAttempt.expiresAt.getTime() <= Date.now();

		if (isExpired) {
			await prisma.assessmentAttempt.update({
				where: { id: activeAttempt.id },
				data: { status: AttemptStatus.EXPIRED },
			});
		} else {
			// Idempotently resume existing in-progress attempt
			const remainingSeconds = activeAttempt.expiresAt
				? Math.max(
						0,
						Math.floor((activeAttempt.expiresAt.getTime() - Date.now()) / 1000),
					)
				: null;

			return {
				isResume: true,
				attempt: activeAttempt,
				remainingSeconds,
				assessment: sanitizeAssessmentForCandidate(assessment),
			};
		}
	}

	// Check attempt limits
	// Only count finalized attempts (SUBMITTED, EXPIRED) — not the one we just expired above
	const finalizedAttempts = previousAttempts.filter(
		(a) => a.status !== AttemptStatus.IN_PROGRESS,
	);

	const maxAttemptsAllowed = assessment.settings?.maxAttempts ?? 1;
	const allowMultiple = assessment.settings?.allowMultipleAttempts ?? false;

	if (!allowMultiple && finalizedAttempts.length >= 1) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You have already completed your attempt for this assessment. Multiple attempts are not permitted.",
		);
	}

	if (finalizedAttempts.length >= maxAttemptsAllowed) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`You have reached the maximum allowed limit of ${maxAttemptsAllowed} attempt(s) for this assessment.`,
		);
	}

	// 5. Create new attempt with server-controlled timer
	const attemptNumber = previousAttempts.length + 1;
	const startedAt = new Date();
	const durationMs = assessment.durationMinutes * 60 * 1000;
	let expiresAt = new Date(startedAt.getTime() + durationMs);

	// Clamp to assessment deadline if sooner
	if (
		assessment.endDate &&
		assessment.endDate.getTime() < expiresAt.getTime()
	) {
		expiresAt = assessment.endDate;
	}

	const newAttempt = await prisma.assessmentAttempt.create({
		data: {
			assessmentId,
			candidateId: user.userId,
			attemptNumber,
			status: AttemptStatus.IN_PROGRESS,
			startedAt,
			expiresAt,
			totalMarks: assessment.totalMarks,
		},
		include: {
			submissions: true,
		},
	});

	const remainingSeconds = Math.max(
		0,
		Math.floor((expiresAt.getTime() - Date.now()) / 1000),
	);

	return {
		isResume: false,
		attempt: newAttempt,
		remainingSeconds,
		assessment: sanitizeAssessmentForCandidate(assessment),
	};
};

/**
 * Retrieves the details and remaining time of an assessment attempt.
 */
const getAttemptDetails = async (user: RequestUser, attemptId: string) => {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					settings: true,
					problems: {
						orderBy: { questionOrder: "asc" as const },
						include: {
							problem: {
								include: {
									mcqQuestion: {
										include: {
											options: {
												orderBy: { optionOrder: "asc" as const },
											},
										},
									},
									codingQuestion: {
										include: {
											testCases: true,
										},
									},
									writtenQuestion: true,
								},
							},
						},
					},
					company: {
						select: {
							id: true,
							name: true,
							slug: true,
						},
					},
				},
			},
			candidate: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			submissions: true,
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found");
	}

	const isCandidate = user.userId === attempt.candidateId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidate && !isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: attempt.assessment.companyId,
				},
			},
		});

		const isCreator = attempt.assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this attempt.",
			);
		}
	}

	// If candidate, check timer expiration
	let currentStatus = attempt.status;
	if (
		isCandidate &&
		attempt.status === AttemptStatus.IN_PROGRESS &&
		attempt.expiresAt &&
		attempt.expiresAt.getTime() <= Date.now()
	) {
		currentStatus = AttemptStatus.EXPIRED;
		await prisma.assessmentAttempt.update({
			where: { id: attempt.id },
			data: { status: AttemptStatus.EXPIRED },
		});
	}

	const remainingSeconds = attempt.expiresAt
		? Math.max(0, Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000))
		: null;

	if (isCandidate) {
		return {
			attempt: {
				...attempt,
				status: currentStatus,
			},
			remainingSeconds,
			assessment: sanitizeAssessmentForCandidate(attempt.assessment),
		};
	}

	return {
		attempt,
		remainingSeconds,
	};
};

/**
 * Submits an assessment attempt. Evaluates MCQ answers automatically,
 * updates obtained marks, percentage, and transitions attempt status.
 */
const submitAssessmentAttempt = async (
	user: RequestUser,
	attemptId: string,
	payload: ISubmitAttemptPayload,
) => {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					settings: true,
					problems: {
						include: {
							problem: {
								include: {
									mcqQuestion: {
										include: {
											options: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found");
	}

	const isCandidate = user.userId === attempt.candidateId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidate && !isPlatformAdmin) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to submit this attempt.",
		);
	}

	if (attempt.status !== AttemptStatus.IN_PROGRESS) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Attempt is already ${attempt.status.toLowerCase()}. Cannot submit again.`,
		);
	}

	// Check time expiration with a network grace period of 30 seconds
	const gracePeriodMs = 30 * 1000;
	const isExpired =
		attempt.expiresAt &&
		attempt.expiresAt.getTime() + gracePeriodMs < Date.now();

	const finalStatus = isExpired
		? AttemptStatus.EXPIRED
		: AttemptStatus.SUBMITTED;

	const problemMap = new Map(
		attempt.assessment.problems.map((p) => [p.problemId, p]),
	);

	const result = await prisma.$transaction(async (tx) => {
		let totalObtainedMarks = 0;

		if (payload.answers && payload.answers.length > 0) {
			for (const ans of payload.answers) {
				const assessmentProblem = problemMap.get(ans.problemId);
				if (!assessmentProblem) continue;

				const problem = assessmentProblem.problem;
				let marksObtained: number | null = null;
				let isCorrect: boolean | null = null;
				let submissionStatus: SubmissionStatus = SubmissionStatus.PENDING;

				// Automatic evaluation for MCQ
				if (problem.mcqQuestion) {
					const correctOption = problem.mcqQuestion.options.find(
						(opt) => opt.isCorrect,
					);
					if (correctOption && ans.selectedOptionId) {
						isCorrect = correctOption.id === ans.selectedOptionId;
						marksObtained = isCorrect ? assessmentProblem.marks : 0;
					} else {
						isCorrect = false;
						marksObtained = 0;
					}
					submissionStatus = SubmissionStatus.EVALUATED;
					totalObtainedMarks += marksObtained;
				}

				await tx.submission.upsert({
					where: {
						attemptId_problemId: {
							attemptId,
							problemId: ans.problemId,
						},
					},
					update: {
						selectedOptionId: ans.selectedOptionId || null,
						answerText: ans.answerText || null,
						sourceCode: ans.sourceCode || null,
						language: ans.language || null,
						marks: marksObtained,
						isCorrect,
						status: submissionStatus,
						submittedAt: new Date(),
					},
					create: {
						attemptId,
						problemId: ans.problemId,
						selectedOptionId: ans.selectedOptionId || null,
						answerText: ans.answerText || null,
						sourceCode: ans.sourceCode || null,
						language: ans.language || null,
						marks: marksObtained,
						isCorrect,
						status: submissionStatus,
						submittedAt: new Date(),
					},
				});
			}
		}

		// Calculate percentage
		const totalAssessmentMarks = attempt.assessment.totalMarks;
		const percentage =
			totalAssessmentMarks > 0
				? Math.round((totalObtainedMarks / totalAssessmentMarks) * 10000) / 100
				: 0;

		const updatedAttempt = await tx.assessmentAttempt.update({
			where: { id: attemptId },
			data: {
				status: finalStatus,
				submittedAt: new Date(),
				obtainedMarks: totalObtainedMarks,
				percentage,
			},
			include: {
				submissions: true,
			},
		});

		// Determine pass / fail status based on passing score or 50% baseline
		let resultStatus: ResultStatus = ResultStatus.PASSED;
		if (
			attempt.assessment.passingScore !== null &&
			attempt.assessment.passingScore !== undefined
		) {
			resultStatus =
				totalObtainedMarks >= attempt.assessment.passingScore
					? ResultStatus.PASSED
					: ResultStatus.FAILED;
		} else {
			resultStatus =
				percentage >= 50 ? ResultStatus.PASSED : ResultStatus.FAILED;
		}

		// Automatically create or update the Result record for the attempt
		const attemptResult = await tx.result.upsert({
			where: { attemptId },
			update: {
				totalMarks: totalAssessmentMarks,
				obtainedMarks: totalObtainedMarks,
				percentage,
				passingScore: attempt.assessment.passingScore,
				status: resultStatus,
			},
			create: {
				attemptId,
				totalMarks: totalAssessmentMarks,
				obtainedMarks: totalObtainedMarks,
				percentage,
				passingScore: attempt.assessment.passingScore,
				status: resultStatus,
			},
		});

		return {
			...updatedAttempt,
			result: attemptResult,
		};
	});

	return result;
};

/**
 * Retrieves all attempts for an assessment with filtering and pagination (Recruiter/Admin view).
 */
const getAssessmentAttempts = async (
	user: RequestUser,
	assessmentId: string,
	options: IAttemptFilterOptions,
) => {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			companyId: true,
			creatorId: true,
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const isCreator = assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view attempts for this assessment.",
			);
		}
	}

	const page = Number(options.page) || 1;
	const limit = Number(options.limit) || 10;
	const skip = (page - 1) * limit;

	const whereCondition: Record<string, unknown> = { assessmentId };
	if (options.status) {
		whereCondition.status = options.status as AttemptStatus;
	}

	const [total, attempts] = await Promise.all([
		prisma.assessmentAttempt.count({ where: whereCondition }),
		prisma.assessmentAttempt.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: {
				[options.sortBy || "createdAt"]: options.sortOrder || "desc",
			},
			include: {
				candidate: {
					select: {
						id: true,
						name: true,
						email: true,
						profilePictureUrl: true,
					},
				},
				_count: {
					select: {
						submissions: true,
					},
				},
			},
		}),
	]);

	return {
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data: attempts,
	};
};

/**
 * Retrieves all assessment attempts conducted by the authenticated candidate.
 */
const getMyAttempts = async (
	user: RequestUser,
	options: IAttemptFilterOptions,
) => {
	const page = Number(options.page) || 1;
	const limit = Number(options.limit) || 10;
	const skip = (page - 1) * limit;

	const whereCondition: Record<string, unknown> = {
		candidateId: user.userId,
	};

	if (options.status) {
		whereCondition.status = options.status as AttemptStatus;
	}

	const [total, attempts] = await Promise.all([
		prisma.assessmentAttempt.count({ where: whereCondition }),
		prisma.assessmentAttempt.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: {
				[options.sortBy || "createdAt"]: options.sortOrder || "desc",
			},
			include: {
				assessment: {
					select: {
						id: true,
						title: true,
						durationMinutes: true,
						totalMarks: true,
						passingScore: true,
						company: {
							select: {
								id: true,
								name: true,
								slug: true,
								logoUrl: true,
							},
						},
					},
				},
				_count: {
					select: {
						submissions: true,
					},
				},
			},
		}),
	]);

	return {
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data: attempts,
	};
};

/**
 * Calculates and updates ranking for all completed attempts belonging to an assessment.
 * Ranking algorithm:
 * 1. obtainedMarks DESC
 * 2. Completion duration (submittedAt - startedAt) ASC
 * 3. submittedAt ASC
 */
const calculateAssessmentRanks = async (assessmentId: string) => {
	const results = await prisma.result.findMany({
		where: {
			attempt: {
				assessmentId,
				submittedAt: { not: null },
			},
		},
		include: {
			attempt: {
				select: {
					startedAt: true,
					submittedAt: true,
				},
			},
		},
	});

	if (results.length === 0) return [];

	const sorted = [...results].sort((a, b) => {
		if (b.obtainedMarks !== a.obtainedMarks) {
			return b.obtainedMarks - a.obtainedMarks;
		}

		const durationA =
			a.attempt.submittedAt && a.attempt.startedAt
				? a.attempt.submittedAt.getTime() - a.attempt.startedAt.getTime()
				: Number.MAX_SAFE_INTEGER;
		const durationB =
			b.attempt.submittedAt && b.attempt.startedAt
				? b.attempt.submittedAt.getTime() - b.attempt.startedAt.getTime()
				: Number.MAX_SAFE_INTEGER;

		if (durationA !== durationB) {
			return durationA - durationB;
		}

		const timeA = a.attempt.submittedAt?.getTime() ?? 0;
		const timeB = b.attempt.submittedAt?.getTime() ?? 0;
		return timeA - timeB;
	});

	const rankUpdates = sorted.map((res, index) =>
		prisma.result.update({
			where: { id: res.id },
			data: { rank: index + 1 },
		}),
	);

	await prisma.$transaction(rankUpdates);

	return sorted;
};

/**
 * Publishes results for an assessment (or selected attempts), recalculates rankings,
 * and updates aggregate performance statistics in AssessmentReport.
 */
const publishAssessmentResults = async (
	user: RequestUser,
	assessmentId: string,
	payload: IPublishResultsPayload,
) => {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			company: true,
			settings: true,
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const authorizedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
			CompanyMemberRole.ASSESSMENT_CREATOR,
			CompanyMemberRole.EVALUATOR,
		];

		const isCreator = assessment.creatorId === user.userId;
		if (
			!isCreator &&
			(!membership || !authorizedRoles.includes(membership.role))
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to publish results for this assessment.",
			);
		}
	}

	if (payload.recalculateRanks !== false) {
		await calculateAssessmentRanks(assessmentId);
	}

	const publishedAt = new Date();
	const whereCondition: Record<string, unknown> = {
		attempt: {
			assessmentId,
		},
	};

	if (
		!payload.publishAll &&
		payload.attemptIds &&
		payload.attemptIds.length > 0
	) {
		whereCondition.attemptId = { in: payload.attemptIds };
	}

	const updateBatch = await prisma.result.updateMany({
		where: whereCondition,
		data: {
			publishedAt,
		},
	});

	const allResults = await prisma.result.findMany({
		where: {
			attempt: {
				assessmentId,
				submittedAt: { not: null },
			},
		},
		select: {
			obtainedMarks: true,
			percentage: true,
			status: true,
		},
	});

	const [totalInvitations, totalAttempts] = await Promise.all([
		prisma.assessmentInvitation.count({ where: { assessmentId } }),
		prisma.assessmentAttempt.count({ where: { assessmentId } }),
	]);

	const completedCount = allResults.length;
	const passedCount = allResults.filter(
		(r) => r.status === ResultStatus.PASSED,
	).length;
	const failedCount = allResults.filter(
		(r) => r.status === ResultStatus.FAILED,
	).length;

	const marksList = allResults.map((r) => r.obtainedMarks);
	const averageScore =
		completedCount > 0
			? Math.round(
					(marksList.reduce((acc, curr) => acc + curr, 0) / completedCount) *
						100,
				) / 100
			: 0;
	const highestScore = marksList.length > 0 ? Math.max(...marksList) : 0;
	const lowestScore = marksList.length > 0 ? Math.min(...marksList) : 0;

	const passRate =
		completedCount > 0
			? Math.round((passedCount / completedCount) * 10000) / 100
			: 0;
	const completionRate =
		totalAttempts > 0
			? Math.round((completedCount / totalAttempts) * 10000) / 100
			: 0;

	// totalCandidates = all who were invited
	// startedCandidates = all who actually opened an attempt (any status)
	await prisma.assessmentReport.upsert({
		where: { assessmentId },
		update: {
			totalCandidates: totalInvitations,
			invitedCandidates: totalInvitations,
			startedCandidates: totalAttempts,
			completedCandidates: completedCount,
			passedCandidates: passedCount,
			failedCandidates: failedCount,
			averageScore,
			highestScore,
			lowestScore,
			passRate,
			completionRate,
		},
		create: {
			assessmentId,
			totalCandidates: totalInvitations,
			invitedCandidates: totalInvitations,
			startedCandidates: totalAttempts,
			completedCandidates: completedCount,
			passedCandidates: passedCount,
			failedCandidates: failedCount,
			averageScore,
			highestScore,
			lowestScore,
			passRate,
			completionRate,
		},
	});

	return {
		publishedCount: updateBatch.count,
		publishedAt,
		overview: {
			totalAttempts,
			completedAttempts: completedCount,
			passedCount,
			failedCount,
			passRate,
			averageScore,
			highestScore,
			lowestScore,
		},
	};
};

/**
 * Retrieves the result of an assessment attempt.
 * For candidates:
 * - If published, reveals scores, rank, and MCQ question explanations.
 * - If unpublished, returns submission confirmation and notifies of pending release.
 * For recruiters/admins:
 * - Exposes full result, ranks, and breakdown regardless of publication state.
 */
const getAttemptResult = async (user: RequestUser, attemptId: string) => {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					problems: {
						orderBy: { questionOrder: "asc" as const },
						include: {
							problem: {
								include: {
									mcqQuestion: {
										include: {
											options: {
												orderBy: { optionOrder: "asc" as const },
											},
										},
									},
									codingQuestion: {
										include: {
											testCases: true,
										},
									},
									writtenQuestion: true,
								},
							},
						},
					},
					company: {
						select: {
							id: true,
							name: true,
							slug: true,
							logoUrl: true,
						},
					},
				},
			},
			candidate: {
				select: {
					id: true,
					name: true,
					email: true,
					profilePictureUrl: true,
				},
			},
			result: true,
			submissions: {
				include: {
					evaluations: true,
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found");
	}

	const isCandidate = user.userId === attempt.candidateId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidate && !isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: attempt.assessment.companyId,
				},
			},
		});

		const isCreator = attempt.assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this result.",
			);
		}
	}

	const isPublished = Boolean(attempt.result?.publishedAt);

	if (isCandidate && !isPublished) {
		return {
			isPublished: false,
			message:
				"Your assessment has been submitted successfully. Results and detailed breakdowns will be accessible once released by the evaluator.",
			attempt: {
				id: attempt.id,
				assessmentTitle: attempt.assessment.title,
				status: attempt.status,
				startedAt: attempt.startedAt,
				submittedAt: attempt.submittedAt,
			},
		};
	}

	const submissionMap = new Map(
		attempt.submissions.map((s) => [s.problemId, s]),
	);

	const problemBreakdown = attempt.assessment.problems.map((ap) => {
		const problem = ap.problem;
		const submission = submissionMap.get(problem.id);

		let mcqDetails = null;
		if (problem.mcqQuestion) {
			mcqDetails = {
				options: problem.mcqQuestion.options.map((opt) => ({
					id: opt.id,
					optionText: opt.optionText,
					optionOrder: opt.optionOrder,
					isCorrect: isPublished || !isCandidate ? opt.isCorrect : undefined,
				})),
				explanation:
					isPublished || !isCandidate
						? problem.mcqQuestion.explanation
						: undefined,
			};
		}

		return {
			problemId: problem.id,
			title: problem.title,
			type: problem.type,
			difficulty: problem.difficulty,
			marksAllocated: ap.marks,
			questionOrder: ap.questionOrder,
			mcqDetails,
			codingDetails: problem.codingQuestion
				? {
						supportedLanguages: problem.codingQuestion.supportedLanguages,
						timeLimitMs: problem.codingQuestion.timeLimitMs,
						memoryLimitMb: problem.codingQuestion.memoryLimitMb,
						publicTestCases: problem.codingQuestion.testCases
							.filter((tc) => tc.type === TestCaseType.PUBLIC)
							.map((tc) => ({
								input: tc.input,
								expectedOutput: tc.expectedOutput,
							})),
					}
				: null,
			writtenDetails: problem.writtenQuestion
				? {
						wordLimit: problem.writtenQuestion.wordLimit,
						expectedAnswer:
							!isCandidate || isPublished
								? problem.writtenQuestion.expectedAnswer
								: undefined,
					}
				: null,
			candidateSubmission: submission
				? {
						id: submission.id,
						selectedOptionId: submission.selectedOptionId,
						answerText: submission.answerText,
						sourceCode: submission.sourceCode,
						language: submission.language,
						status: submission.status,
						marksObtained: submission.marks,
						isCorrect: submission.isCorrect,
						submittedAt: submission.submittedAt,
						evaluations: submission.evaluations,
					}
				: null,
		};
	});

	return {
		isPublished,
		candidate: attempt.candidate,
		assessment: {
			id: attempt.assessment.id,
			title: attempt.assessment.title,
			totalMarks: attempt.assessment.totalMarks,
			passingScore: attempt.assessment.passingScore,
			company: attempt.assessment.company,
		},
		attempt: {
			id: attempt.id,
			attemptNumber: attempt.attemptNumber,
			status: attempt.status,
			startedAt: attempt.startedAt,
			submittedAt: attempt.submittedAt,
			durationMinutes:
				attempt.startedAt && attempt.submittedAt
					? Math.round(
							((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) /
								60000) *
								10,
						) / 10
					: null,
		},
		result: attempt.result,
		problemBreakdown,
	};
};

/**
 * Retrieves the results leaderboard and performance metrics for an assessment.
 * Permissions: Recruiter / Admin.
 */
const getAssessmentResults = async (
	user: RequestUser,
	assessmentId: string,
	options: IResultFilterOptions,
) => {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			title: true,
			totalMarks: true,
			passingScore: true,
			companyId: true,
			creatorId: true,
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: assessment.companyId,
				},
			},
		});

		const isCreator = assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view results for this assessment.",
			);
		}
	}

	const page = Number(options.page) || 1;
	const limit = Number(options.limit) || 10;
	const skip = (page - 1) * limit;

	const whereCondition: Record<string, unknown> = {
		attempt: {
			assessmentId,
		},
	};

	if (options.status) {
		whereCondition.status = options.status as ResultStatus;
	}

	if (options.isPublished !== undefined) {
		const isPub =
			options.isPublished === true || options.isPublished === "true";
		whereCondition.publishedAt = isPub ? { not: null } : null;
	}

	if (options.search) {
		whereCondition.attempt = {
			...((whereCondition.attempt as Record<string, unknown>) || {}),
			candidate: {
				OR: [
					{ name: { contains: options.search, mode: "insensitive" } },
					{ email: { contains: options.search, mode: "insensitive" } },
				],
			},
		};
	}

	const allowedSortFields = [
		"rank",
		"obtainedMarks",
		"percentage",
		"createdAt",
		"updatedAt",
	];
	const sortBy = allowedSortFields.includes(options.sortBy || "")
		? (options.sortBy as string)
		: "rank";
	const sortOrder = options.sortOrder === "desc" ? "desc" : "asc";

	const [total, results, report] = await Promise.all([
		prisma.result.count({ where: whereCondition }),
		prisma.result.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
			include: {
				attempt: {
					include: {
						candidate: {
							select: {
								id: true,
								name: true,
								email: true,
								profilePictureUrl: true,
							},
						},
					},
				},
			},
		}),
		prisma.assessmentReport.findUnique({
			where: { assessmentId },
		}),
	]);

	return {
		assessment: {
			id: assessment.id,
			title: assessment.title,
			totalMarks: assessment.totalMarks,
			passingScore: assessment.passingScore,
		},
		overview: report || null,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data: results,
	};
};

/**
 * Retrieves an in-depth evaluation report for a specific attempt, including anti-cheat logs,
 * code submissions, and execution metrics for recruiter inspection.
 */
const getDetailedResultReport = async (
	user: RequestUser,
	attemptId: string,
) => {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					company: true,
					problems: {
						orderBy: { questionOrder: "asc" as const },
						include: {
							problem: {
								include: {
									mcqQuestion: {
										include: {
											options: true,
										},
									},
									codingQuestion: {
										include: {
											testCases: true,
										},
									},
									writtenQuestion: true,
								},
							},
						},
					},
				},
			},
			candidate: {
				include: {
					candidateProfile: true,
				},
			},
			result: true,
			submissions: {
				include: {
					evaluations: {
						include: {
							evaluator: {
								select: {
									id: true,
									name: true,
									email: true,
								},
							},
						},
					},
				},
			},
			antiCheatEvents: {
				orderBy: { occurredAt: "asc" as const },
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId: attempt.assessment.companyId,
				},
			},
		});

		const isCreator = attempt.assessment.creatorId === user.userId;
		if (!isCreator && !membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this detailed report.",
			);
		}
	}

	const antiCheatSummary = attempt.antiCheatEvents.reduce(
		(acc, event) => {
			acc[event.type] = (acc[event.type] || 0) + 1;
			return acc;
		},
		{} as Record<string, number>,
	);

	return {
		candidate: {
			id: attempt.candidate.id,
			name: attempt.candidate.name,
			email: attempt.candidate.email,
			profile: attempt.candidate.candidateProfile,
		},
		assessment: {
			id: attempt.assessment.id,
			title: attempt.assessment.title,
			totalMarks: attempt.assessment.totalMarks,
			passingScore: attempt.assessment.passingScore,
			durationMinutes: attempt.assessment.durationMinutes,
		},
		attempt: {
			id: attempt.id,
			attemptNumber: attempt.attemptNumber,
			status: attempt.status,
			startedAt: attempt.startedAt,
			submittedAt: attempt.submittedAt,
			durationMinutes:
				attempt.startedAt && attempt.submittedAt
					? Math.round(
							((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) /
								60000) *
								10,
						) / 10
					: null,
		},
		result: attempt.result,
		antiCheat: {
			totalViolations: attempt.antiCheatEvents.length,
			summary: antiCheatSummary,
			events: attempt.antiCheatEvents,
		},
		submissions: attempt.submissions,
	};
};

export const AssessmentService = {
	createAssessment,
	getMyAssessments,
	getSingleAssessment,
	updateAssessment,
	deleteAssessment,
	publishAssessment,
	addProblemsToAssessment,
	inviteCandidates,
	getAssessmentInvitations,
	startAttempt,
	getAttemptDetails,
	submitAssessmentAttempt,
	getAssessmentAttempts,
	getMyAttempts,
	calculateAssessmentRanks,
	publishAssessmentResults,
	getAttemptResult,
	getAssessmentResults,
	getDetailedResultReport,
};
