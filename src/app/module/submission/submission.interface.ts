import type { SubmissionStatus } from "../../../generated/prisma/enums";

export interface ICreateSubmissionPayload {
	attemptId: string;
	problemId: string;
	selectedOptionId?: string | null;
	answerText?: string | null;
	sourceCode?: string | null;
	language?: string | null;
}

export type ISubmitSubmissionPayload = Partial<ICreateSubmissionPayload> & {
	submissionId?: string;
};

export interface ISubmissionFilterQuery {
	assessmentId?: string;
	attemptId?: string;
	problemId?: string;
	status?: SubmissionStatus;
	isCorrect?: boolean;
	searchTerm?: string;
	page?: number | string;
	limit?: number | string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}
