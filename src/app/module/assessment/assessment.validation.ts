import { z } from "zod";

export const assessmentProblemInputSchema = z.object({
	problemId: z
		.string({
			message: "Problem ID is required",
		})
		.min(1, "Problem ID cannot be empty"),
	marks: z
		.number()
		.positive("Marks for a problem must be a positive number")
		.optional(),
	questionOrder: z
		.number()
		.int("Question order must be an integer")
		.positive("Question order must be greater than zero")
		.optional(),
	isRequired: z.boolean().optional().default(true),
});

export const assessmentSettingInputSchema = z.object({
	maxAttempts: z
		.number()
		.int("Max attempts must be an integer")
		.positive("Max attempts must be at least 1")
		.optional()
		.default(1),
	shuffleQuestions: z.boolean().optional().default(false),
	shuffleMCQOptions: z.boolean().optional().default(false),
	allowMultipleAttempts: z.boolean().optional().default(false),
	preventCopyPaste: z.boolean().optional().default(false),
	requireFullscreen: z.boolean().optional().default(false),
	autoSubmitOnExpiry: z.boolean().optional().default(true),
});

export const createAssessmentValidation = z
	.object({
		title: z
			.string({
				message: "Assessment title is required",
			})
			.trim()
			.min(3, "Title must be at least 3 characters")
			.max(200, "Title cannot exceed 200 characters"),
		description: z
			.string()
			.trim()
			.max(2000, "Description cannot exceed 2000 characters")
			.optional()
			.nullable(),
		companyId: z.string().optional(),
		durationMinutes: z
			.number({
				message: "Duration in minutes is required",
			})
			.int("Duration must be an integer")
			.min(5, "Assessment duration must be at least 5 minutes")
			.max(1440, "Assessment duration cannot exceed 24 hours (1440 minutes)"),
		totalMarks: z.number().positive("Total marks must be positive").optional(),
		passingScore: z
			.number()
			.positive("Passing score must be positive")
			.optional()
			.nullable(),
		startDate: z
			.string()
			.datetime("Start date must be a valid ISO datetime string")
			.optional()
			.nullable(),
		endDate: z
			.string()
			.datetime("End date must be a valid ISO datetime string")
			.optional()
			.nullable(),
		status: z
			.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "ARCHIVED"])
			.optional()
			.default("DRAFT"),
		settings: assessmentSettingInputSchema.optional(),
		problems: z.array(assessmentProblemInputSchema).optional(),
	})
	.superRefine((data, ctx) => {
		// Validate date chronology
		if (data.startDate && data.endDate) {
			const start = new Date(data.startDate);
			const end = new Date(data.endDate);
			if (end <= start) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "End date must be after the start date",
					path: ["endDate"],
				});
			}
		}

		// Validate unique problem IDs
		if (data.problems && data.problems.length > 0) {
			const problemIds = data.problems.map((p) => p.problemId);
			const uniqueIds = new Set(problemIds);
			if (uniqueIds.size !== problemIds.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"Duplicate problem IDs detected in the assessment problem list",
					path: ["problems"],
				});
			}

			// Validate unique custom question orders if provided
			const customOrders = data.problems
				.map((p) => p.questionOrder)
				.filter((order): order is number => typeof order === "number");
			const uniqueOrders = new Set(customOrders);
			if (uniqueOrders.size !== customOrders.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Question orders must be unique within the assessment",
					path: ["problems"],
				});
			}
		}

		// Validate passing score does not exceed explicit totalMarks
		if (
			data.totalMarks !== undefined &&
			data.passingScore !== undefined &&
			data.passingScore !== null
		) {
			if (data.passingScore > data.totalMarks) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Passing score cannot exceed total marks",
					path: ["passingScore"],
				});
			}
		}
	});

