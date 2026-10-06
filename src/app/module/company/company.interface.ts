import type { CompanyMemberRole } from "../../../generated/prisma/enums";

export interface ICompanyPayload {
	name: string;
	email: string;
	logoUrl?: string;
	description?: string;
	website?: string;
	userId?: string;
}
export interface IVerifyCompanyPayload {
	email: string;
	otp: string;
}

export type IUpdateCompanyPayload = Partial<ICompanyPayload>;

export interface IAddCompanyMemberPayload {
	email: string;
	role: CompanyMemberRole;
}

export interface ICompanyMemberFilterQuery {
	page?: number | string;
	limit?: number | string;
	searchTerm?: string;
	role?: CompanyMemberRole;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface IPaginationMeta {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}
