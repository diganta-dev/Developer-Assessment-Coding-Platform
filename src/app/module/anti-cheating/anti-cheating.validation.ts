import { z } from "zod";
import { AntiCheatEventType } from "../../../generated/prisma/enums";

/**
 * Validates route parameters containing an attemptId
 */
export const attemptIdParamValidation = z.object({
	attemptId: z
		.string({ message: "Attempt ID must be a valid string" })
		.trim()
		.min(1, "Attempt ID cannot be empty"),
});

/**
 * Validates generic anti-cheat violation recording
 */
export const recordViolationValidation = z.object({
	type: z.nativeEnum(AntiCheatEventType, {
		message: "Invalid anti-cheat event type",
	}),
	metadata: z.record(z.string(), z.any()).optional(),
	occurredAt: z.union([z.string(), z.number(), z.date()]).optional(),
});

/**
 * Validates tab switch event payload
 */
export const tabSwitchValidation = z.object({
	durationSeconds: z.number().min(0).optional(),
	count: z.number().int().min(1).optional(),
	clientTimestamp: z.union([z.string(), z.number(), z.date()]).optional(),
	userAgent: z.string().optional(),
});

/**
 * Validates multiple tabs detection payload
 */
export const multipleTabValidation = z.object({
	activeTabCount: z.number().int().min(2).optional(),
	sessionToken: z.string().optional(),
	clientTimestamp: z.union([z.string(), z.number(), z.date()]).optional(),
	details: z.string().optional(),
});

/**
 * Validates copy / paste event payload
 */
export const copyPasteValidation = z.object({
	operation: z.enum(["COPY", "PASTE"], {
		message: "Operation must be either COPY or PASTE",
	}),
	textLength: z.number().int().min(0).optional(),
	textPreview: z.string().optional(),
	targetElement: z.string().optional(),
	clientTimestamp: z.union([z.string(), z.number(), z.date()]).optional(),
});

/**
 * Validates fullscreen exit event payload
 */
export const fullscreenExitValidation = z.object({
	durationOutsideSeconds: z.number().min(0).optional(),
	screenResolution: z.string().optional(),
	clientTimestamp: z.union([z.string(), z.number(), z.date()]).optional(),
	reason: z.string().optional(),
});

/**
 * Validates suspicious activity anomaly payload
 */
export const suspiciousActivityValidation = z.object({
	anomalyType: z
		.string({ message: "Anomaly type must be a valid string" })
		.trim()
		.min(1, "Anomaly type cannot be empty"),
	details: z.string().optional(),
	clientTimestamp: z.union([z.string(), z.number(), z.date()]).optional(),
	metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Validates attempt flagging payload
 */
export const flagAttemptValidation = z.object({
	reason: z
		.string({ message: "Reason must be a valid string" })
		.trim()
		.min(3, "Reason must be at least 3 characters long"),
	severity: z.enum(["MEDIUM", "HIGH", "CRITICAL"]).optional(),
	disqualify: z.boolean().optional(),
	notes: z.string().optional(),
});

export const AntiCheatingValidation = {
	attemptIdParamValidation,
	recordViolationValidation,
	tabSwitchValidation,
	multipleTabValidation,
	copyPasteValidation,
	fullscreenExitValidation,
	suspiciousActivityValidation,
	flagAttemptValidation,
};
