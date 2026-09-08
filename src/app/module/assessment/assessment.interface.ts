import type {
	AssessmentStatus,
	ResultStatus,
	TestCaseType,
} from "../../../generated/prisma/enums";

export interface IAssessmentProblemInput {
	problemId: string;
	marks?: number;
	questionOrder?: number;
	isRequired?: boolean;
}

export interface IAssessmentSettingInput {
	maxAttempts?: number;
	shuffleQuestions?: boolean;
	shuffleMCQOptions?: boolean;
	allowMultipleAttempts?: boolean;
	preventCopyPaste?: boolean;
	requireFullscreen?: boolean;
	autoSubmitOnExpiry?: boolean;
}

export interface ICreateAssessmentPayload {
	title: string;
	description?: string | null;
	companyId?: string;
	durationMinutes: number;
	totalMarks?: number;
	passingScore?: number | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	status?: AssessmentStatus;
	settings?: IAssessmentSettingInput;
}

export interface IAssessmentFilterOptions {
	searchTerm?: string;
	status?: AssessmentStatus;
	companyId?: string;
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface IUpdateAssessmentPayload {
	title?: string;
	description?: string | null;
	durationMinutes?: number;
	totalMarks?: number;
	passingScore?: number | null;
	startDate?: string | Date | null;
	endDate?: string | Date | null;
	status?: AssessmentStatus;
	settings?: Partial<IAssessmentSettingInput>;
	problems?: IAssessmentProblemInput[];
}

export interface IAddProblemsPayload {
	problems: IAssessmentProblemInput[];
}

export interface IInviteCandidatesPayload {
	email?: string;
	emails?: string[];
	expiresAt?: string | Date | null;
}

export interface IStartAttemptPayload {
	invitationToken?: string;
}

export interface ISubmitAnswerItem {
	problemId: string;
	selectedOptionId?: string;
	answerText?: string;
	sourceCode?: string;
	language?: string;
}

export interface ISubmitAttemptPayload {
	answers?: ISubmitAnswerItem[];
}

export interface IAttemptFilterOptions {
	status?: string;
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface IPublishResultsPayload {
	publishAll?: boolean;
	attemptIds?: string[];
	recalculateRanks?: boolean;
}

export interface IResultFilterOptions {
	status?: ResultStatus | string;
	search?: string;
	isPublished?: boolean | string;
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface IResultOverview {
	totalAttempts: number;
	completedAttempts: number;
	passedCount: number;
	failedCount: number;
	passRate: number;
	averageScore: number;
	highestScore: number;
	lowestScore: number;
}
export interface ISanitizeAssessmentInput {
	settings?: {
		shuffleQuestions?: boolean | null;
		shuffleMCQOptions?: boolean | null;
	} | null;
	problems: Array<{
		id: string;
		assessmentId: string;
		problemId: string;
		questionOrder: number;
		marks: number;
		isRequired: boolean;
		problem: {
			id: string;
			title: string;
			description: string;
			type: string;
			difficulty: string;
			marks: number;
			mcqQuestion?: {
				id: string;
				explanation?: string | null;
				options: Array<{
					id: string;
					optionText: string;
					optionOrder: number;
					isCorrect?: boolean;
				}>;
			} | null;
			codingQuestion?: {
				id: string;
				inputFormat?: string | null;
				outputFormat?: string | null;
				constraints?: string | null;
				starterCode?: unknown;
				supportedLanguages: string[];
				timeLimitMs: number;
				memoryLimitMb: number;
				testCases: Array<{
					id: string;
					type: TestCaseType;
					input: string;
					expectedOutput: string;
					timeLimitMs?: number | null;
					memoryLimitMb?: number | null;
				}>;
			} | null;
			writtenQuestion?: {
				id: string;
				wordLimit?: number | null;
				expectedAnswer?: string | null;
			} | null;
		};
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
}
