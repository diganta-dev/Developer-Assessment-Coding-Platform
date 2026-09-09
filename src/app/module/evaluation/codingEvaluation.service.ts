import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	AttemptStatus,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";
import { AttemptScoreService } from "./attemptScore.service";
import type {
	ICodingEvaluationResult,
	ITestCaseExecutionResult,
} from "./evaluation.interface";
import { executeJudge0TestCase, getJudge0LanguageId } from "./judge0.helper";

interface ExecutionSummary {
	total: number;
	passed: number;
	failed: number;
	maxTimeMs: number;
	maxMemoryMb: number;
	hasCompileError: boolean;
	hasRuntimeError: boolean;
	compileOutput?: string;
	runtimeError?: string;
}

function summarizeExecution(
	results: ITestCaseExecutionResult[],
): ExecutionSummary {
	let passed = 0;
	let maxTimeMs = 0;
	let maxMemoryMb = 0;
	let hasCompileError = false;
	let hasRuntimeError = false;
	let compileOutput: string | undefined;
	let runtimeError: string | undefined;

	for (const test of results) {
		if (test.passed) {
			passed++;
		}
		if (test.executionTimeMs > maxTimeMs) {
			maxTimeMs = test.executionTimeMs;
		}
		if (test.memoryUsedMb > maxMemoryMb) {
			maxMemoryMb = test.memoryUsedMb;
		}
		if (test.judge0StatusId === 6) {
			hasCompileError = true;
			compileOutput = test.compileOutput || test.stderr || "Compilation error";
		}
		if (test.judge0StatusId >= 7) {
			hasRuntimeError = true;
			runtimeError = test.stderr || test.message || "Runtime error";
		}
	}

	return {
		total: results.length,
		passed,
		failed: results.length - passed,
		maxTimeMs,
		maxMemoryMb,
		hasCompileError,
		hasRuntimeError,
		compileOutput,
		runtimeError,
	};
}

function resolveSubmissionStatus(summary: ExecutionSummary): SubmissionStatus {
	if (summary.hasCompileError || summary.hasRuntimeError) {
		return SubmissionStatus.ERROR;
	}
	if (summary.passed === summary.total && summary.total > 0) {
		return SubmissionStatus.PASSED;
	}
	return SubmissionStatus.FAILED;
}

function buildEvaluationFeedback(
	summary: ExecutionSummary,
	earnedMarks: number,
	totalMarks: number,
): string {
	if (summary.hasCompileError) {
		const detail = summary.compileOutput?.trim();
		return `Compilation Error: ${detail ? detail.slice(0, 300) : "Failed to compile source code."}`;
	}

	if (summary.passed === summary.total) {
		return `All ${summary.total} test cases passed. Score: ${earnedMarks}/${totalMarks}`;
	}

	let feedback = `Passed ${summary.passed}/${summary.total} test cases. Score: ${earnedMarks}/${totalMarks}`;
	if (summary.hasRuntimeError && summary.runtimeError) {
		feedback += ` | Runtime error encountered: ${summary.runtimeError.trim().slice(0, 150)}`;
	}

	return feedback;
}

/**
 * Evaluates a candidate's coding submission by executing source code
 * against all configured test cases in an isolated Judge0 sandbox.
 */