export const updateAssessmentValidation = z
	.object({
		title: z
			.string({
				message: "Assessment title must be a string",
			})
			.trim()
			.min(3, "Title must be at least 3 characters")
			.max(200, "Title cannot exceed 200 characters")
			.optional(),
		description: z
			.string()
			.trim()
			.max(2000, "Description cannot exceed 2000 characters")
			.optional()
			.nullable(),
		durationMinutes: z
			.number({
				message: "Duration must be a number",
			})
			.int("Duration must be an integer")
			.min(5, "Assessment duration must be at least 5 minutes")
			.max(1440, "Assessment duration cannot exceed 24 hours (1440 minutes)")
			.optional(),
		totalMarks: z.number().positive("Total marks must be positive").optional(),
		passingScore: z
			.number()
			.positive("Passing score must be positive")
			.optional()
			.nullable(),
		startDate: z
			.string()
			.datetime("Start date must be a valid ISO datetime string")
			.optional()
			.nullable(),
		endDate: z
			.string()
			.datetime("End date must be a valid ISO datetime string")
			.optional()
			.nullable(),
		status: z
			.enum(["DRAFT", "PUBLISHED", "ACTIVE", "COMPLETED", "ARCHIVED"])
			.optional(),
		settings: assessmentSettingInputSchema.partial().optional(),
		problems: z.array(assessmentProblemInputSchema).optional(),
	})
	.superRefine((data, ctx) => {
		// Validate date chronology if both dates are present
		if (data.startDate && data.endDate) {
			const start = new Date(data.startDate);
			const end = new Date(data.endDate);
			if (end <= start) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "End date must be after the start date",
					path: ["endDate"],
				});
			}
		}

		// Validate unique problem IDs if problems provided
		if (data.problems && data.problems.length > 0) {
			const problemIds = data.problems.map((p) => p.problemId);
			const uniqueIds = new Set(problemIds);
			if (uniqueIds.size !== problemIds.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						"Duplicate problem IDs detected in the assessment problem list",
					path: ["problems"],
				});
			}

			const customOrders = data.problems
				.map((p) => p.questionOrder)
				.filter((order): order is number => typeof order === "number");
			const uniqueOrders = new Set(customOrders);
			if (uniqueOrders.size !== customOrders.length) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Question orders must be unique within the assessment",
					path: ["problems"],
				});
			}
		}

		// Validate passing score does not exceed explicit totalMarks
		if (
			data.totalMarks !== undefined &&
			data.passingScore !== undefined &&
			data.passingScore !== null
		) {
			if (data.passingScore > data.totalMarks) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "Passing score cannot exceed total marks",
					path: ["passingScore"],
				});
			}
		}
	});

export const addProblemsValidation = z
	.object({
		problems: z
			.array(assessmentProblemInputSchema)
			.min(1, "At least one problem must be provided"),
	})
	.superRefine((data, ctx) => {
		const problemIds = data.problems.map((p) => p.problemId);
		const uniqueIds = new Set(problemIds);
		if (uniqueIds.size !== problemIds.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Duplicate problem IDs detected in the provided list",
				path: ["problems"],
			});
		}

		const customOrders = data.problems
			.map((p) => p.questionOrder)
			.filter((order): order is number => typeof order === "number");
		const uniqueOrders = new Set(customOrders);
		if (uniqueOrders.size !== customOrders.length) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Question orders must be unique within the provided list",
				path: ["problems"],
			});
		}
	});

export const inviteCandidatesValidation = z
	.object({
		email: z.string().email("Invalid email format").optional(),
		emails: z
			.array(z.string().email("Invalid email format in candidate list"))
			.min(1, "At least one email is required")
			.optional(),
		expiresAt: z
			.string()
			.datetime("Expiration date must be a valid ISO datetime string")
			.optional()
			.nullable(),
	})
	.superRefine((data, ctx) => {
		if (!data.email && (!data.emails || data.emails.length === 0)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Please provide either 'email' or an 'emails' array of candidates",
				path: ["emails"],
			});
		}
	});

export const startAttemptValidation = z.object({
	invitationToken: z.string().optional(),
});

export const submitAnswerItemSchema = z.object({
	problemId: z.string({ message: "problemId is required" }).min(1),
	selectedOptionId: z.string().optional(),
	answerText: z.string().optional(),
	sourceCode: z.string().optional(),
	language: z.string().optional(),
});

export const submitAttemptValidation = z.object({
	answers: z.array(submitAnswerItemSchema).optional().default([]),
});

export const publishResultsValidation = z.object({
	publishAll: z.boolean().optional().default(true),
	attemptIds: z.array(z.string().min(1)).optional(),
	recalculateRanks: z.boolean().optional().default(true),
});

export const AssessmentValidation = {
	createAssessmentValidation,
	updateAssessmentValidation,
	addProblemsValidation,
	inviteCandidatesValidation,
	startAttemptValidation,
	submitAttemptValidation,
	publishResultsValidation,
	assessmentProblemInputSchema,
	assessmentSettingInputSchema,
};
