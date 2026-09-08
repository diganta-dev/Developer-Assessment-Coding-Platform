import httpStatus from "http-status";
import {
	CompanyMemberRole,
	ProblemType,
	TestCaseType,
	UserRole,
} from "../../../generated/prisma/enums";
import type { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	ICreateProblemPayload,
	IPaginationOptions,
	IProblemFilterRequest,
	IUpdateProblemPayload,
} from "./problem.interface";
import type { ProblemWhereInput } from "../../../generated/prisma/models";

// Standard relation inclusion for detailed problem response
const problemInclude = {
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
	createdBy: {
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
		},
	},
	company: {
		select: {
			id: true,
			name: true,
			slug: true,
		},
	},
};

/**
 * Validates whether the user is authorized to create a problem for the specified company.
 * - Platform Admins (SUPER_ADMIN, ADMIN) can create global problems or problems for any company.
 * - Company Members (COMPANY_OWNER, COMPANY_ADMIN, ASSESSMENT_CREATOR) can only create problems for their company.
 */
const resolveAndVerifyCompanyAccess = async (
	user: RequestUser,
	requestedCompanyId?: string,
): Promise<string | null> => {
	const targetCompanyId = requestedCompanyId || user.companyId || null;

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (isPlatformAdmin) {
		if (targetCompanyId) {
			const company = await prisma.company.findUnique({
				where: { id: targetCompanyId },
			});
			if (!company) {
				throw new AppError(httpStatus.NOT_FOUND, "Target company not found");
			}
		}
		return targetCompanyId;
	}

	// For regular users / candidates
	if (!targetCompanyId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. Only platform administrators can create global problems.",
		);
	}

	// Verify user's membership and permission within the company
	const membership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: user.userId,
				companyId: targetCompanyId,
			},
		},
	});

	const allowedCompanyRoles: CompanyMemberRole[] = [
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	];

	if (!membership || !allowedCompanyRoles.includes(membership.role)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to create assessment problems for this company.",
		);
	}

	return targetCompanyId;
};

/**
 * Creates a new Problem with its corresponding type-specific relation (MCQ, CODING, or WRITTEN).
 * All nested creations run atomically in a database transaction.
 */
