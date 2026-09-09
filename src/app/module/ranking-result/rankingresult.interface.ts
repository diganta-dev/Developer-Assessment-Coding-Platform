import type {
	AttemptStatus,
	ResultStatus,
} from "../../../generated/prisma/enums";

export interface IResultBreakdownProblem {
	problemId: string;
	title: string;
	type: string;
	maxMarks: number;
	obtainedMarks: number;
	isCorrect: boolean;
	status: string;
}

export interface IAssessmentResultResponse {
	resultId: string;
	attemptId: string;
	assessmentId: string;
	assessmentTitle: string;
	candidateId: string;
	candidateName: string;
	candidateEmail: string;
	totalMarks: number;
	obtainedMarks: number;
	percentage: number;
	passingScore: number | null;
	status: ResultStatus;
	rank: number | null;
	totalParticipants: number;
	attemptStatus: AttemptStatus;
	isFullyEvaluated: boolean;
	timeTakenSeconds: number | null;
	startedAt: Date | null;
	submittedAt: Date | null;
	publishedAt: Date | null;
	isPublished: boolean;
	breakdown?: IResultBreakdownProblem[];
}

export interface ICandidateRankResult {
	attemptId: string;
	assessmentId: string;
	candidateId: string;
	candidateName: string;
	rank: number;
	totalParticipants: number;
	obtainedMarks: number;
	percentage: number;
	timeTakenSeconds: number | null;
	status: ResultStatus;
	percentile: number;
}

export interface IRankedParticipant {
	rank: number;
	attemptId: string;
	candidateId: string;
	candidateName: string;
	candidateEmail: string;
	candidateAvatar?: string | null;
	obtainedMarks: number;
	totalMarks: number;
	percentage: number;
	timeTakenSeconds: number | null;
	status: ResultStatus;
	submittedAt: Date | null;
	attemptStatus: AttemptStatus;
}

export interface IAssessmentLeaderboard {
	assessmentId: string;
	assessmentTitle: string;
	totalParticipants: number;
	totalMarks: number;
	passingScore: number | null;
	averageScore: number;
	highestScore: number;
	lowestScore: number;
	passingRate: number;
	isPublished: boolean;
	publishedAt: Date | null;
	rankings: IRankedParticipant[];
	meta?: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface IPublishResultResponse {
	assessmentId: string;
	assessmentTitle: string;
	publishedAt: Date;
	totalAttempts: number;
	totalEvaluated: number;
	passedCount: number;
	failedCount: number;
	averageScore: number;
	passingRate: number;
}

export interface IRankingFilterQuery {
	page?: number | string;
	limit?: number | string;
	searchTerm?: string;
	status?: ResultStatus;
	sortBy?: "rank" | "marks" | "time" | "submittedAt";
	sortOrder?: "asc" | "desc";
}
