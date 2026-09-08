import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import type {
	ICodingEvaluationResult,
	ITestCaseExecutionResult,
} from "./evaluation.interface";
import { executeJudge0TestCase, getJudge0LanguageId } from "./judge0.helper";

/**
 * Evaluates a candidate's coding submission using Judge0 CE.
 *
 * Execution Pipeline:
 * 1. Fetch submission with coding question, test cases, and assessment configuration.
 * 2. Validate problem type and submission payload (source code & language).
 * 3. Update submission status to RUNNING.
 * 4. Resolve programming language to Judge0 language ID.
 * 5. Run all test cases (both PUBLIC and HIDDEN) against Judge0 sandbox.
 * 6. Aggregate execution metrics (pass/fail count, peak time, peak memory).
 * 7. Calculate proportional marks based on assessment problem configuration.
 * 8. Persist execution stats and outcome into the Submission record.
 * 9. Upsert an AUTOMATIC Evaluation record with feedback and timestamp.
 */
const evaluateCodingSubmission = async (
	submissionId: string,
	evaluatorId?: string,
): Promise<ICodingEvaluationResult> => {
	// ─── 1. Fetch Submission Details ──────────────────────────────────────────
	const submission = await prisma.submission.findUnique({
		where: { id: submissionId },
		include: {
			problem: {
				include: {
					codingQuestion: {
						include: {
							testCases: {
								orderBy: { createdAt: "asc" },
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

	if (submission.problem.type !== ProblemType.CODING) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Automatic Judge0 evaluation is only supported for CODING problems. This problem is of type ${submission.problem.type}.`,
		);
	}

	const codingQuestion = submission.problem.codingQuestion;
	if (!codingQuestion) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Coding question configuration not found for this problem.",
		);
	}

	if (!submission.sourceCode || submission.sourceCode.trim() === "") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot evaluate empty submission. Source code is missing.",
		);
	}

	if (!submission.language) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Programming language is not specified in submission.",
		);
	}

	// ─── 2. Resolve Language ID ──────────────────────────────────────────────
	const languageId = getJudge0LanguageId(submission.language);
	if (!languageId) {
		await prisma.submission.update({
			where: { id: submission.id },
			data: {
				status: SubmissionStatus.ERROR,
				marks: 0,
				isCorrect: false,
			},
		});

		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Unsupported programming language: '${submission.language}'. Please use a supported language (e.g., JavaScript, TypeScript, Python, C++, Java).`,
		);
	}

	// ─── 3. Set Status to RUNNING ────────────────────────────────────────────
	await prisma.submission.update({
		where: { id: submission.id },
		data: { status: SubmissionStatus.RUNNING },
	});

	const testCases = codingQuestion.testCases;

	if (!testCases || testCases.length === 0) {
		// If no test cases are configured, mark as evaluated with 0 marks
		await prisma.submission.update({
			where: { id: submission.id },
			data: {
				status: SubmissionStatus.EVALUATED,
				passedTests: 0,
				failedTests: 0,
				marks: 0,
				isCorrect: false,
			},
		});

		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No test cases configured for this coding question. Cannot run evaluation.",
		);
	}

	// ─── 4. Execute Test Cases Against Judge0 ────────────────────────────────
	// Use Promise.allSettled so a single network failure doesn't discard ALL test results
	const settledResults = await Promise.allSettled(
		testCases.map((tc) =>
			executeJudge0TestCase({
				sourceCode: submission.sourceCode as string,
				languageId,
				stdin: tc.input,
				expectedOutput: tc.expectedOutput,
				timeLimitMs: tc.timeLimitMs || codingQuestion.timeLimitMs,
				memoryLimitMb: tc.memoryLimitMb || codingQuestion.memoryLimitMb,
				testCaseId: tc.id,
				testCaseType: tc.type,
			}),
		),
	);

	// If every single test case failed to execute (network/API error), revert status
	const allRejected = settledResults.every((r) => r.status === "rejected");
	if (allRejected) {
		await prisma.submission.update({
			where: { id: submission.id },
			data: { status: SubmissionStatus.ERROR },
		});
		const firstError = settledResults[0] as PromiseRejectedResult;
		throw firstError.reason instanceof Error
			? firstError.reason
			: new AppError(
					httpStatus.BAD_GATEWAY,
					"Judge0 evaluation failed for all test cases.",
				);
	}

	// Map settled results into ITestCaseExecutionResult, treating rejections as ERROR test cases
	const testResults: ITestCaseExecutionResult[] = settledResults.map(
		(result, index) => {
			if (result.status === "fulfilled") {
				return result.value;
			}
			// Rejected — produce a synthetic error result for this test case
			const tc = testCases[index];
			return {
				testCaseId: tc.id,
				type: tc.type,
				passed: false,
				executionTimeMs: 0,
				memoryUsedMb: 0,
				judge0StatusId: 0,
				judge0StatusDescription: "Execution Error",
				actualOutput: null,
				expectedOutput: tc.expectedOutput,
				stderr:
					result.reason instanceof Error
						? result.reason.message
						: "Unknown execution error",
				compileOutput: null,
				message: null,
			} satisfies ITestCaseExecutionResult;
		},
	);

	// ─── 5. Aggregate Execution Metrics ──────────────────────────────────────
	const totalTestCases = testResults.length;
	const passedTests = testResults.filter((t) => t.passed).length;
	const failedTests = totalTestCases - passedTests;
	const maxExecutionTimeMs = Math.max(
		0,
		...testResults.map((t) => t.executionTimeMs),
	);
	const maxMemoryUsedMb = Math.max(
		0,
		...testResults.map((t) => t.memoryUsedMb),
	);

	const isCorrect = passedTests === totalTestCases;
	const hasCompileError = testResults.some((t) => t.judge0StatusId === 6);
	const hasRuntimeError = testResults.some((t) => t.judge0StatusId >= 7);

	// ─── 6. Calculate Marks ──────────────────────────────────────────────────
	// Find configured marks in assessmentProblem, or fallback to problem marks
	const assessmentProblem = submission.attempt?.assessment?.problems?.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const totalMarks = assessmentProblem?.marks ?? submission.problem.marks;
	const earnedMarks =
		totalTestCases > 0
			? parseFloat(((passedTests / totalTestCases) * totalMarks).toFixed(2))
			: 0;

	// ─── 7. Determine Final Submission Status ────────────────────────────────
	let finalStatus: SubmissionStatus;
	if (isCorrect) {
		finalStatus = SubmissionStatus.PASSED;
	} else if (
		hasCompileError ||
		(failedTests === totalTestCases && hasRuntimeError)
	) {
		finalStatus = SubmissionStatus.ERROR;
	} else {
		finalStatus = SubmissionStatus.FAILED;
	}

	// ─── 8. Construct Feedback Summary ───────────────────────────────────────
	let feedback = `Automated Evaluation (Judge0): Passed ${passedTests}/${totalTestCases} test cases. Score: ${earnedMarks}/${totalMarks}`;
	if (hasCompileError) {
		const compileErr = testResults.find((t) => t.compileOutput)?.compileOutput;
		feedback = `Compilation Error: ${compileErr ? compileErr.trim() : "Failed to compile."}`;
	} else if (hasRuntimeError && !isCorrect) {
		const runtimeErr = testResults.find((t) => t.stderr || t.message);
		const errText = runtimeErr?.stderr || runtimeErr?.message;
		feedback += ` | Runtime Error encountered on some test cases: ${errText ? errText.trim().slice(0, 200) : "Runtime error"}`;
	}

	// ─── 9. Persist to Database (Submission & Evaluation) ────────────────────
	await prisma.submission.update({
		where: { id: submission.id },
		data: {
			status: finalStatus,
			passedTests,
			failedTests,
			executionTimeMs: maxExecutionTimeMs,
			memoryUsedMb: maxMemoryUsedMb,
			executionResult: testResults as unknown as Prisma.InputJsonValue,
			marks: earnedMarks,
			isCorrect,
		},
	});

	// Upsert AUTOMATIC Evaluation record
	const existingEvaluation = await prisma.evaluation.findFirst({
		where: {
			submissionId: submission.id,
			type: EvaluationType.AUTOMATIC,
		},
	});

	if (existingEvaluation) {
		await prisma.evaluation.update({
			where: { id: existingEvaluation.id },
			data: {
				marks: earnedMarks,
				status: EvaluationStatus.COMPLETED,
				feedback,
				evaluatorId: evaluatorId || existingEvaluation.evaluatorId,
				evaluatedAt: new Date(),
			},
		});
	} else {
		await prisma.evaluation.create({
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
	}

	return {
		submissionId: submission.id,
		totalTestCases,
		passedTests,
		failedTests,
		executionTimeMs: maxExecutionTimeMs,
		memoryUsedMb: maxMemoryUsedMb,
		earnedMarks,
		totalMarks,
		isCorrect,
		status: finalStatus,
		testResults,
	};
};

export const CodingEvaluationService = {
	evaluateCodingSubmission,
};
