import type {
	AttemptStatus,
	Difficulty,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	ResultStatus,
	SubmissionStatus,
	TestCaseType,
} from "../../../generated/prisma/enums";

export interface IJudge0Status {
	id: number;
	description: string;
}

export interface IJudge0SubmissionResponse {
	stdout: string | null;
	time: string | null;
	memory: number | null;
	stderr: string | null;
	token?: string;
	compile_output: string | null;
	message: string | null;
	status: IJudge0Status;
}

export interface ITestCaseExecutionResult {
	testCaseId: string;
	type: TestCaseType;
	passed: boolean;
	executionTimeMs: number;
	memoryUsedMb: number;
	judge0StatusId: number;
	judge0StatusDescription: string;
	expectedOutput?: string;
	actualOutput?: string | null;
	stderr?: string | null;
	compileOutput?: string | null;
	message?: string | null;
}

export interface ICodingEvaluationResult {
	submissionId: string;
	totalTestCases: number;
	passedTests: number;
	failedTests: number;
	executionTimeMs: number;
	memoryUsedMb: number;
	earnedMarks: number;
	totalMarks: number;
	isCorrect: boolean;
	status: SubmissionStatus;
	testResults: ITestCaseExecutionResult[];
}

export interface IManualEvaluationPayload {
	marks: number;
	feedback?: string;
}

export interface IEvaluationFilterQuery {
	submissionId?: string;
	evaluatorId?: string;
	type?: EvaluationType;
	status?: EvaluationStatus;
	page?: number | string;
	limit?: number | string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface IMCQEvaluationResult {
	submissionId: string;
	problemId: string;
	selectedOptionId: string | null;
	selectedOptionText?: string | null;
	isCorrect?: boolean;
	earnedMarks?: number;
	totalMarks: number;
	status: SubmissionStatus;
	correctOptionId?: string;
	explanation?: string | null;
	feedback?: string;
	evaluationId?: string;
}

export interface IWrittenEvaluationPayload {
	marks: number;
	feedback?: string;
}

export interface IWrittenEvaluationResult {
	submissionId: string;
	problemId: string;
	answerText: string | null;
	wordCount: number;
	wordLimit: number | null;
	isWordLimitExceeded: boolean;
	expectedAnswer: string | null;
	earnedMarks: number;
	totalMarks: number;
	isCorrect: boolean;
	status: SubmissionStatus;
	feedback: string | null;
	evaluationId: string;
	evaluator: {
		id: string;
		name: string;
		email: string;
	};
}

export interface IAttemptProblemScoreBreakdown {
	problemId: string;
	questionOrder: number;
	title: string;
	type: ProblemType;
	difficulty: Difficulty;
	maxMarks: number;
	obtainedMarks: number;
	isCorrect: boolean;
	submissionStatus: string;
	submissionId: string | null;
}

export interface IAttemptScoreResult {
	attemptId: string;
	assessmentId: string;
	candidateId: string;
	candidate: {
		id: string;
		name: string;
		email: string;
	};
	totalMarks: number;
	obtainedMarks: number;
	percentage: number;
	passingScore: number | null;
	isPassed: boolean;
	resultStatus: ResultStatus;
	attemptStatus: AttemptStatus;
	isFullyEvaluated: boolean;
	totalProblems: number;
	evaluatedProblems: number;
	pendingProblems: number;
	breakdown: IAttemptProblemScoreBreakdown[];
	resultId?: string;
	calculatedAt: Date;
}
