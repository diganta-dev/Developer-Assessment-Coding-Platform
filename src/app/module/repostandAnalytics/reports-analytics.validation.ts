import { z } from "zod";

/**
 * Validates route parameters containing an assessmentId
 */
export const assessmentIdParamValidation = z.object({
	assessmentId: z
		.string({ message: "Assessment ID must be a valid string" })
		.trim()
		.min(1, "Assessment ID cannot be empty"),
});

/**
 * Validates route parameters containing a candidateId
 */
export const candidateIdParamValidation = z.object({
	candidateId: z
		.string({ message: "Candidate ID must be a valid string" })
		.trim()
		.min(1, "Candidate ID cannot be empty"),
});

/**
 * Validates route parameters containing a companyId
 */
export const companyIdParamValidation = z.object({
	companyId: z
		.string({ message: "Company ID must be a valid string" })
		.trim()
		.min(1, "Company ID cannot be empty"),
});

/**
 * Validates route parameters containing an attemptId
 */
export const attemptIdParamValidation = z.object({
	attemptId: z
		.string({ message: "Attempt ID must be a valid string" })
		.trim()
		.min(1, "Attempt ID cannot be empty"),
});

export const ReportsAnalyticsValidation = {
	assessmentIdParamValidation,
	candidateIdParamValidation,
	companyIdParamValidation,
	attemptIdParamValidation,
};
