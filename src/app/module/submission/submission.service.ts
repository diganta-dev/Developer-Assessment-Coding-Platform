import httpStatus from "http-status";
import {
	AttemptStatus,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { CodingEvaluationService } from "../evaluation/codingEvaluation.service";
import { MCQEvaluationService } from "../evaluation/mcqEvaluation.service";
import type {
	ICreateSubmissionPayload,
	ISubmissionFilterQuery,
	ISubmitSubmissionPayload,
} from "./submission.interface";

/**
 * Creates or updates a submission for a specific problem within an assessment attempt.
 *
 * Workflow Pipeline:
 * 1. Check candidate: verify existence, active status, and authorization
 * 2. Check attempt: verify attempt exists and belongs to the candidate
 * 3. Check problem: verify problem exists and belongs to the assessment
 * 4. Check attempt is active: verify status is IN_PROGRESS and timer has not expired
 * 5. Validate answer/code: validate based on problem type (MCQ, WRITTEN, CODING)
 * 6. Save submission: upsert submission record in database
 * 7. Return submission: return sanitized submission result
 */
const createSubmission = async (
	user: RequestUser,
	payload: ICreateSubmissionPayload,
) => {
	// ─── 0. Payload Validation ───────────────────────────────────────────────
	if (!payload.attemptId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}
	if (!payload.problemId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Problem ID is required.");
	}

	// ─── 1. Check Candidate ──────────────────────────────────────────────────
	if (!user?.userId) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"You must be logged in to submit an answer.",
		);
	}

	const candidate = await prisma.user.findUnique({
		where: { id: user.userId },
	});

	if (!candidate?.isActive) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Candidate account not found or is currently inactive.",
		);
	}

	// ─── 2. Check Attempt ────────────────────────────────────────────────────
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: payload.attemptId },
		include: {
			assessment: {
				include: {
					settings: true,
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	const isCandidateOwner = attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidateOwner && !isPlatformAdmin) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to submit answers for this attempt.",
		);
	}

	// ─── 3. Check Problem ────────────────────────────────────────────────────
	const problem = await prisma.problem.findUnique({
		where: { id: payload.problemId },
		include: {
			mcqQuestion: {
				include: {
					options: true,
				},
			},
			writtenQuestion: true,
			codingQuestion: {
				include: {
					testCases: true,
				},
			},
		},
	});

	if (!problem) {
		throw new AppError(httpStatus.NOT_FOUND, "Problem not found.");
	}

	// Verify problem belongs to this attempt's assessment
	const assessmentProblem = await prisma.assessmentProblem.findUnique({
		where: {
			assessmentId_problemId: {
				assessmentId: attempt.assessmentId,
				problemId: problem.id,
			},
		},
	});

	if (!assessmentProblem) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"The specified problem does not belong to this assessment.",
		);
	}

	// ─── 4. Check Attempt is Active ──────────────────────────────────────────
	if (attempt.status !== AttemptStatus.IN_PROGRESS) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot submit answer. Assessment attempt is currently ${attempt.status.toLowerCase()}.`,
		);
	}

	// Check timer expiration
	const now = Date.now();
	const isExpired = attempt.expiresAt && attempt.expiresAt.getTime() <= now;

	if (isExpired) {
		await prisma.assessmentAttempt.update({
			where: { id: attempt.id },
			data: { status: AttemptStatus.EXPIRED },
		});

		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Assessment attempt time has expired. Submissions are no longer accepted.",
		);
	}

	// ─── 5. Validate Answer / Code ───────────────────────────────────────────
	let marks: number | null = null;
	let isCorrect: boolean | null = null;
	let submissionStatus: SubmissionStatus = SubmissionStatus.PENDING;

	if (problem.type === ProblemType.MCQ) {
		if (!payload.selectedOptionId || payload.selectedOptionId.trim() === "") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Please select an option for this MCQ question.",
			);
		}

		const chosenOption = problem.mcqQuestion?.options.find(
			(opt) => opt.id === payload.selectedOptionId,
		);

		if (!chosenOption) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Invalid option selected. The selected option does not exist for this MCQ problem.",
			);
		}

		// Automatic evaluation for MCQ
		isCorrect = chosenOption.isCorrect;
		marks = isCorrect ? assessmentProblem.marks : 0;
		submissionStatus = SubmissionStatus.EVALUATED;
	} else if (problem.type === ProblemType.WRITTEN) {
		if (!payload.answerText || payload.answerText.trim() === "") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Answer text is required for this written question.",
			);
		}

		if (problem.writtenQuestion?.wordLimit) {
			const words = payload.answerText.trim().split(/\s+/).filter(Boolean);
			if (words.length > problem.writtenQuestion.wordLimit) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					`Your answer exceeds the maximum allowed word limit of ${problem.writtenQuestion.wordLimit} words (current: ${words.length} words).`,
				);
			}
		}

		// Written questions require manual evaluation
		marks = null;
		isCorrect = null;
		submissionStatus = SubmissionStatus.PENDING;
	} else if (problem.type === ProblemType.CODING) {
		if (!payload.sourceCode || payload.sourceCode.trim() === "") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Source code is required for this coding question.",
			);
		}

		if (!payload.language || payload.language.trim() === "") {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Programming language must be specified for this coding question.",
			);
		}

		if (
			problem.codingQuestion?.supportedLanguages &&
			problem.codingQuestion.supportedLanguages.length > 0
		) {
			const isLanguageSupported =
				problem.codingQuestion.supportedLanguages.some(
					(lang) =>
						lang.toLowerCase() === payload.language?.trim().toLowerCase(),
				);

			if (!isLanguageSupported) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					`Language '${payload.language}' is not supported. Supported languages: ${problem.codingQuestion.supportedLanguages.join(", ")}.`,
				);
			}
		}

		// Coding questions await evaluation / sandbox execution
		marks = null;
		isCorrect = null;
		submissionStatus = SubmissionStatus.PENDING;
	}

	// ─── 6. Save Submission ──────────────────────────────────────────────────
	const submission = await prisma.submission.upsert({
		where: {
			attemptId_problemId: {
				attemptId: attempt.id,
				problemId: problem.id,
			},
		},
		create: {
			attemptId: attempt.id,
			problemId: problem.id,
			selectedOptionId: payload.selectedOptionId || null,
			answerText: payload.answerText?.trim() || null,
			sourceCode: payload.sourceCode || null,
			language: payload.language?.trim() || null,
			status: submissionStatus,
			marks,
			isCorrect,
			submittedAt: new Date(),
		},
		update: {
			selectedOptionId: payload.selectedOptionId || null,
			answerText: payload.answerText?.trim() || null,
			sourceCode: payload.sourceCode || null,
			language: payload.language?.trim() || null,
			status: submissionStatus,
			marks,
			isCorrect,
			submittedAt: new Date(),
		},
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
	});

	// ─── 7. Return Submission ────────────────────────────────────────────────
	// If candidate is actively taking the assessment, sanitize evaluation details to prevent cheating
	if (isCandidateOwner && attempt.status === AttemptStatus.IN_PROGRESS) {
		const {
			marks: _marks,
			isCorrect: _isCorrect,
			...candidateSafeSubmission
		} = submission;
		return candidateSafeSubmission;
	}

	return submission;
};

/**
 * Retrieves a single submission by its ID with appropriate authorization checks.
 */
const getSubmissionById = async (user: RequestUser, submissionId: string) => {
	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: true,
			attempt: {
				include: {
					assessment: {
						select: {
							id: true,
							title: true,
							companyId: true,
							creatorId: true,
						},
					},
					candidate: {
						select: {
							id: true,
							name: true,
							email: true,
						},
					},
				},
			},
			evaluations: true,
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	const isCandidateOwner = submission.attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidateOwner && !isPlatformAdmin) {
		const isCompanyMember =
			user.companyId &&
			user.companyId === submission.attempt.assessment.companyId;

		const isAssessmentCreator =
			submission.attempt.assessment.creatorId === user.userId;

		if (!isCompanyMember && !isAssessmentCreator) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this submission.",
			);
		}
	}

	// Conceal marks and correctness for candidate while attempt is still in progress
	if (
		isCandidateOwner &&
		submission.attempt.status === AttemptStatus.IN_PROGRESS
	) {
		const {
			marks: _marks,
			isCorrect: _isCorrect,
			...candidateSafeSubmission
		} = submission;
		return candidateSafeSubmission;
	}

	return submission;
};

/**
 * Retrieves all submissions for a given assessment attempt.
 * Authorizes the requester (candidate owner or authorized staff), then
 * directly retrieves all submission records using findMany.
 */
const getAttemptSubmissions = async (user: RequestUser, attemptId: string) => {
	// 1. Fetch attempt for access control & exam status
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				select: {
					id: true,
					title: true,
					companyId: true,
					creatorId: true,
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	const isCandidateOwner = attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidateOwner && !isPlatformAdmin) {
		const isCompanyMember =
			user.companyId && user.companyId === attempt.assessment.companyId;

		const isAssessmentCreator = attempt.assessment.creatorId === user.userId;

		if (!isCompanyMember && !isAssessmentCreator) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view submissions for this attempt.",
			);
		}
	}

	// 2. Fetch submissions directly with findMany
	const submissions = await prisma.submission.findMany({
		where: { attemptId },
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
		orderBy: { submittedAt: "asc" },
	});

	// 3. Mask scores if candidate is actively sitting the assessment
	if (isCandidateOwner && attempt.status === AttemptStatus.IN_PROGRESS) {
		return submissions.map(
			({ marks: _marks, isCorrect: _isCorrect, ...rest }) => rest,
		);
	}

	return submissions;
};

/**
 * Retrieves a paginated list of submissions made by the currently logged-in candidate.
 * Supports filtering by assessment, attempt, problem, status, and problem title/description search.
 * Protects test integrity by concealing evaluation details (marks & isCorrect) for attempts still in progress.
 */
const getMySubmissions = async (
	user: RequestUser,
	options: ISubmissionFilterQuery = {},
) => {
	const page = Math.max(1, Number(options.page) || 1);
	const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
	const skip = (page - 1) * limit;

	// Candidate can strictly only view submissions from their own attempts
	const whereCondition: Record<string, unknown> = {
		attempt: {
			candidateId: user.userId,
		},
	};

	if (options.attemptId) {
		whereCondition.attemptId = options.attemptId;
	}

	if (options.problemId) {
		whereCondition.problemId = options.problemId;
	}

	if (options.status) {
		whereCondition.status = options.status;
	}

	if (typeof options.isCorrect === "boolean") {
		whereCondition.isCorrect = options.isCorrect;
	}

	if (options.assessmentId) {
		whereCondition.attempt = {
			...(whereCondition.attempt as Record<string, unknown>),
			assessmentId: options.assessmentId,
		};
	}

	if (options.searchTerm) {
		whereCondition.problem = {
			OR: [
				{ title: { contains: options.searchTerm, mode: "insensitive" } },
				{ description: { contains: options.searchTerm, mode: "insensitive" } },
			],
		};
	}

	const allowedSortFields = [
		"submittedAt",
		"status",
		"marks",
		"executionTimeMs",
	];
	const sortBy =
		options.sortBy && allowedSortFields.includes(options.sortBy)
			? options.sortBy
			: "submittedAt";
	const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

	const [total, submissions] = await Promise.all([
		prisma.submission.count({ where: whereCondition }),
		prisma.submission.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
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
				attempt: {
					select: {
						id: true,
						attemptNumber: true,
						status: true,
						startedAt: true,
						submittedAt: true,
						assessment: {
							select: {
								id: true,
								title: true,
								durationMinutes: true,
							},
						},
					},
				},
			},
		}),
	]);

	// Security: Mask marks & isCorrect for submissions whose attempts are still in progress
	const sanitizedData = submissions.map((sub) => {
		if (sub.attempt.status === AttemptStatus.IN_PROGRESS) {
			const { marks: _marks, isCorrect: _isCorrect, ...safeSub } = sub;
			return safeSub;
		}
		return sub;
	});

	return {
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
		data: sanitizedData,
	};
};

/**
 * Submits or finalizes a submission for an assessment problem.
 * Supports two invocation styles:
 * 1. By submissionId: Finalizes/updates an existing submission record (e.g. POST /submission/:id/submit).
 * 2. By attemptId + problemId: Routes to the full createSubmission pipeline.
 */
const submitSubmission = async (
	user: RequestUser,
	payload: ISubmitSubmissionPayload,
) => {
	// If attemptId and problemId are provided without a submissionId, route to createSubmission
	if (!payload.submissionId && payload.attemptId && payload.problemId) {
		return await createSubmission(user, {
			attemptId: payload.attemptId,
			problemId: payload.problemId,
			selectedOptionId: payload.selectedOptionId,
			answerText: payload.answerText,
			sourceCode: payload.sourceCode,
			language: payload.language,
		});
	}

	if (!payload.submissionId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Either 'submissionId' or both 'attemptId' and 'problemId' must be provided to submit.",
		);
	}

	// 1. Fetch existing submission with full attempt, assessment, and problem relations
	const submission = await prisma.submission.findUnique({
		where: { id: payload.submissionId },
		include: {
			attempt: {
				include: {
					assessment: {
						include: {
							problems: true,
						},
					},
				},
			},
			problem: {
				include: {
					mcqQuestion: {
						include: {
							options: true,
						},
					},
					writtenQuestion: true,
					codingQuestion: {
						include: {
							testCases: true,
						},
					},
				},
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	// 2. Security: Candidate ownership & role authorization
	const isCandidateOwner = submission.attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isCandidateOwner && !isPlatformAdmin) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to submit answers for this attempt.",
		);
	}

	// 3. Status check: Attempt must be IN_PROGRESS
	if (submission.attempt.status !== AttemptStatus.IN_PROGRESS) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot submit answer. Assessment attempt is currently ${submission.attempt.status.toLowerCase()}.`,
		);
	}

	// 4. Server-side timer expiry check
	const now = Date.now();
	const isExpired =
		submission.attempt.expiresAt &&
		submission.attempt.expiresAt.getTime() <= now;

	if (isExpired) {
		await prisma.assessmentAttempt.update({
			where: { id: submission.attempt.id },
			data: { status: AttemptStatus.EXPIRED },
		});

		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Assessment attempt time has expired. Submissions are no longer accepted.",
		);
	}

	// Find the problem's configured marks in this assessment
	const assessmentProblem = submission.attempt.assessment.problems.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const questionMarks = assessmentProblem?.marks ?? submission.problem.marks;

	// 5. Merge answers if provided in payload
	const selectedOptionId =
		payload.selectedOptionId !== undefined
			? payload.selectedOptionId
			: submission.selectedOptionId;

	const answerText =
		payload.answerText !== undefined
			? payload.answerText?.trim()
			: submission.answerText;

	const sourceCode =
		payload.sourceCode !== undefined
			? payload.sourceCode
			: submission.sourceCode;

	const language =
		payload.language !== undefined
			? payload.language?.trim()
			: submission.language;

	let marks: number | null = submission.marks;
	let isCorrect: boolean | null = submission.isCorrect;
	let submissionStatus: SubmissionStatus = submission.status;

	if (submission.problem.type === ProblemType.MCQ) {
		if (!selectedOptionId) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Please select an option for this MCQ question.",
			);
		}

		const chosenOption = submission.problem.mcqQuestion?.options.find(
			(opt) => opt.id === selectedOptionId,
		);

		if (!chosenOption) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Invalid option selected for this MCQ problem.",
			);
		}

		isCorrect = chosenOption.isCorrect;
		marks = isCorrect ? questionMarks : 0;
		submissionStatus = SubmissionStatus.EVALUATED;
	} else if (submission.problem.type === ProblemType.WRITTEN) {
		if (!answerText) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Answer text is required for this written question.",
			);
		}

		if (submission.problem.writtenQuestion?.wordLimit) {
			const words = answerText.split(/\s+/).filter(Boolean);
			if (words.length > submission.problem.writtenQuestion.wordLimit) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					`Your answer exceeds the maximum allowed word limit of ${submission.problem.writtenQuestion.wordLimit} words (current: ${words.length} words).`,
				);
			}
		}

		marks = null;
		isCorrect = null;
		submissionStatus = SubmissionStatus.PENDING;
	} else if (submission.problem.type === ProblemType.CODING) {
		if (!sourceCode) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Source code is required for this coding question.",
			);
		}

		if (!language) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Programming language must be specified for this coding question.",
			);
		}

		if (
			submission.problem.codingQuestion?.supportedLanguages &&
			submission.problem.codingQuestion.supportedLanguages.length > 0
		) {
			const isLangSupported =
				submission.problem.codingQuestion.supportedLanguages.some(
					(l) => l.toLowerCase() === language.toLowerCase(),
				);

			if (!isLangSupported) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					`Language '${language}' is not supported. Allowed languages: ${submission.problem.codingQuestion.supportedLanguages.join(", ")}.`,
				);
			}
		}

		marks = null;
		isCorrect = null;
		submissionStatus = SubmissionStatus.PENDING;
	}

	// 6. Update submission record
	const updatedSubmission = await prisma.submission.update({
		where: { id: submission.id },
		data: {
			selectedOptionId,
			answerText,
			sourceCode,
			language,
			status: submissionStatus,
			marks,
			isCorrect,
			submittedAt: new Date(),
		},
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
	});

	let finalSubmission = updatedSubmission;

	// Automatically run Judge0 evaluation if the problem is a CODING problem
	if (submission.problem.type === ProblemType.CODING) {
		try {
			await CodingEvaluationService.evaluateCodingSubmission(
				submission.id,
				user.userId,
			);
			// Fetch the evaluated submission with updated stats & marks
			const evaluated = await prisma.submission.findUnique({
				where: { id: submission.id },
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
			});
			if (evaluated) {
				finalSubmission = evaluated;
			}
		} catch (error) {
			console.error("Automated Judge0 evaluation error:", error);
		}
	} else if (submission.problem.type === ProblemType.MCQ) {
		try {
			await MCQEvaluationService.evaluateMCQSubmission(
				submission.id,
				user.userId,
				isCandidateOwner,
			);
			// Fetch the evaluated submission with updated stats & marks
			const evaluated = await prisma.submission.findUnique({
				where: { id: submission.id },
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
			});
			if (evaluated) {
				finalSubmission = evaluated;
			}
		} catch (error) {
			console.error("Automated MCQ evaluation error:", error);
		}
	}

	// 7. Security: Conceal evaluation scores for active candidates
	if (
		isCandidateOwner &&
		submission.attempt.status === AttemptStatus.IN_PROGRESS
	) {
		const { marks: _m, isCorrect: _c, ...safeSubmission } = finalSubmission;
		return safeSubmission;
	}

	return finalSubmission;
};

export const SubmissionService = {
	createSubmission,
	submitSubmission,
	getSubmissionById,
	getAttemptSubmissions,
	getMySubmissions,
};
