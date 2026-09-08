import httpStatus from "http-status";
import {
	AttemptStatus,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import type { IMCQEvaluationResult } from "./evaluation.interface";

/**
 * Evaluates an MCQ submission against the configured question options.
 *
 * Evaluation Pipeline:
 * 1. Fetch submission with associated problem, MCQ options, and assessment marks configuration.
 * 2. Validate problem type and question integrity.
 * 3. Match candidate's selected option against question options.
 * 4. Calculate earned marks (full marks if correct, 0 if incorrect/unselected).
 * 5. Atomically update Submission and upsert an AUTOMATIC Evaluation record via transaction.
 * 6. Sanitize result if candidate is actively taking the test (prevent answer leakage).
 */
const evaluateMCQSubmission = async (
	submissionId: string,
	evaluatorId?: string,
	isCandidateSelf = false,
): Promise<IMCQEvaluationResult> => {
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
		},
	});

	if (!submission) {
		throw new AppError(httpStatus.NOT_FOUND, "Submission not found.");
	}

	if (submission.problem.type !== ProblemType.MCQ) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Only MCQ problems can be evaluated with evaluateMCQSubmission. Problem type is ${submission.problem.type}.`,
		);
	}

	const mcqQuestion = submission.problem.mcqQuestion;
	if (!mcqQuestion) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"MCQ question configuration not found for this problem.",
		);
	}

	const options = mcqQuestion.options;
	if (!options || options.length === 0) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This MCQ problem has no answer options configured.",
		);
	}

	// Resolve assessment marks: prefer assessment-specific override if present
	const assessmentProblem = submission.attempt.assessment.problems.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const totalMarks = assessmentProblem?.marks ?? submission.problem.marks;

	const correctOption = options.find((opt) => opt.isCorrect);
	const selectedOptionId = submission.selectedOptionId;

	let isCorrect = false;
	let earnedMarks = 0;
	let selectedOption = null;
	let feedback = "";

	if (!selectedOptionId) {
		// Candidate submitted without selecting an option (skipped / blank)
		isCorrect = false;
		earnedMarks = 0;
		feedback = `No option was selected. Score: 0/${totalMarks}.`;
	} else {
		selectedOption = options.find((opt) => opt.id === selectedOptionId);
		if (!selectedOption) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Invalid option: The selected option does not belong to this MCQ question.",
			);
		}

		isCorrect = Boolean(selectedOption.isCorrect);
		earnedMarks = isCorrect ? totalMarks : 0;

		feedback = isCorrect
			? `Correct! Awarded full marks (${earnedMarks}/${totalMarks}).`
			: `Incorrect option selected. Score: 0/${totalMarks}.`;
	}

	if (mcqQuestion.explanation) {
		feedback += ` Explanation: ${mcqQuestion.explanation}`;
	}

	// Persist outcome atomically
	const [, evaluation] = await prisma.$transaction(async (tx) => {
		const updatedSubmission = await tx.submission.update({
			where: { id: submission.id },
			data: {
				marks: earnedMarks,
				isCorrect,
				status: SubmissionStatus.EVALUATED,
			},
		});

		const existingEvaluation = await tx.evaluation.findFirst({
			where: {
				submissionId: submission.id,
				type: EvaluationType.AUTOMATIC,
			},
		});

		const evaluationRecord = existingEvaluation
			? await tx.evaluation.update({
					where: { id: existingEvaluation.id },
					data: {
						marks: earnedMarks,
						feedback,
						status: EvaluationStatus.COMPLETED,
						evaluatorId: evaluatorId || existingEvaluation.evaluatorId,
						evaluatedAt: new Date(),
					},
				})
			: await tx.evaluation.create({
					data: {
						submissionId: submission.id,
						evaluatorId: evaluatorId || null,
						type: EvaluationType.AUTOMATIC,
						status: EvaluationStatus.COMPLETED,
						marks: earnedMarks,
						feedback,
						evaluatedAt: new Date(),
					},
				});

		return [updatedSubmission, evaluationRecord];
	});

	// Anti-cheating guard: If candidate evaluates during an active test,
	// mask correct answers and explanation to prevent test leakage.
	const isLiveAssessment =
		isCandidateSelf && submission.attempt.status === AttemptStatus.IN_PROGRESS;

	if (isLiveAssessment) {
		return {
			submissionId: submission.id,
			problemId: submission.problemId,
			selectedOptionId,
			selectedOptionText: selectedOption?.optionText ?? null,
			totalMarks,
			status: SubmissionStatus.EVALUATED,
			feedback: "MCQ answer recorded.",
		};
	}

	return {
		submissionId: submission.id,
		problemId: submission.problemId,
		selectedOptionId,
		selectedOptionText: selectedOption?.optionText ?? null,
		isCorrect,
		earnedMarks,
		totalMarks,
		status: SubmissionStatus.EVALUATED,
		correctOptionId: correctOption?.id,
		explanation: mcqQuestion.explanation,
		feedback,
		evaluationId: evaluation.id,
	};
};

export const MCQEvaluationService = {
	evaluateMCQSubmission,
};