const evaluateCodingSubmission = async (
	submissionId: string,
	evaluatorId?: string,
): Promise<ICodingEvaluationResult> => {
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
			`Automated execution is only supported for CODING problems (received ${submission.problem.type}).`,
		);
	}

	if (submission.status === SubmissionStatus.RUNNING) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This coding submission is already being evaluated. Please wait for completion.",
		);
	}

	const codingQuestion = submission.problem.codingQuestion;
	if (!codingQuestion) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Coding question configuration or test cases are missing for this problem.",
		);
	}

	const sourceCode = submission.sourceCode?.trim();
	if (!sourceCode) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot evaluate submission without source code.",
		);
	}

	if (!submission.language) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Programming language was not specified in the submission.",
		);
	}

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
			`Unsupported programming language: '${submission.language}'. Supported options: JavaScript, TypeScript, Python, C++, Java, Go, Rust, C#.`,
		);
	}

	const testCases = codingQuestion.testCases;
	if (!testCases || testCases.length === 0) {
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
			"No test cases configured for this coding question. Evaluation cannot proceed.",
		);
	}

	// Update status to running before launching sandbox jobs
	await prisma.submission.update({
		where: { id: submission.id },
		data: { status: SubmissionStatus.RUNNING },
	});

	const testResults: ITestCaseExecutionResult[] = [];

	try {
		// Run test cases sequentially to prevent sandbox rate limits (429)
		// and fail fast on compilation error to avoid wasted compute.
		for (let i = 0; i < testCases.length; i++) {
			const tc = testCases[i];

			try {
				const result = await executeJudge0TestCase({
					sourceCode,
					languageId,
					stdin: tc.input,
					expectedOutput: tc.expectedOutput,
					timeLimitMs: tc.timeLimitMs || codingQuestion.timeLimitMs,
					memoryLimitMb: tc.memoryLimitMb || codingQuestion.memoryLimitMb,
					testCaseId: tc.id,
					testCaseType: tc.type,
				});

				testResults.push(result);

				// Fail-fast on compile error: if the program does not compile,
				// every subsequent test case will fail with the exact same compiler output.
				if (result.judge0StatusId === 6) {
					for (let j = i + 1; j < testCases.length; j++) {
						const remainingTc = testCases[j];
						testResults.push({
							testCaseId: remainingTc.id,
							type: remainingTc.type,
							passed: false,
							executionTimeMs: 0,
							memoryUsedMb: 0,
							judge0StatusId: 6,
							judge0StatusDescription: "Compilation Error",
							actualOutput: null,
							expectedOutput: remainingTc.expectedOutput,
							compileOutput: result.compileOutput,
							stderr: result.stderr,
							message: "Skipped due to compilation error in previous test case",
						});
					}
					break;
				}
			} catch (err) {
				// Record sandbox execution error for individual test case
				testResults.push({
					testCaseId: tc.id,
					type: tc.type,
					passed: false,
					executionTimeMs: 0,
					memoryUsedMb: 0,
					judge0StatusId: 0,
					judge0StatusDescription: "Execution Error",
					actualOutput: null,
					expectedOutput: tc.expectedOutput,
					stderr: err instanceof Error ? err.message : "Execution error",
					compileOutput: null,
					message: null,
				});
			}
		}
	} catch (error) {
		// Reset status from RUNNING to ERROR so submission is not stuck indefinitely
		await prisma.submission
			.update({
				where: { id: submission.id },
				data: { status: SubmissionStatus.ERROR },
			})
			.catch(() => null);

		throw error;
	}

	// If all test cases failed due to sandbox network/service downtime, throw 502
	const allNetworkFailures =
		testResults.length > 0 &&
		testResults.every(
			(t) =>
				t.judge0StatusId === 0 &&
				t.judge0StatusDescription === "Execution Error",
		);

	if (allNetworkFailures) {
		await prisma.submission.update({
			where: { id: submission.id },
			data: { status: SubmissionStatus.ERROR },
		});

		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"Code execution sandbox is currently unavailable. Please try again shortly.",
		);
	}

	const summary = summarizeExecution(testResults);
	const finalStatus = resolveSubmissionStatus(summary);

	// Resolve problem marks configured for this assessment, falling back to base marks
	const assessmentProblem = submission.attempt?.assessment?.problems?.find(
		(ap) => ap.problemId === submission.problemId,
	);
	const totalMarks = assessmentProblem?.marks ?? submission.problem.marks;

	const earnedMarks =
		summary.total > 0
			? Math.round((summary.passed / summary.total) * totalMarks * 100) / 100
			: 0;

	const isCorrect = summary.passed === summary.total && summary.total > 0;
	const feedback = buildEvaluationFeedback(summary, earnedMarks, totalMarks);

	// Persist submission and evaluation records atomically in a transaction
	await prisma.$transaction(async (tx) => {
		await tx.submission.update({
			where: { id: submission.id },
			data: {
				status: finalStatus,
				passedTests: summary.passed,
				failedTests: summary.failed,
				executionTimeMs: summary.maxTimeMs,
				memoryUsedMb: summary.maxMemoryMb,
				executionResult: testResults as unknown as Prisma.InputJsonValue,
				marks: earnedMarks,
				isCorrect,
			},
		});

		const existingEvaluation = await tx.evaluation.findFirst({
			where: {
				submissionId: submission.id,
				type: EvaluationType.AUTOMATIC,
			},
		});

		if (existingEvaluation) {
			await tx.evaluation.update({
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
			await tx.evaluation.create({
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
	});

	// If the attempt was already submitted or expired, auto-sync the total attempt score
	if (
		submission.attempt?.status === AttemptStatus.SUBMITTED ||
		submission.attempt?.status === AttemptStatus.EXPIRED
	) {
		try {
			await AttemptScoreService.calculateAttemptScore(submission.attemptId);
		} catch {
			// Non-blocking: score can still be calculated manually or via cron
		}
	}

	return {
		submissionId: submission.id,
		totalTestCases: summary.total,
		passedTests: summary.passed,
		failedTests: summary.failed,
		executionTimeMs: summary.maxTimeMs,
		memoryUsedMb: summary.maxMemoryMb,
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
