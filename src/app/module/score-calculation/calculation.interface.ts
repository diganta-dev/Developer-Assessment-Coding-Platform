import type {
	EvaluationStatus,
	ProblemType,
	SubmissionStatus,
} from "../../../generated/prisma/enums";

export interface ISubmissionScoreResult {
	submissionId: string;
	attemptId: string;
	problemId: string;
	problemTitle: string;
	problemType: ProblemType;
	totalMarks: number;
	obtainedMarks: number;
	percentage: number;
	isCorrect: boolean;
	status: SubmissionStatus;
	feedback: string | null;
	details?: ICodingScoreBreakdown | IMCQScoreBreakdown | IWrittenScoreBreakdown;
}

export interface ICodingScoreBreakdown {
	submissionId: string;
	attemptId: string;
	problemId: string;
	problemTitle: string;
	totalMarks: number;
	earnedMarks: number;
	percentage: number;
	totalTestCases: number;
	passedTests: number;
	failedTests: number;
	publicTestsPassed: number;
	totalPublicTests: number;
	hiddenTestsPassed: number;
	totalHiddenTests: number;
	executionTimeMs: number;
	memoryUsedMb: number;
	isCorrect: boolean;
	status: SubmissionStatus;
	feedback: string | null;
}

export interface IMCQScoreBreakdown {
	submissionId: string;
	attemptId: string;
	problemId: string;
	problemTitle: string;
	totalMarks: number;
	earnedMarks: number;
	percentage: number;
	selectedOptionId: string | null;
	selectedOptionText: string | null;
	correctOptionId: string | null;
	correctOptionText: string | null;
	isCorrect: boolean;
	explanation: string | null;
	feedback: string | null;
	status: SubmissionStatus;
}

export interface IWrittenScoreBreakdown {
	submissionId: string;
	attemptId: string;
	problemId: string;
	problemTitle: string;
	totalMarks: number;
	earnedMarks: number;
	percentage: number;
	answerText: string | null;
	wordCount: number;
	wordLimit: number | null;
	isWordLimitExceeded: boolean;
	expectedAnswer: string | null;
	isCorrect: boolean;
	status: SubmissionStatus;
	evaluationStatus: EvaluationStatus;
	feedback: string | null;
	evaluatorId: string | null;
	evaluatorName: string | null;
	evaluatedAt: Date | null;
}
