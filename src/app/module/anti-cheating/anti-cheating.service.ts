import httpStatus from "http-status";
import {
	AntiCheatEventType,
	AttemptStatus,
	ResultStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	CheatingRiskLevel,
	IAntiCheatEventResponse,
	ICheatingRiskReport,
	ICopyPastePayload,
	IFlagAttemptPayload,
	IFlagAttemptResponse,
	IFullscreenExitPayload,
	IMultipleTabPayload,
	IRecordViolationPayload,
	ISuspiciousActivityPayload,
	ITabSwitchPayload,
} from "./anti-cheating.interface";

// ============================================================================
// Authorization & Verification Helpers
// ============================================================================

/**
 * Validates that the requesting user owns the attempt or has administrative review rights.
 */
function verifyAttemptAccess(
	user: RequestUser | undefined,
	attempt: {
		candidateId: string;
		assessment: { companyId: string; creatorId: string };
	},
	action = "log anti-cheat telemetry",
): void {
	if (!user) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"You must be logged in to perform this action.",
		);
	}

	const isCandidateOwner = attempt.candidateId === user.userId;
	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		Boolean(user.companyId) && user.companyId === attempt.assessment.companyId;
	const isCreator = attempt.assessment.creatorId === user.userId;

	if (!isCandidateOwner && !isPlatformAdmin && !isCompanyMember && !isCreator) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to ${action}.`,
		);
	}
}

/**
 * Validates that the requesting user has administrative review / management rights over an attempt.
 */
function verifyAdminOrReviewerAccess(
	user: RequestUser | undefined,
	attempt: { assessment: { companyId: string; creatorId: string } },
	action = "manage anti-cheat flags",
): void {
	if (!user) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"You must be logged in to perform this action.",
		);
	}

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		Boolean(user.companyId) && user.companyId === attempt.assessment.companyId;
	const isCreator = attempt.assessment.creatorId === user.userId;

	if (!isPlatformAdmin && !isCompanyMember && !isCreator) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to ${action}.`,
		);
	}
}

// ============================================================================
// 1. recordViolation (Core Ingestion Engine)
// ============================================================================

/**
 * Validates attempt state, enforces exam policy constraints, and atomically persists
 * an anti-cheat event with structured metadata.
 */
