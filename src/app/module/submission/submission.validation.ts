import { z } from "zod";

/**
 * Validation schema for creating/upserting a submission.
 * Used when attemptId comes from the request body.
 */
export const createSubmissionValidation = z
	.object({
		attemptId: z
			.string({ message: "Attempt ID must be a string" })
			.min(1, "Attempt ID cannot be empty"),
		problemId: z
			.string({ message: "Problem ID must be a string" })
			.min(1, "Problem ID cannot be empty"),
		selectedOptionId: z.string().trim().min(1).optional().nullable(),
		answerText: z.string().trim().min(1).optional().nullable(),
		sourceCode: z.string().trim().min(1).optional().nullable(),
		language: z.string().trim().min(1).optional().nullable(),
	})
	.refine(
		(data) =>
			Boolean(
				(data.selectedOptionId && data.selectedOptionId.trim() !== "") ||
					(data.answerText && data.answerText.trim() !== "") ||
					(data.sourceCode && data.sourceCode.trim() !== ""),
			),
		{
			message:
				"At least one of 'selectedOptionId', 'answerText', or 'sourceCode' must be provided",
			path: ["selectedOptionId"],
		},
	);

/**
 * Validation schema when attemptId is a URL param (not in body).
 * Used by routes like POST /attempt/:attemptId
 */
export const createSubmissionByParamValidation = z
	.object({
		problemId: z
			.string({ message: "Problem ID must be a string" })
			.min(1, "Problem ID cannot be empty"),
		selectedOptionId: z.string().trim().min(1).optional().nullable(),
		answerText: z.string().trim().min(1).optional().nullable(),
		sourceCode: z.string().trim().min(1).optional().nullable(),
		language: z.string().trim().min(1).optional().nullable(),
	})
	.refine(
		(data) =>
			Boolean(
				(data.selectedOptionId && data.selectedOptionId.trim() !== "") ||
					(data.answerText && data.answerText.trim() !== "") ||
					(data.sourceCode && data.sourceCode.trim() !== ""),
			),
		{
			message:
				"At least one of 'selectedOptionId', 'answerText', or 'sourceCode' must be provided",
			path: ["selectedOptionId"],
		},
	);

/**
 * Validation schema for finalizing/submitting an existing submission.
 * Used by POST /submit and POST /:id/submit
 */
export const submitSubmissionValidation = z
	.object({
		submissionId: z.string().min(1).optional(),
		attemptId: z.string().min(1).optional(),
		problemId: z.string().min(1).optional(),
		selectedOptionId: z.string().trim().min(1).optional().nullable(),
		answerText: z.string().trim().min(1).optional().nullable(),
		sourceCode: z.string().trim().min(1).optional().nullable(),
		language: z.string().trim().min(1).optional().nullable(),
	})
	.refine((data) => data.submissionId || (data.attemptId && data.problemId), {
		message:
			"Either 'submissionId' or both 'attemptId' and 'problemId' must be provided",
		path: ["submissionId"],
	});

export const SubmissionValidation = {
	createSubmissionValidation,
	createSubmissionByParamValidation,
	submitSubmissionValidation,
};
