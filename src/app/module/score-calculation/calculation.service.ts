import httpStatus from "http-status";
import {
	AttemptStatus,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
	TestCaseType,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { AttemptScoreService } from "../evaluation/attemptScore.service";
import { CodingEvaluationService } from "../evaluation/codingEvaluation.service";
import { MCQEvaluationService } from "../evaluation/mcqEvaluation.service";
import type {
	IAttemptScoreResult,
	ITestCaseExecutionResult,
} from "../evaluation/evaluation.interface";
import type {
	ICodingScoreBreakdown,
	IMCQScoreBreakdown,
	ISubmissionScoreResult,
	IWrittenScoreBreakdown,
} from "./calculation.interface";

// ============================================================================
// Types & Interfaces
// ============================================================================



// ============================================================================
// Helper: Access Control & Anti-Cheating
// ============================================================================

/**
 * Validates that the requesting user has permission to view score metrics.
 * Permitted roles:
 * - Candidate who owns the assessment attempt
 * - Assessment creator
 * - Company recruiter / admin belonging to the assessment company
 * - Platform Super Admin / Admin
 */
function verifyScoreAccess(
	user: RequestUser | undefined,
	attempt: {
		candidateId: string;
		assessment: { companyId: string; creatorId: string };
	},
	resourceName = "score metrics",
): { isCandidateOwner: boolean } {
	if (!user) {
		return { isCandidateOwner: false };
	}

	const isCandidateOwner = attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		Boolean(user.companyId) &&
		user.companyId === attempt.assessment.companyId;
	const isAssessmentCreator = attempt.assessment.creatorId === user.userId;

	if (
		!isCandidateOwner &&
		!isPlatformAdmin &&
		!isCompanyMember &&
		!isAssessmentCreator
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to access ${resourceName}.`,
		);
	}

	return { isCandidateOwner };
}

// ============================================================================
// 1. calculateCodingScore
// ============================================================================

/**
 * Calculates granular score metrics for a Coding submission.
 * Breaks down test cases into public vs hidden, performance stats, and marks.
 */
const calculateCodingScore = async (
	submissionId: string,
	user?: RequestUser,
): Promise<ICodingScoreBreakdown> => {
	if (!submissionId || submissionId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Submission ID is required.");
	}

	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: {
				include: {
					codingQuestion: {
						include: {
							testCases: true,
						},
					},
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
			evaluations: {
				where: { type: EvaluationType.AUTOMATIC },
				orderBy: { createdAt: "desc" },
				take: 1,
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	if (submission.problem.type !== ProblemType.CODING) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Problem is of type '${submission.problem.type}'. calculateCodingScore only applies to CODING problems.`,
		);
	}

	const { isCandidateOwner } = verifyScoreAccess(
		user,
		submission.attempt,
		"this coding score",
	);

	let currentSubmission = submission;

	// Lazy evaluation: If submission has not been run or evaluated yet, trigger evaluation
	const isUnevaluated =
		submission.status === SubmissionStatus.PENDING ||
		submission.status === SubmissionStatus.RUNNING ||
		submission.marks === null ||
		submission.evaluations.length === 0;

	if (isUnevaluated) {
		await CodingEvaluationService.evaluateCodingSubmission(
			submission.id,
			user?.userId,
		);

		const refreshed = await prisma.submission.findUnique({
			where: { id: submissionId },
			include: {
				problem: {
					include: {
						codingQuestion: {
							include: {
								testCases: true,
							},
						},
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
				evaluations: {
					where: { type: EvaluationType.AUTOMATIC },
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
		});

		if (refreshed) {
			currentSubmission = refreshed;
		}
	}

	const assessmentProblem = currentSubmission.attempt.assessment.problems.find(
		(ap) => ap.problemId === currentSubmission.problemId,
	);
	const totalMarks =
		assessmentProblem?.marks ?? currentSubmission.problem.marks;

	const testResults =
		(currentSubmission.executionResult as unknown as ITestCaseExecutionResult[]) ||
		[];

	const publicTests = testResults.filter((t) => t.type === TestCaseType.PUBLIC);
	const hiddenTests = testResults.filter((t) => t.type === TestCaseType.HIDDEN);

	const publicTestsPassed = publicTests.filter((t) => t.passed).length;
	const hiddenTestsPassed = hiddenTests.filter((t) => t.passed).length;

	const earnedMarks = currentSubmission.marks ?? 0;
	const percentage =
		totalMarks > 0
			? Math.round((earnedMarks / totalMarks) * 100 * 100) / 100
			: 0;

	// Anti-cheating guard: Mask score details during active assessment
	const isLiveAssessment =
		isCandidateOwner &&
		currentSubmission.attempt.status === AttemptStatus.IN_PROGRESS;

	return {
		submissionId: currentSubmission.id,
		attemptId: currentSubmission.attemptId,
		problemId: currentSubmission.problemId,
		problemTitle: currentSubmission.problem.title,
		totalMarks,
		earnedMarks: isLiveAssessment ? 0 : earnedMarks,
		percentage: isLiveAssessment ? 0 : percentage,
		totalTestCases: testResults.length,
		passedTests: isLiveAssessment ? 0 : currentSubmission.passedTests,
		failedTests: isLiveAssessment ? 0 : currentSubmission.failedTests,
		publicTestsPassed,
		totalPublicTests: publicTests.length,
		hiddenTestsPassed: isLiveAssessment ? 0 : hiddenTestsPassed,
		totalHiddenTests: hiddenTests.length,
		executionTimeMs: currentSubmission.executionTimeMs ?? 0,
		memoryUsedMb: currentSubmission.memoryUsedMb ?? 0,
		isCorrect: isLiveAssessment ? false : Boolean(currentSubmission.isCorrect),
		status: currentSubmission.status,
		feedback: isLiveAssessment
			? "Coding solution executed. Final score will be displayed once assessment is completed."
			: (currentSubmission.evaluations[0]?.feedback ?? null),
	};
};

// ============================================================================
// 2. calculateMCQScore
// ============================================================================

/**
 * Calculates granular score metrics for an MCQ submission.
 * Resolves option choices, correctness, explanation, and earned marks.
 */
const calculateMCQScore = async (
	submissionId: string,
	user?: RequestUser,
): Promise<IMCQScoreBreakdown> => {
	if (!submissionId || submissionId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Submission ID is required.");
	}

	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: {
				include: {
					mcqQuestion: {
						include: {
							options: {
								orderBy: { optionOrder: "asc" },
							},
						},
					},
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
			evaluations: {
				where: { type: EvaluationType.AUTOMATIC },
				orderBy: { createdAt: "desc" },
				take: 1,
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	if (submission.problem.type !== ProblemType.MCQ) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Problem is of type '${submission.problem.type}'. calculateMCQScore only applies to MCQ problems.`,
		);
	}

	const { isCandidateOwner } = verifyScoreAccess(
		user,
		submission.attempt,
		"this MCQ score",
	);

	// Lazy evaluation: If submission has not been evaluated yet, trigger evaluation
	let currentSubmission = submission;
	if (
		submission.status === SubmissionStatus.PENDING ||
		submission.marks === null ||
		submission.evaluations.length === 0
	) {
		await MCQEvaluationService.evaluateMCQSubmission(
			submission.id,
			user?.userId,
			isCandidateOwner,
		);

		const refreshed = await prisma.submission.findUnique({
			where: { id: submissionId },
			include: {
				problem: {
					include: {
						mcqQuestion: {
							include: {
								options: {
									orderBy: { optionOrder: "asc" },
								},
							},
						},
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
				evaluations: {
					where: { type: EvaluationType.AUTOMATIC },
					orderBy: { createdAt: "desc" },
					take: 1,
				},
			},
		});

		if (refreshed) {
			currentSubmission = refreshed;
		}
	}

	const mcqQuestion = currentSubmission.problem.mcqQuestion;
	if (!mcqQuestion) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"MCQ question configuration not found for this problem.",
		);
	}

	const options = mcqQuestion.options || [];

	const assessmentProblem = currentSubmission.attempt.assessment.problems.find(
		(ap) => ap.problemId === currentSubmission.problemId,
	);
	const totalMarks =
		assessmentProblem?.marks ?? currentSubmission.problem.marks;

	const selectedOption = options.find(
		(opt) => opt.id === currentSubmission.selectedOptionId,
	);
	const correctOption = options.find((opt) => opt.isCorrect);

	const isCorrect = Boolean(
		currentSubmission.isCorrect ?? selectedOption?.isCorrect,
	);
	const earnedMarks = currentSubmission.marks ?? (isCorrect ? totalMarks : 0);
	const percentage =
		totalMarks > 0
			? Math.round((earnedMarks / totalMarks) * 100 * 100) / 100
			: 0;

	// Anti-cheating guard: Mask correct option and explanation during active attempt
	const isLiveAssessment =
		isCandidateOwner &&
		currentSubmission.attempt.status === AttemptStatus.IN_PROGRESS;

	const feedback =
		currentSubmission.evaluations[0]?.feedback ??
		(isCorrect ? "Correct answer." : "Incorrect answer.");

	return {
		submissionId: currentSubmission.id,
		attemptId: currentSubmission.attemptId,
		problemId: currentSubmission.problemId,
		problemTitle: currentSubmission.problem.title,
		totalMarks,
		earnedMarks: isLiveAssessment ? 0 : earnedMarks,
		percentage: isLiveAssessment ? 0 : percentage,
		selectedOptionId: currentSubmission.selectedOptionId,
		selectedOptionText: selectedOption?.optionText ?? null,
		correctOptionId: isLiveAssessment ? null : (correctOption?.id ?? null),
		correctOptionText: isLiveAssessment
			? null
			: (correctOption?.optionText ?? null),
		isCorrect: isLiveAssessment ? false : isCorrect,
		explanation: isLiveAssessment ? null : (mcqQuestion.explanation ?? null),
		feedback: isLiveAssessment ? "MCQ answer recorded." : feedback,
		status: currentSubmission.status,
	};
};

// ============================================================================
// 3. calculateWrittenScore
// ============================================================================

/**
 * Calculates granular score metrics for a Written submission.
 * Resolves word count checks, examiner feedback, marks, and model answer comparison.
 */
const calculateWrittenScore = async (
	submissionId: string,
	user?: RequestUser,
): Promise<IWrittenScoreBreakdown> => {
	if (!submissionId || submissionId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Submission ID is required.");
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
			evaluations: {
				where: { type: EvaluationType.MANUAL },
				orderBy: { createdAt: "desc" },
				take: 1,
				include: {
					evaluator: {
						select: { id: true, name: true, email: true },
					},
				},
			},
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	if (submission.problem.type !== ProblemType.WRITTEN) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Problem is of type '${submission.problem.type}'. calculateWrittenScore only applies to WRITTEN problems.`,
		);
	}

	const { isCandidateOwner } = verifyScoreAccess(
		user,
		submission.attempt,
		"this written score",
	);

	const assessmentProblem = submission.attempt.assessment.problems.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const totalMarks =
		assessmentProblem?.marks ?? submission.problem.marks;

	const writtenQuestion = submission.problem.writtenQuestion;
	const answerText = submission.answerText || "";
	const words = answerText.trim().split(/\s+/).filter(Boolean);
	const wordCount = answerText.trim() ? words.length : 0;
	const wordLimit = writtenQuestion?.wordLimit ?? null;
	const isWordLimitExceeded = Boolean(wordLimit && wordCount > wordLimit);

	const evaluation = submission.evaluations[0];
	const isGraded =
		Boolean(evaluation && evaluation.status === EvaluationStatus.COMPLETED);

	const earnedMarks = isGraded
		? (evaluation?.marks ?? 0)
		: (submission.marks ?? 0);

	const percentage =
		totalMarks > 0
			? Math.round((earnedMarks / totalMarks) * 100 * 100) / 100
			: 0;

	const isCorrect = isGraded
		? earnedMarks === totalMarks
		: Boolean(submission.isCorrect);

	const status = isGraded
		? SubmissionStatus.EVALUATED
		: submission.status;

	const evaluationStatus = evaluation?.status ?? EvaluationStatus.PENDING;
	const feedback =
		evaluation?.feedback ??
		(isGraded ? null : "Pending manual evaluation by reviewer.");

	// Anti-cheating guard: Mask model answer and marks during active attempt
	const isLiveAssessment =
		isCandidateOwner &&
		submission.attempt.status === AttemptStatus.IN_PROGRESS;

	return {
		submissionId: submission.id,
		attemptId: submission.attemptId,
		problemId: submission.problemId,
		problemTitle: submission.problem.title,
		totalMarks,
		earnedMarks: isLiveAssessment ? 0 : earnedMarks,
		percentage: isLiveAssessment ? 0 : percentage,
		answerText: submission.answerText,
		wordCount,
		wordLimit,
		isWordLimitExceeded,
		expectedAnswer: isLiveAssessment
			? null
			: (writtenQuestion?.expectedAnswer ?? null),
		isCorrect: isLiveAssessment ? false : isCorrect,
		status,
		evaluationStatus,
		feedback: isLiveAssessment ? null : feedback,
		evaluatorId: evaluation?.evaluatorId ?? null,
		evaluatorName: evaluation?.evaluator?.name ?? null,
		evaluatedAt: evaluation?.evaluatedAt ?? null,
	};
};

// ============================================================================
// 4. calculateSubmissionScore (Unified Orchestrator)
// ============================================================================

/**
 * Calculates and resolves the score for any submission regardless of problem type.
 * Delegates to calculateCodingScore, calculateMCQScore, or calculateWrittenScore,
 * returning a unified ISubmissionScoreResult.
 */
const calculateSubmissionScore = async (
	submissionId: string,
	user?: RequestUser,
): Promise<ISubmissionScoreResult> => {
	if (!submissionId || submissionId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Submission ID is required.");
	}

	// Query submission to inspect problem type
	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		select: {
			id: true,
			problem: {
				select: {
					type: true,
				},
			},
		},
	});

	if (!submission || !submission.problem) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission or associated problem not found.");
	}

	switch (submission.problem.type) {
		case ProblemType.CODING: {
			const codingScore = await calculateCodingScore(submissionId, user);
			return {
				submissionId: codingScore.submissionId,
				attemptId: codingScore.attemptId,
				problemId: codingScore.problemId,
				problemTitle: codingScore.problemTitle,
				problemType: ProblemType.CODING,
				totalMarks: codingScore.totalMarks,
				obtainedMarks: codingScore.earnedMarks,
				percentage: codingScore.percentage,
				isCorrect: codingScore.isCorrect,
				status: codingScore.status,
				feedback: codingScore.feedback,
				details: codingScore,
			};
		}

		case ProblemType.MCQ: {
			const mcqScore = await calculateMCQScore(submissionId, user);
			return {
				submissionId: mcqScore.submissionId,
				attemptId: mcqScore.attemptId,
				problemId: mcqScore.problemId,
				problemTitle: mcqScore.problemTitle,
				problemType: ProblemType.MCQ,
				totalMarks: mcqScore.totalMarks,
				obtainedMarks: mcqScore.earnedMarks,
				percentage: mcqScore.percentage,
				isCorrect: mcqScore.isCorrect,
				status: mcqScore.status,
				feedback: mcqScore.feedback,
				details: mcqScore,
			};
		}

		case ProblemType.WRITTEN: {
			const writtenScore = await calculateWrittenScore(submissionId, user);
			return {
				submissionId: writtenScore.submissionId,
				attemptId: writtenScore.attemptId,
				problemId: writtenScore.problemId,
				problemTitle: writtenScore.problemTitle,
				problemType: ProblemType.WRITTEN,
				totalMarks: writtenScore.totalMarks,
				obtainedMarks: writtenScore.earnedMarks,
				percentage: writtenScore.percentage,
				isCorrect: writtenScore.isCorrect,
				status: writtenScore.status,
				feedback: writtenScore.feedback,
				details: writtenScore,
			};
		}

		default:
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Unsupported problem type: ${(submission as any).problem?.type}`,
			);
	}
};

// ============================================================================
// 5. calculateAttemptScore (Attempt-Level Aggregation)
// ============================================================================

/**
 * Calculates, aggregates, and persists the total score and results for an assessment attempt.
 */
const calculateAttemptScore = async (
	attemptId: string,
	user?: RequestUser,
): Promise<IAttemptScoreResult> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	return await AttemptScoreService.calculateAttemptScore(attemptId, user);
};

// ============================================================================
// Service Export
// ============================================================================

export const CalculationService = {
	calculateSubmissionScore,
	calculateCodingScore,
	calculateMCQScore,
	calculateWrittenScore,
	calculateAttemptScore,
};