const recordViolation = async (
	attemptId: string,
	payload: IRecordViolationPayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					settings: true,
				},
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	verifyAttemptAccess(user, attempt, "record anti-cheat events");

	// Anti-cheat events can strictly only be recorded for active in-progress exams
	if (attempt.status !== AttemptStatus.IN_PROGRESS) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot record anti-cheat events for attempt in '${attempt.status}' status. Only IN_PROGRESS attempts accept telemetry.`,
		);
	}

	const settings = attempt.assessment.settings;
	let policyViolationWarning: string | null = null;

	// Assessment setting policy checks
	if (
		settings?.preventCopyPaste &&
		(payload.type === AntiCheatEventType.COPY ||
			payload.type === AntiCheatEventType.PASTE)
	) {
		policyViolationWarning =
			"Policy Violation: Copy/Paste operations are strictly disabled for this assessment.";
	}

	if (
		settings?.requireFullscreen &&
		payload.type === AntiCheatEventType.FULLSCREEN_EXIT
	) {
		policyViolationWarning =
			"Policy Violation: Fullscreen mode is mandatory for this assessment.";
	}

	const occurredAt = payload.occurredAt
		? new Date(payload.occurredAt)
		: new Date();

	const event = await prisma.antiCheatEvent.create({
		data: {
			attemptId,
			type: payload.type,
			metadata: {
				...(payload.metadata || {}),
				policyViolation: Boolean(policyViolationWarning),
				policyWarning: policyViolationWarning,
				recordedAt: new Date().toISOString(),
			},
			occurredAt,
		},
	});

	return {
		id: event.id,
		attemptId: event.attemptId,
		type: event.type,
		metadata: event.metadata as any,
		occurredAt: event.occurredAt,
		policyViolationWarning,
	};
};

// ============================================================================
// 2. detectTabSwitch
// ============================================================================

/**
 * Intercepts candidate tab switch or browser visibility loss.
 */
const detectTabSwitch = async (
	attemptId: string,
	payload: ITabSwitchPayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	return await recordViolation(
		attemptId,
		{
			type: AntiCheatEventType.TAB_SWITCH,
			metadata: {
				durationSeconds: payload.durationSeconds ?? 0,
				count: payload.count ?? 1,
				clientTimestamp: payload.clientTimestamp,
				userAgent: payload.userAgent,
			},
		},
		user,
	);
};

// ============================================================================
// 3. detectMultipleTabs
// ============================================================================

/**
 * Detects multiple concurrent browser tabs or duplicate active sessions.
 */
const detectMultipleTabs = async (
	attemptId: string,
	payload: IMultipleTabPayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	return await recordViolation(
		attemptId,
		{
			type: AntiCheatEventType.MULTIPLE_TAB,
			metadata: {
				activeTabCount: payload.activeTabCount ?? 2,
				sessionToken: payload.sessionToken,
				clientTimestamp: payload.clientTimestamp,
				details:
					payload.details || "Multiple concurrent browser tabs detected.",
			},
		},
		user,
	);
};

// ============================================================================
// 4. detectCopyPaste
// ============================================================================

/**
 * Intercepts clipboard copy or paste operations during assessment.
 */
const detectCopyPaste = async (
	attemptId: string,
	payload: ICopyPastePayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	const type =
		payload.operation === "COPY"
			? AntiCheatEventType.COPY
			: AntiCheatEventType.PASTE;

	return await recordViolation(
		attemptId,
		{
			type,
			metadata: {
				operation: payload.operation,
				textLength: payload.textLength ?? 0,
				textPreview: payload.textPreview
					? payload.textPreview.slice(0, 100)
					: undefined,
				targetElement: payload.targetElement,
				clientTimestamp: payload.clientTimestamp,
			},
		},
		user,
	);
};

// ============================================================================
// 5. detectFullscreenExit
// ============================================================================

/**
 * Captures fullscreen departure events.
 */
const detectFullscreenExit = async (
	attemptId: string,
	payload: IFullscreenExitPayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	return await recordViolation(
		attemptId,
		{
			type: AntiCheatEventType.FULLSCREEN_EXIT,
			metadata: {
				durationOutsideSeconds: payload.durationOutsideSeconds ?? 0,
				screenResolution: payload.screenResolution,
				reason: payload.reason || "Candidate exited fullscreen mode.",
				clientTimestamp: payload.clientTimestamp,
			},
		},
		user,
	);
};

// ============================================================================
// 6. detectSuspiciousActivity
// ============================================================================

/**
 * Captures general client anomalies (window blur, developer tools, rapid events).
 */
const detectSuspiciousActivity = async (
	attemptId: string,
	payload: ISuspiciousActivityPayload,
	user?: RequestUser,
): Promise<IAntiCheatEventResponse> => {
	return await recordViolation(
		attemptId,
		{
			type: AntiCheatEventType.WINDOW_BLUR,
			metadata: {
				anomalyType: payload.anomalyType,
				details:
					payload.details || "Suspicious anomaly detected by client proctor.",
				clientTimestamp: payload.clientTimestamp,
				...(payload.metadata || {}),
			},
		},
		user,
	);
};

// ============================================================================
// 7. calculateCheatingRisk
// ============================================================================

/**
 * Computes a weighted multi-factor cheating risk score (0 to 100) and risk category
 * evaluating policy violations, frequency of infractions, and collusion indicators.
 */
const calculateCheatingRisk = async (
	attemptId: string,
	user?: RequestUser,
): Promise<ICheatingRiskReport> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			candidate: {
				select: { id: true, name: true, email: true },
			},
			assessment: {
				include: {
					settings: true,
				},
			},
			antiCheatEvents: {
				orderBy: { occurredAt: "asc" },
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	verifyAttemptAccess(user, attempt, "view cheating risk report");

	const settings = attempt.assessment.settings;
	const preventCopyPaste = Boolean(settings?.preventCopyPaste);
	const requireFullscreen = Boolean(settings?.requireFullscreen);

	const events = attempt.antiCheatEvents;
	const eventsByType: Record<AntiCheatEventType, number> = {
		[AntiCheatEventType.TAB_SWITCH]: 0,
		[AntiCheatEventType.COPY]: 0,
		[AntiCheatEventType.PASTE]: 0,
		[AntiCheatEventType.FULLSCREEN_EXIT]: 0,
		[AntiCheatEventType.MULTIPLE_TAB]: 0,
		[AntiCheatEventType.WINDOW_BLUR]: 0,
	};

	let rawRiskScore = 0;
	let isFlagged = false;
	let flagReason: string | null = null;
	let disqualified = attempt.status === AttemptStatus.EXPIRED;

	for (const event of events) {
		const meta = (event.metadata as any) || {};

		// Proctor flag events are administrative audits, not candidate telemetry infractions
		if (meta.flagged === true) {
			isFlagged = true;
			flagReason = meta.reason || "Flagged by proctor";
			if (meta.disqualified === true) {
				disqualified = true;
			}
			continue;
		}

		eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;

		// Weighted scoring matrix:
		switch (event.type) {
			case AntiCheatEventType.MULTIPLE_TAB:
				rawRiskScore += 35; // Severe collusion risk
				break;
			case AntiCheatEventType.FULLSCREEN_EXIT:
				rawRiskScore += requireFullscreen ? 25 : 15;
				break;
			case AntiCheatEventType.TAB_SWITCH:
				rawRiskScore += 12;
				break;
			case AntiCheatEventType.PASTE:
				rawRiskScore += preventCopyPaste ? 25 : 15;
				break;
			case AntiCheatEventType.COPY:
				rawRiskScore += preventCopyPaste ? 15 : 5;
				break;
			case AntiCheatEventType.WINDOW_BLUR:
				rawRiskScore += 8;
				break;
		}
	}

	const riskScore = Math.min(100, Math.round(rawRiskScore));

	let riskLevel: CheatingRiskLevel = "LOW";
	if (riskScore >= 75 || disqualified) {
		riskLevel = "CRITICAL";
	} else if (riskScore >= 50 || isFlagged) {
		riskLevel = "HIGH";
	} else if (riskScore >= 25) {
		riskLevel = "MEDIUM";
	}

	let recommendation =
		"Low cheating risk. Assessment integrity appears intact.";
	if (riskLevel === "CRITICAL") {
		recommendation =
			"Critical integrity breach detected. Disqualification or score invalidation strongly advised.";
	} else if (riskLevel === "HIGH") {
		recommendation =
			"High risk indicators detected. Manual inspection of candidate code and video proctoring required.";
	} else if (riskLevel === "MEDIUM") {
		recommendation =
			"Moderate anomalies observed. Review tab switches and fullscreen departure logs.";
	}

	const copyPasteViolationsCount =
		eventsByType[AntiCheatEventType.COPY] +
		eventsByType[AntiCheatEventType.PASTE];
	const fullscreenViolationsCount =
		eventsByType[AntiCheatEventType.FULLSCREEN_EXIT];

	const timeline = events.map((e) => ({
		id: e.id,
		type: e.type,
		occurredAt: e.occurredAt,
		metadata: e.metadata as any,
	}));

	return {
		attemptId: attempt.id,
		assessmentId: attempt.assessmentId,
		assessmentTitle: attempt.assessment.title,
		candidateId: attempt.candidate.id,
		candidateName: attempt.candidate.name,
		candidateEmail: attempt.candidate.email,
		attemptStatus: attempt.status,
		riskScore,
		riskLevel,
		isFlagged,
		flagReason,
		disqualified,
		totalEvents: events.length,
		eventsByType,
		timeline,
		policySettings: {
			preventCopyPaste,
			requireFullscreen,
			copyPasteViolationsCount,
			fullscreenViolationsCount,
		},
		recommendation,
	};
};

// ============================================================================
// 8. flagAttempt
// ============================================================================

/**
 * Formally flags an attempt as compromised or suspicious, adding an audit event
 * and optionally disqualifying/terminating the attempt immediately.
 */
const flagAttempt = async (
	attemptId: string,
	payload: IFlagAttemptPayload,
	user: RequestUser,
): Promise<IFlagAttemptResponse> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: { settings: true },
			},
			result: true,
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	verifyAdminOrReviewerAccess(user, attempt, "flag this assessment attempt");

	const flaggedAt = new Date();
	const disqualify = Boolean(payload.disqualify);

	// Atomically record flag event and execute disqualification if requested
	const [flagEvent, updatedAttempt] = await prisma.$transaction(async (tx) => {
		const ev = await tx.antiCheatEvent.create({
			data: {
				attemptId,
				type: AntiCheatEventType.WINDOW_BLUR,
				metadata: {
					flagged: true,
					reason: payload.reason,
					severity: payload.severity || "HIGH",
					disqualified: disqualify,
					notes: payload.notes || null,
					flaggedBy: user.userId,
					flaggedByEmail: user.email,
					flaggedAt: flaggedAt.toISOString(),
				},
				occurredAt: flaggedAt,
			},
		});

		let att = attempt;
		if (disqualify) {
			att = await tx.assessmentAttempt.update({
				where: { id: attempt.id },
				data: {
					status: AttemptStatus.EXPIRED,
				},
				include: {
					assessment: {
						include: { settings: true },
					},
					result: true,
				},
			});

			// Upsert Result record to guarantee it is marked as FAILED upon disqualification
			await tx.result.upsert({
				where: { attemptId: attempt.id },
				create: {
					attemptId: attempt.id,
					totalMarks: attempt.totalMarks ?? 0,
					obtainedMarks: 0,
					percentage: 0,
					passingScore: attempt.assessment.passingScore,
					status: ResultStatus.FAILED,
					publishedAt: flaggedAt,
				},
				update: {
					status: ResultStatus.FAILED,
				},
			});
		}

		return [ev, att];
	});

	return {
		attemptId: updatedAttempt.id,
		isFlagged: true,
		status: updatedAttempt.status,
		reason: payload.reason,
		flaggedAt,
		flaggedBy: user.email,
		disqualified: disqualify,
		event: {
			id: flagEvent.id,
			attemptId: flagEvent.attemptId,
			type: flagEvent.type,
			metadata: flagEvent.metadata as any,
			occurredAt: flagEvent.occurredAt,
		},
	};
};

// ============================================================================
// Service Export
// ============================================================================

export const AntiCheatingService = {
	recordViolation,
	detectTabSwitch,
	detectMultipleTabs,
	detectCopyPaste,
	detectFullscreenExit,
	detectSuspiciousActivity,
	calculateCheatingRisk,
	flagAttempt,
};
