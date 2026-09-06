import { z } from "zod";

export const mcqOptionValidationSchema = z.object({
	optionText: z.string().min(1, "Option text is required"),
	isCorrect: z.boolean().default(false),
	optionOrder: z.number().int().optional(),
});

export const mcqDetailsValidationSchema = z.object({
	explanation: z.string().optional(),
	options: z
		.array(mcqOptionValidationSchema)
		.min(2, "MCQ must have at least 2 options"),
});

export const writtenDetailsValidationSchema = z.object({
	wordLimit: z
		.number()
		.int()
		.positive("Word limit must be a positive integer")
		.optional(),
	expectedAnswer: z.string().optional(),
});

export const testCaseValidationSchema = z.object({
	type: z.enum(["PUBLIC", "HIDDEN"]),
	input: z.string(),
	expectedOutput: z.string(),
	timeLimitMs: z.number().int().positive().optional(),
	memoryLimitMb: z.number().int().positive().optional(),
});

export const codingDetailsValidationSchema = z.object({
	inputFormat: z.string().optional(),
	outputFormat: z.string().optional(),
	constraints: z.string().optional(),
	starterCode: z.record(z.string(), z.string()).optional(),
	supportedLanguages: z.array(z.string()).default([]),
	timeLimitMs: z.number().int().positive().optional(),
	memoryLimitMb: z.number().int().positive().optional(),
	testCases: z.array(testCaseValidationSchema).optional(),
});

export const createProblemValidation = z
	.object({
		title: z
			.string()
			.min(3, "Title must be at least 3 characters")
			.max(200, "Title must be at most 200 characters"),
		description: z.string().min(1, "Description is required"),
		type: z.enum(["MCQ", "WRITTEN", "CODING"]),
		difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM").optional(),
		marks: z.number().positive("Marks must be positive").default(1).optional(),
		companyId: z.string().optional(),

		// Type-specific payloads
		mcq: mcqDetailsValidationSchema.optional(),
		written: writtenDetailsValidationSchema.optional(),
		coding: codingDetailsValidationSchema.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.type === "MCQ") {
			if (!data.mcq) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "MCQ details (options) are required when type is MCQ",
					path: ["mcq"],
				});
			} else {
				const hasCorrectOption = data.mcq.options.some((opt) => opt.isCorrect);
				if (!hasCorrectOption) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message:
							"At least one MCQ option must be marked as correct (isCorrect: true)",
						path: ["mcq", "options"],
					});
				}
			}
		}

		if (data.type === "CODING" && !data.coding) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Coding details are required when type is CODING",
				path: ["coding"],
			});
		}
	});

export const updateProblemValidation = z.object({
	title: z
		.string()
		.min(3, "Title must be at least 3 characters")
		.max(200, "Title must be at most 200 characters")
		.optional(),
	description: z.string().min(1, "Description is required").optional(),
	type: z.enum(["MCQ", "WRITTEN", "CODING"]).optional(),
	difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
	marks: z.number().positive("Marks must be positive").optional(),
	companyId: z.string().optional(),

	mcq: mcqDetailsValidationSchema.partial().optional(),
	written: writtenDetailsValidationSchema.partial().optional(),
	coding: codingDetailsValidationSchema.partial().optional(),
});

export const ProblemValidation = {
	createProblemValidation,
	updateProblemValidation,
};
