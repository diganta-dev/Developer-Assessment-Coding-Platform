import type {
	Difficulty,
	ProblemType,
	TestCaseType,
} from "../../../generated/prisma/enums";

// ==========================================
// MCQ Interfaces
// ==========================================
export interface ICreateMCQOptionPayload {
	optionText: string;
	isCorrect: boolean;
	optionOrder?: number;
}

export interface ICreateMCQDetailsPayload {
	explanation?: string;
	options: ICreateMCQOptionPayload[];
}

export interface IUpdateMCQOptionPayload {
	id?: string;
	optionText?: string;
	isCorrect?: boolean;
	optionOrder?: number;
}

export interface IUpdateMCQDetailsPayload {
	explanation?: string;
	options?: IUpdateMCQOptionPayload[];
}

// ==========================================
// Written Question Interfaces
// ==========================================
export interface ICreateWrittenDetailsPayload {
	wordLimit?: number;
	expectedAnswer?: string;
}

export type IUpdateWrittenDetailsPayload =
	Partial<ICreateWrittenDetailsPayload>;

// ==========================================
// Coding Question & Test Cases Interfaces
// ==========================================
export interface ICreateTestCasePayload {
	type: TestCaseType;
	input: string;
	expectedOutput: string;
	timeLimitMs?: number;
	memoryLimitMb?: number;
}

export interface ICreateCodingDetailsPayload {
	inputFormat?: string;
	outputFormat?: string;
	constraints?: string;
	starterCode?: Record<string, string>;
	supportedLanguages?: string[];
	timeLimitMs?: number;
	memoryLimitMb?: number;
	testCases?: ICreateTestCasePayload[];
}

export interface IUpdateTestCasePayload {
	id?: string;
	type?: TestCaseType;
	input?: string;
	expectedOutput?: string;
	timeLimitMs?: number;
	memoryLimitMb?: number;
}

export interface IUpdateCodingDetailsPayload {
	inputFormat?: string;
	outputFormat?: string;
	constraints?: string;
	starterCode?: Record<string, string>;
	supportedLanguages?: string[];
	timeLimitMs?: number;
	memoryLimitMb?: number;
	testCases?: IUpdateTestCasePayload[];
}

// ==========================================
// Base Problem Payload (Common Fields)
// ==========================================
export interface IBaseProblemPayload {
	title: string;
	description: string;
	difficulty?: Difficulty;
	marks?: number;
	companyId?: string;
}

// ==========================================
// Problem Payloads by Type
// ==========================================
export interface ICreateCodingProblemPayload extends IBaseProblemPayload {
	type: "CODING";
	coding: ICreateCodingDetailsPayload;
	mcq?: never;
	written?: never;
}

export interface ICreateMCQProblemPayload extends IBaseProblemPayload {
	type: "MCQ";
	mcq: ICreateMCQDetailsPayload;
	coding?: never;
	written?: never;
}

export interface ICreateWrittenProblemPayload extends IBaseProblemPayload {
	type: "WRITTEN";
	written: ICreateWrittenDetailsPayload;
	coding?: never;
	mcq?: never;
}

// General Problem Payload
export interface ICreateProblemPayload {
	title: string;
	description: string;
	type: ProblemType;
	difficulty?: Difficulty;
	marks?: number;
	companyId?: string;

	// Type-specific nested objects
	coding?: ICreateCodingDetailsPayload;
	mcq?: ICreateMCQDetailsPayload;
	written?: ICreateWrittenDetailsPayload;
}

// Update Problem Payload
export interface IUpdateProblemPayload {
	title?: string;
	description?: string;
	type?: ProblemType;
	difficulty?: Difficulty;
	marks?: number;
	companyId?: string;

	coding?: IUpdateCodingDetailsPayload;
	mcq?: IUpdateMCQDetailsPayload;
	written?: IUpdateWrittenDetailsPayload;
}

// ==========================================
// Filter & Query Interfaces
// ==========================================
export interface IProblemFilterRequest {
	searchTerm?: string;
	type?: ProblemType;
	difficulty?: Difficulty;
	companyId?: string;
	createdById?: string;
}

export interface IPaginationOptions {
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}
