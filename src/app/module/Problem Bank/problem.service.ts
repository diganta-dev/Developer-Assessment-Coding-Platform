import httpStatus from "http-status";
import {
	CompanyMemberRole,
	ProblemType,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type { ICreateProblemPayload } from "./problem.interface";

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

export const ProblemService = {
	createProblem,
};
