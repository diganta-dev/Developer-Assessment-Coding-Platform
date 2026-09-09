import { z } from "zod";
import { ResultStatus } from "../../../generated/prisma/enums";

/**
 * Validates attemptId in request parameters
 */
export const attemptIdParamValidation = z.object({
	attemptId: z
		.string({ message: "Attempt ID must be a string" })
		.trim()
		.min(1, "Attempt ID cannot be empty"),
});

/**
 * Validates assessmentId in request parameters
 */
export const assessmentIdParamValidation = z.object({
	assessmentId: z
		.string({ message: "Assessment ID must be a string" })
		.trim()
		.min(1, "Assessment ID cannot be empty"),
});

/**
 * Validates query parameters for leaderboard / ranking filtering
 */
export const rankingQueryValidation = z.object({
	page: z.coerce.number().int().positive().optional().default(1),
	limit: z.coerce.number().int().positive().max(100).optional().default(20),
	searchTerm: z.string().trim().optional(),
	status: z.nativeEnum(ResultStatus).optional(),
	sortBy: z
		.enum(["rank", "marks", "time", "submittedAt"])
		.optional()
		.default("rank"),
	sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
});

export const RankingResultValidation = {
	attemptIdParamValidation,
	assessmentIdParamValidation,
	rankingQueryValidation,
};
