import type {
	EvaluationStatus,
	EvaluationType,
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
