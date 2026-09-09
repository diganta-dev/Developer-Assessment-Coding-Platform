import { z } from "zod";
import {
	AssessmentStatus,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";

/**
 * Validates route parameters containing an ID
 */
export const idParamValidation = z.object({
	id: z
		.string({ message: "ID must be a valid string" })
		.trim()
		.min(1, "ID cannot be empty"),
});

/**
 * Validates updateUserStatus body payload
 */
export const updateUserStatusValidation = z
	.object({
		isActive: z.boolean({ message: "isActive must be a boolean" }).optional(),
		role: z.nativeEnum(UserRole, { message: "Invalid user role" }).optional(),
		isVerified: z.boolean({ message: "isVerified must be a boolean" }).optional(),
	})
	.refine(
		(data) =>
			data.isActive !== undefined ||
			data.role !== undefined ||
			data.isVerified !== undefined,
		{
			message:
				"At least one field (isActive, role, or isVerified) must be provided to update.",
		},
	);

/**
 * Query schema for user listing
 */
export const userFilterValidation = z.object({
	page: z.string().optional(),
	limit: z.string().optional(),
	sortBy: z.string().optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
	searchTerm: z.string().optional(),
	role: z.nativeEnum(UserRole).optional(),
	isActive: z.string().optional(),
	isVerified: z.string().optional(),
});

/**
 * Query schema for company listing
 */
export const companyFilterValidation = z.object({
	page: z.string().optional(),
	limit: z.string().optional(),
	sortBy: z.string().optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
	searchTerm: z.string().optional(),
	isVerified: z.string().optional(),
});

/**
 * Query schema for assessment listing
 */
export const assessmentFilterValidation = z.object({
	page: z.string().optional(),
	limit: z.string().optional(),
	sortBy: z.string().optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
	searchTerm: z.string().optional(),
	status: z.nativeEnum(AssessmentStatus).optional(),
	companyId: z.string().optional(),
	creatorId: z.string().optional(),
});

/**
 * Query schema for submission listing
 */
export const submissionFilterValidation = z.object({
	page: z.string().optional(),
	limit: z.string().optional(),
	sortBy: z.string().optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
	searchTerm: z.string().optional(),
	status: z.nativeEnum(SubmissionStatus).optional(),
	problemType: z.nativeEnum(ProblemType).optional(),
	attemptId: z.string().optional(),
	candidateId: z.string().optional(),
	problemId: z.string().optional(),
});

export const AdminManagementValidation = {
	idParamValidation,
	updateUserStatusValidation,
	userFilterValidation,
	companyFilterValidation,
	assessmentFilterValidation,
	submissionFilterValidation,
};