const createProblem = async (
	user: RequestUser,
	payload: ICreateProblemPayload,
) => {
	// 1. Authorize user & resolve tenant company
	const companyId = await resolveAndVerifyCompanyAccess(
		user,
		payload.companyId,
	);

	const baseProblemData = {
		title: payload.title.trim(),
		description: payload.description,
		type: payload.type,
		difficulty: payload.difficulty,
		marks: payload.marks ?? 1,
		createdById: user.userId,
		companyId,
	};

	// 2. Atomic creation based on Problem Type
	switch (payload.type) {
		case ProblemType.MCQ: {
			if (!payload.mcq?.options?.length) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"MCQ problem requires options details",
				);
			}

			if (payload.mcq.options.length < 2) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"MCQ must have at least 2 options",
				);
			}

			const hasCorrectOption = payload.mcq.options.some((opt) => opt.isCorrect);
			if (!hasCorrectOption) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"At least one MCQ option must be marked as correct",
				);
			}

			// Ensure sequential unique optionOrder to respect database constraint @@unique([mcqQuestionId, optionOrder]) 
			const normalizedOptions = payload.mcq.options.map((opt, index) => ({
				optionText: opt.optionText.trim(),
				isCorrect: Boolean(opt.isCorrect),
				optionOrder:
					typeof opt.optionOrder === "number" ? opt.optionOrder : index + 1,
			}));

			const orderSet = new Set(normalizedOptions.map((o) => o.optionOrder));
			if (orderSet.size !== normalizedOptions.length) {
				normalizedOptions.forEach((opt, idx) => {
					opt.optionOrder = idx + 1;
				});
			}

			return await prisma.problem.create({
				data: {
					...baseProblemData,
					mcqQuestion: {
						create: {
							explanation: payload.mcq.explanation,
							options: {
								create: normalizedOptions,
							},
						},
					},
				},
				include: problemInclude,
			});
		}

		case ProblemType.CODING: {
			if (!payload.coding) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Coding problem details are required",
				);
			}

			const testCasesData =
				payload.coding.testCases?.map((tc) => ({
					type: tc.type,
					input: tc.input,
					expectedOutput: tc.expectedOutput,
					timeLimitMs: tc.timeLimitMs,
					memoryLimitMb: tc.memoryLimitMb,
				})) || [];

			return await prisma.problem.create({
				data: {
					...baseProblemData,
					codingQuestion: {
						create: {
							inputFormat: payload.coding.inputFormat,
							outputFormat: payload.coding.outputFormat,
							constraints: payload.coding.constraints,
							starterCode: payload.coding.starterCode,
							supportedLanguages: payload.coding.supportedLanguages || [],
							timeLimitMs: payload.coding.timeLimitMs || 2000,
							memoryLimitMb: payload.coding.memoryLimitMb || 256,
							testCases:
								testCasesData.length > 0
									? {
											create: testCasesData,
										}
									: undefined,
						},
					},
				},
				include: problemInclude,
			});
		}

		case ProblemType.WRITTEN: {
			return await prisma.problem.create({
				data: {
					...baseProblemData,
					writtenQuestion: {
						create: {
							wordLimit: payload.written?.wordLimit,
							expectedAnswer: payload.written?.expectedAnswer,
						},
					},
				},
				include: problemInclude,
			});
		}

		default: {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Unsupported problem type: ${payload.type}`,
			);
		}
	}
};

/**
 * Retrieves all problems across the platform with filtering, search, and pagination.
 * Restricted strictly to Platform Administrators (SUPER_ADMIN, ADMIN).
 */
const getAllProblems = async (
	user: RequestUser,
	filters: IProblemFilterRequest = {},
	options: IPaginationOptions = {},
) => {
	// 1. Strict RBAC: Only Platform SUPER_ADMIN and ADMIN can access all platform problems
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. Only platform administrators can access all problems.",
		);
	}

	const { searchTerm, type, difficulty, companyId, createdById } = filters;

	// 2. Pagination setup
	const page = Math.max(1, Number(options.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
	const skip = (page - 1) * limit;

	const sortBy = options.sortBy || "createdAt";
	const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

	// 3. Build dynamic WHERE conditions
	const andConditions: ProblemWhereInput[] = [];

	if (searchTerm?.trim()) {
		andConditions.push({
			OR: [
				{
					title: {
						contains: searchTerm.trim(),
						mode: "insensitive",
					},
				},
				{
					description: {
						contains: searchTerm.trim(),
						mode: "insensitive",
					},
				},
			],
		});
	}

	if (type) {
		andConditions.push({ type });
	}

	if (difficulty) {
		andConditions.push({ difficulty });
	}

	if (companyId) {
		andConditions.push({ companyId });
	}

	if (createdById) {
		andConditions.push({ createdById });
	}

	const where: ProblemWhereInput =
		andConditions.length > 0 ? { AND: andConditions } : {};

	// 4. Concurrent execution for count and data fetch
	const [total, data] = await Promise.all([
		prisma.problem.count({ where }),
		prisma.problem.findMany({
			where,
			include: problemInclude,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
		}),
	]);

	const totalPages = Math.ceil(total / limit) || 1;

	return {
		meta: {
			page,
			limit,
			total,
			totalPages,
		},
		data,
	};
};

/**
 * Retrieves problems created by the logged-in user's company.
 * Restricted strictly to the company's:
 * - COMPANY_OWNER
 * - COMPANY_ADMIN
 * - ASSESSMENT_CREATOR
 */
const getCompanyProblems = async (
	user: RequestUser,
	filters: IProblemFilterRequest = {},
	options: IPaginationOptions = {},
) => {
	// 1. Verify user's membership and allowed roles in their company
	const allowedRoles: CompanyMemberRole[] = [
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	];

	const membership = await prisma.companyMember.findFirst({
		where: {
			userId: user.userId,
			...(user.companyId ? { companyId: user.companyId } : {}),
		},
	});

	if (!membership) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. You do not belong to any company.",
		);
	}

	if (!allowedRoles.includes(membership.role)) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Forbidden. Only company owners, admins, and assessment creators can access company problems.",
		);
	}

	const targetCompanyId = membership.companyId;

	// 2. Verify company exists
	const company = await prisma.company.findUnique({
		where: { id: targetCompanyId },
		select: { id: true, name: true, slug: true },
	});

	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	// 3. Pagination & Sorting setup
	const page = Math.max(1, Number(options.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(options.limit) || 10));
	const skip = (page - 1) * limit;

	const sortBy = options.sortBy || "createdAt";
	const sortOrder = options.sortOrder === "asc" ? "asc" : "desc";

	// 4. Build WHERE conditions strictly scoped to the user's company
	const andConditions:ProblemWhereInput[] = [
		{ companyId: targetCompanyId },
	];

	if (filters.searchTerm?.trim()) {
		andConditions.push({
			OR: [
				{
					title: {
						contains: filters.searchTerm.trim(),
						mode: "insensitive",
					},
				},
				{
					description: {
						contains: filters.searchTerm.trim(),
						mode: "insensitive",
					},
				},
			],
		});
	}

	if (filters.type) {
		andConditions.push({ type: filters.type });
	}

	if (filters.difficulty) {
		andConditions.push({ difficulty: filters.difficulty });
	}

	if (filters.createdById) {
		andConditions.push({ createdById: filters.createdById });
	}

	const where:ProblemWhereInput = { AND: andConditions };

	// 5. Execute count and findMany in parallel
	const [total, data] = await Promise.all([
		prisma.problem.count({ where }),
		prisma.problem.findMany({
			where,
			include: problemInclude,
			skip,
			take: limit,
			orderBy: {
				[sortBy]: sortOrder,
			},
		}),
	]);

	const totalPages = Math.ceil(total / limit) || 1;

	return {
		meta: {
			page,
			limit,
			total,
			totalPages,
		},
		company,
		data,
	};
};

/**
 * Retrieves a single problem by ID with full nested details (options, test cases, written details).
 * Multi-tenant access rules:
 * - Global platform problems (companyId is null) can be viewed by authenticated users.
 * - Company-scoped problems can be viewed by Platform Admins or authorized members of that specific company.
 */
const getSingleProblem = async (user: RequestUser, id: string) => {
	const problem = await prisma.problem.findUnique({
		where: { id },
		include: problemInclude,
	});

	if (!problem) {
		throw new AppError(httpStatus.NOT_FOUND, "Problem not found");
	}

	// If the problem belongs to a company, verify authorization
	if (problem.companyId) {
		const isPlatformAdmin =
			user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

		if (!isPlatformAdmin) {
			const membership = await prisma.companyMember.findUnique({
				where: {
					userId_companyId: {
						userId: user.userId,
						companyId: problem.companyId,
					},
				},
			});

			const allowedRoles: CompanyMemberRole[] = [
				CompanyMemberRole.COMPANY_OWNER,
				CompanyMemberRole.COMPANY_ADMIN,
				CompanyMemberRole.ASSESSMENT_CREATOR,
				CompanyMemberRole.EVALUATOR,
			];

			if (!membership || !allowedRoles.includes(membership.role)) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You do not have permission to view this problem.",
				);
			}
		}
	}

	return problem;
};

/**
 * Updates an existing problem and its type-specific nested data atomically.
 * Authorization rules:
 * - Global platform problems can only be updated by Platform Admins (SUPER_ADMIN, ADMIN).
 * - Company problems can be updated by Platform Admins or authorized company members (OWNER, ADMIN, CREATOR).
 * - Problem type (MCQ, CODING, WRITTEN) cannot be changed after creation.
 */
const updateProblem = async (
	user: RequestUser,
	id: string,
	payload: IUpdateProblemPayload,
) => {
	// 1. Fetch existing problem with type relations
	const existingProblem = await prisma.problem.findUnique({
		where: { id },
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
	});

	if (!existingProblem) {
		throw new AppError(httpStatus.NOT_FOUND, "Problem not found");
	}

	// 2. Authorization & RBAC check
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (existingProblem.companyId) {
		// Company-specific problem
		if (!isPlatformAdmin) {
			const membership = await prisma.companyMember.findUnique({
				where: {
					userId_companyId: {
						userId: user.userId,
						companyId: existingProblem.companyId,
					},
				},
			});

			const allowedRoles: CompanyMemberRole[] = [
				CompanyMemberRole.COMPANY_OWNER,
				CompanyMemberRole.COMPANY_ADMIN,
				CompanyMemberRole.ASSESSMENT_CREATOR,
			];

			if (!membership || !allowedRoles.includes(membership.role)) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You do not have permission to modify this company's problems.",
				);
			}
		}
	} else {
		// Global problem: strictly platform administrators only
		if (!isPlatformAdmin) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. Only platform administrators can modify global problems.",
			);
		}
	}

	// 3. Immutability check: Problem type cannot be altered
	if (payload.type && payload.type !== existingProblem.type) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Problem type cannot be changed after creation.",
		);
	}

	// 4. Atomic transaction update
	return await prisma.$transaction(async (tx) => {
		// Update common base problem fields
		const baseUpdateData: Prisma.ProblemUpdateInput = {};

		if (payload.title !== undefined) {
			baseUpdateData.title = payload.title.trim();
		}
		if (payload.description !== undefined) {
			baseUpdateData.description = payload.description;
		}
		if (payload.difficulty !== undefined) {
			baseUpdateData.difficulty = payload.difficulty;
		}
		if (payload.marks !== undefined) {
			baseUpdateData.marks = payload.marks;
		}

		// Update type-specific nested data
		switch (existingProblem.type) {
			case ProblemType.MCQ: {
				if (payload.mcq) {
					const mcqQuestionId = existingProblem.mcqQuestion?.id;

					// If new options are provided, validate and replace atomically
					if (payload.mcq.options && mcqQuestionId) {
						if (payload.mcq.options.length < 2) {
							throw new AppError(
								httpStatus.BAD_REQUEST,
								"MCQ must have at least 2 options",
							);
						}

						const hasCorrectOption = payload.mcq.options.some(
							(opt) => opt.isCorrect,
						);
						if (!hasCorrectOption) {
							throw new AppError(
								httpStatus.BAD_REQUEST,
								"At least one MCQ option must be marked as correct",
							);
						}

						// Delete old options and insert normalized new options
						await tx.mCQOption.deleteMany({
							where: { mcqQuestionId },
						});

						const normalizedOptions = payload.mcq.options.map(
							(opt, index) => ({
								mcqQuestionId,
								optionText: opt.optionText ? opt.optionText.trim() : "",
								isCorrect: Boolean(opt.isCorrect),
								optionOrder:
									typeof opt.optionOrder === "number"
										? opt.optionOrder
										: index + 1,
							}),
						);

						// Ensure sequential unique optionOrder
						const orderSet = new Set(
							normalizedOptions.map((o) => o.optionOrder),
						);
						if (orderSet.size !== normalizedOptions.length) {
							normalizedOptions.forEach((opt, idx) => {
								opt.optionOrder = idx + 1;
							});
						}

						await tx.mCQOption.createMany({
							data: normalizedOptions,
						});
					}

					if (payload.mcq.explanation !== undefined) {
						await tx.mCQQuestion.update({
							where: { problemId: id },
							data: {
								explanation: payload.mcq.explanation,
							},
						});
					}
				}
				break;
			}

			case ProblemType.CODING: {
				if (payload.coding) {
					const codingQuestionId = existingProblem.codingQuestion?.id;

					// If new test cases are provided, replace cleanly
					if (payload.coding.testCases && codingQuestionId) {
						await tx.testCase.deleteMany({
							where: { codingQuestionId },
						});

						if (payload.coding.testCases.length > 0) {
							await tx.testCase.createMany({
								data: payload.coding.testCases.map((tc) => ({
									codingQuestionId,
									type: tc.type || TestCaseType.PUBLIC,
									input: tc.input ?? "",
									expectedOutput: tc.expectedOutput ?? "",
									timeLimitMs: tc.timeLimitMs,
									memoryLimitMb: tc.memoryLimitMb,
								})),
							});
						}
					}

					const codingUpdateData: Prisma.CodingQuestionUpdateInput = {};
					if (payload.coding.inputFormat !== undefined) {
						codingUpdateData.inputFormat = payload.coding.inputFormat;
					}
					if (payload.coding.outputFormat !== undefined) {
						codingUpdateData.outputFormat = payload.coding.outputFormat;
					}
					if (payload.coding.constraints !== undefined) {
						codingUpdateData.constraints = payload.coding.constraints;
					}
					if (payload.coding.starterCode !== undefined) {
						codingUpdateData.starterCode = payload.coding.starterCode;
					}
					if (payload.coding.supportedLanguages !== undefined) {
						codingUpdateData.supportedLanguages =
							payload.coding.supportedLanguages;
					}
					if (payload.coding.timeLimitMs !== undefined) {
						codingUpdateData.timeLimitMs = payload.coding.timeLimitMs;
					}
					if (payload.coding.memoryLimitMb !== undefined) {
						codingUpdateData.memoryLimitMb = payload.coding.memoryLimitMb;
					}

					if (Object.keys(codingUpdateData).length > 0) {
						await tx.codingQuestion.update({
							where: { problemId: id },
							data: codingUpdateData,
						});
					}
				}
				break;
			}

			case ProblemType.WRITTEN: {
				if (payload.written) {
					const writtenUpdateData: Prisma.WrittenQuestionUpdateInput = {};
					if (payload.written.wordLimit !== undefined) {
						writtenUpdateData.wordLimit = payload.written.wordLimit;
					}
					if (payload.written.expectedAnswer !== undefined) {
						writtenUpdateData.expectedAnswer = payload.written.expectedAnswer;
					}

					if (Object.keys(writtenUpdateData).length > 0) {
						await tx.writtenQuestion.update({
							where: { problemId: id },
							data: writtenUpdateData,
						});
					}
				}
				break;
			}
		}

		// Update base problem
		return await tx.problem.update({
			where: { id },
			data: baseUpdateData,
			include: problemInclude,
		});
	});
};

/**
 * Deletes a problem from the problem bank.
 * Safety & Integrity rules:
 * - Prevents deletion if the problem is already linked to any Assessment or Candidate Submissions.
 * Authorization rules:
 * - Global platform problems: Platform Admins only (SUPER_ADMIN, ADMIN).
 * - Company problems: Platform Admins or Company Owner/Admin/Creator.
 */
const deleteProblem = async (user: RequestUser, id: string) => {
	// 1. Fetch problem to verify existence and check relational usage
	const problem = await prisma.problem.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					assessmentProblems: true,
					submissions: true,
				},
			},
		},
	});

	if (!problem) {
		throw new AppError(httpStatus.NOT_FOUND, "Problem not found");
	}

	// 2. Multi-tenancy & Authorization check
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (problem.companyId) {
		if (!isPlatformAdmin) {
			const membership = await prisma.companyMember.findUnique({
				where: {
					userId_companyId: {
						userId: user.userId,
						companyId: problem.companyId,
					},
				},
			});

			const allowedRoles: CompanyMemberRole[] = [
				CompanyMemberRole.COMPANY_OWNER,
				CompanyMemberRole.COMPANY_ADMIN,
				CompanyMemberRole.ASSESSMENT_CREATOR,
			];

			if (!membership || !allowedRoles.includes(membership.role)) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You do not have permission to delete this company's problems.",
				);
			}
		}
	} else {
		// Global problem: Strictly platform administrators
		if (!isPlatformAdmin) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. Only platform administrators can delete global problems.",
			);
		}
	}

	// 3. Relational integrity check: Ensure problem is not in an active assessment or has submissions
	if (problem._count.assessmentProblems > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot delete problem. It is currently linked to ${problem._count.assessmentProblems} assessment(s). Please remove it from assessments first.`,
		);
	}

	if (problem._count.submissions > 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot delete problem. Candidates have already submitted responses for this problem (${problem._count.submissions} submission(s)).`,
		);
	}

	// 4. Cascade delete (cleans up mcqQuestion, codingQuestion, writtenQuestion, etc.)
	await prisma.problem.delete({
		where: { id },
	});

	return {
		id: problem.id,
		title: problem.title,
		type: problem.type,
	};
};

export const ProblemService = {
	createProblem,
	getAllProblems,
	getCompanyProblems,
	getSingleProblem,
	updateProblem,
	deleteProblem,
};
