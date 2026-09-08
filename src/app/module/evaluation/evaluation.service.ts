import httpStatus from "http-status";
import {
	EvaluationStatus,
	EvaluationType,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { CodingEvaluationService } from "./codingEvaluation.service";
import type {
	IEvaluationFilterQuery,
	IManualEvaluationPayload,
} from "./evaluation.interface";

/**
 * Evaluates a coding submission using Judge0 CE sandbox execution.
 */
const evaluateCodingSubmission = async (
	user: RequestUser,
	submissionId: string,
) => {
	// Verify user permissions (Evaluator, Admin, Super Admin, or Assessment Creator)
	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			attempt: {
				include: {
					assessment: true,
				},
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	const isCandidateOwner = submission.attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		user.companyId &&
		user.companyId === submission.attempt.assessment.companyId;
	const isAssessmentCreator =
		submission.attempt.assessment.creatorId === user.userId;

	if (
		!isCandidateOwner &&
		!isPlatformAdmin &&
		!isCompanyMember &&
		!isAssessmentCreator
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to trigger evaluation for this submission.",
		);
	}

	return await CodingEvaluationService.evaluateCodingSubmission(
		submissionId,
		user.userId,
	);
};

/**
 * Performs manual evaluation for written questions or manual grading for coding submissions.
 */
const manualEvaluateSubmission = async (
	user: RequestUser,
	submissionId: string,
	payload: IManualEvaluationPayload,
) => {
	if (
		payload.marks === undefined ||
		payload.marks === null ||
		payload.marks < 0
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Valid non-negative marks must be provided for manual evaluation.",
		);
	}

	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: true,
			attempt: {
				include: {
					assessment: {
						include: {
							problems: true,
						},
					},
				},
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		user.companyId &&
		user.companyId === submission.attempt.assessment.companyId;
	const isAssessmentCreator =
		submission.attempt.assessment.creatorId === user.userId;

	if (!isPlatformAdmin && !isCompanyMember && !isAssessmentCreator) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to manually evaluate this submission.",
		);
	}

	const assessmentProblem = submission.attempt.assessment.problems.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const maxMarks = assessmentProblem?.marks ?? submission.problem.marks;

	if (payload.marks > maxMarks) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Assigned marks (${payload.marks}) cannot exceed the maximum allowed marks (${maxMarks}) for this problem.`,
		);
	}

	const isCorrect = payload.marks === maxMarks;

	// Update Submission outcome
	await prisma.submission.update({
		where: { id: submission.id },
		data: {
			marks: payload.marks,
			isCorrect,
			status: SubmissionStatus.EVALUATED,
		},
	});

	// Create or update MANUAL Evaluation entry
	const existingEvaluation = await prisma.evaluation.findFirst({
		where: {
			submissionId: submission.id,
			type: EvaluationType.MANUAL,
		},
	});

	if (existingEvaluation) {
		return await prisma.evaluation.update({
			where: { id: existingEvaluation.id },
			data: {
				marks: payload.marks,
				feedback: payload.feedback?.trim() || null,
				evaluatorId: user.userId,
				status: EvaluationStatus.COMPLETED,
				evaluatedAt: new Date(),
			},
			include: {
				submission: true,
				evaluator: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
			},
		});
	}

	return await prisma.evaluation.create({
		data: {
			submissionId: submission.id,
			evaluatorId: user.userId,
			type: EvaluationType.MANUAL,
			status: EvaluationStatus.COMPLETED,
			marks: payload.marks,
			feedback: payload.feedback?.trim() || null,
			evaluatedAt: new Date(),
		},
		include: {
			submission: true,
			evaluator: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	});
};

/**
 * Retrieves a paginated list of evaluations with optional filters.
 */
const getAllEvaluations = async (
	user: RequestUser,
	query: IEvaluationFilterQuery = {},
) => {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
	const skip = (page - 1) * limit;

	const whereCondition: Record<string, unknown> = {};

	if (query.submissionId) {
		whereCondition.submissionId = query.submissionId;
	}
	if (query.evaluatorId) {
		whereCondition.evaluatorId = query.evaluatorId;
	}
	if (query.type) {
		whereCondition.type = query.type;
	}
	if (query.status) {
		whereCondition.status = query.status;
	}

	// Non-admin company members are restricted to their company's assessments
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

	if (!isPlatformAdmin) {
		if (user.companyId) {
			whereCondition.submission = {
				attempt: {
					assessment: {
						companyId: user.companyId,
					},
				},
			};
		} else {
			// Candidates can only see their own evaluations
			whereCondition.submission = {
				attempt: {
					candidateId: user.userId,
				},
			};
		}
	}

	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const [total, evaluations] = await Promise.all([
		prisma.evaluation.count({ where: whereCondition }),
		prisma.evaluation.findMany({
			where: whereCondition,
			skip,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				submission: {
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
								candidateId: true,
								status: true,
							},
						},
					},
				},
				evaluator: {
					select: {
						id: true,
						name: true,
						email: true,
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
		data: evaluations,
	};
};

/**
 * Retrieves a single evaluation by ID.
 */
const getEvaluationById = async (user: RequestUser, id: string) => {
	const evaluation = await prisma.evaluation.findUnique({
		where: { id },
		include: {
			submission: {
				include: {
					problem: true,
					attempt: {
						include: {
							candidate: {
								select: {
									id: true,
									name: true,
									email: true,
								},
							},
							assessment: true,
						},
					},
				},
			},
			evaluator: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
		},
	});

	if (!evaluation) {
		throw new AppError(httpStatus.NOT_FOUND, "Evaluation not found.");
	}

	const isCandidateOwner =
		evaluation.submission.attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		user.companyId &&
		user.companyId === evaluation.submission.attempt.assessment.companyId;

	if (!isCandidateOwner && !isPlatformAdmin && !isCompanyMember) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to view this evaluation.",
		);
	}

	return evaluation;
};

export const EvaluationService = {
	evaluateCodingSubmission,
	manualEvaluateSubmission,
	getAllEvaluations,
	getEvaluationById,
};

export { CodingEvaluationService };
