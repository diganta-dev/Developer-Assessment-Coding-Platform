import { z } from "zod";

/**
 * Validates route parameters containing a submissionId
 */
export const submissionIdParamValidation = z.object({
	submissionId: z
		.string({ message: "Submission ID must be a valid string" })
		.trim()
		.min(1, "Submission ID cannot be empty"),
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

export const CalculationValidation = {
	submissionIdParamValidation,
	attemptIdParamValidation,
};
