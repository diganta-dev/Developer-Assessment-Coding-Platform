import httpStatus from "http-status";
import {
	AttemptStatus,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { AttemptScoreService } from "./attemptScore.service";
import type {
	IWrittenEvaluationPayload,
	IWrittenEvaluationResult,
} from "./evaluation.interface";

/**
 * Evaluates a candidate's written submission by validating assigned marks,
 * computing word count analytics, and persisting evaluation feedback.
 */
const evaluateWrittenSubmission = async (
	user: RequestUser,
	submissionId: string,
	payload: IWrittenEvaluationPayload,
): Promise<IWrittenEvaluationResult> => {
	const marks = Number(payload.marks);
	if (
		payload.marks === undefined ||
		payload.marks === null ||
		Number.isNaN(marks) ||
		marks < 0
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"A valid non-negative number must be provided for marks.",
		);
	}

	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: {
				include: {
					writtenQuestion: true,
				},
			},
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

	// Security: Candidates cannot grade their own written work
	const isCandidateOwner = submission.attempt.candidateId === user.userId;
	if (isCandidateOwner) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Candidates are not permitted to grade their own written submissions.",
		);
	}

	// Evaluator authorization: Platform Admin, Assessment Creator, or Company Member
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		Boolean(user.companyId) &&
		user.companyId === submission.attempt.assessment.companyId;
	const isAssessmentCreator =
		submission.attempt.assessment.creatorId === user.userId;

	if (!isPlatformAdmin && !isCompanyMember && !isAssessmentCreator) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to evaluate this written submission.",
		);
	}

	if (submission.problem.type !== ProblemType.WRITTEN) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Automatic written evaluation only applies to WRITTEN problems (received ${submission.problem.type}).`,
		);
	}

	const writtenQuestion = submission.problem.writtenQuestion;
	if (!writtenQuestion) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Written question configuration not found for this problem.",
		);
	}

	// Resolve maximum allowable marks from assessment override or problem base marks
	const assessmentProblem = submission.attempt.assessment.problems.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const maxMarks = assessmentProblem?.marks ?? submission.problem.marks;

	if (marks > maxMarks) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Assigned marks (${marks}) cannot exceed the maximum allowed marks (${maxMarks}) for this question.`,
		);
	}

	// Text length and word limit metrics
	const rawText = submission.answerText?.trim() || "";
	const wordCount =
		rawText === "" ? 0 : rawText.split(/\s+/).filter(Boolean).length;
	const wordLimit = writtenQuestion.wordLimit ?? null;
	const isWordLimitExceeded = wordLimit !== null && wordCount > wordLimit;

	const isCorrect = marks === maxMarks;
	const feedback = payload.feedback?.trim() || null;

	// Atomically persist submission status and upsert manual evaluation record
	const [, evaluation] = await prisma.$transaction(async (tx) => {
		const updatedSubmission = await tx.submission.update({
			where: { id: submission.id },
			data: {
				marks,
				isCorrect,
				status: SubmissionStatus.EVALUATED,
			},
		});

		const existingEvaluation = await tx.evaluation.findFirst({
			where: {
				submissionId: submission.id,
				type: EvaluationType.MANUAL,
			},
		});

		const evaluationRecord = existingEvaluation
			? await tx.evaluation.update({
					where: { id: existingEvaluation.id },
					data: {
						marks,
						feedback,
						status: EvaluationStatus.COMPLETED,
						evaluatorId: user.userId,
						evaluatedAt: new Date(),
					},
					include: {
						evaluator: {
							select: {
								id: true,
								name: true,
								email: true,
							},
						},
					},
				})
			: await tx.evaluation.create({
					data: {
						submissionId: submission.id,
						evaluatorId: user.userId,
						type: EvaluationType.MANUAL,
						status: EvaluationStatus.COMPLETED,
						marks,
						feedback,
						evaluatedAt: new Date(),
					},
					include: {
						evaluator: {
							select: {
								id: true,
								name: true,
								email: true,
							},
						},
					},
				});

		return [updatedSubmission, evaluationRecord];
	});

	// If the attempt is submitted or expired, refresh the total attempt score
	if (
		submission.attempt.status === AttemptStatus.SUBMITTED ||
		submission.attempt.status === AttemptStatus.EXPIRED
	) {
		try {
			await AttemptScoreService.calculateAttemptScore(submission.attemptId);
		} catch {
			// Non-blocking
		}
	}

	return {
		submissionId: submission.id,
		problemId: submission.problemId,
		answerText: submission.answerText,
		wordCount,
		wordLimit,
		isWordLimitExceeded,
		expectedAnswer: writtenQuestion.expectedAnswer,
		earnedMarks: marks,
		totalMarks: maxMarks,
		isCorrect,
		status: SubmissionStatus.EVALUATED,
		feedback: evaluation.feedback,
		evaluationId: evaluation.id,
		evaluator: evaluation.evaluator
			? {
					id: evaluation.evaluator.id,
					name: evaluation.evaluator.name,
					email: evaluation.evaluator.email,
				}
			: {
					id: user.userId,
					name: "Evaluator",
					email: user.email,
				},
	};
};

export const WrittenEvaluationService = {
	evaluateWrittenSubmission,
};
