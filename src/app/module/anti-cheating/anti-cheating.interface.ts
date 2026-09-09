import type {
	AntiCheatEventType,
	AttemptStatus,
} from "../../../generated/prisma/enums";

// ============================================================================
// Risk Assessment Enums & Types
// ============================================================================

export type CheatingRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface IAntiCheatEventMetadata {
	durationSeconds?: number;
	count?: number;
	clientTimestamp?: string | number | Date;
	userAgent?: string;
	ipAddress?: string;
	copiedTextLength?: number;
	pastedTextLength?: number;
	textPreview?: string;
	targetElement?: string;
	screenResolution?: string;
	anomalyType?: string;
	details?: string;
	reason?: string;
	flaggedBy?: string;
	severity?: string;
	[key: string]: any;
}

// ============================================================================
// Payload Interfaces for Specific Detection Endpoints
// ============================================================================

export interface ITabSwitchPayload {
	durationSeconds?: number;
	count?: number;
	clientTimestamp?: string | number | Date;
	userAgent?: string;
}

export interface IMultipleTabPayload {
	activeTabCount?: number;
	sessionToken?: string;
	clientTimestamp?: string | number | Date;
	details?: string;
}

export interface ICopyPastePayload {
	operation: "COPY" | "PASTE";
	textLength?: number;
	textPreview?: string;
	targetElement?: string;
	clientTimestamp?: string | number | Date;
}

export interface IFullscreenExitPayload {
	durationOutsideSeconds?: number;
	screenResolution?: string;
	clientTimestamp?: string | number | Date;
	reason?: string;
}

export interface ISuspiciousActivityPayload {
	anomalyType: string; // e.g. "DEVTOOLS_OPENED", "RAPID_KEYSTROKES", "MULTIPLE_DISPLAYS"
	details?: string;
	clientTimestamp?: string | number | Date;
	metadata?: Record<string, any>;
}

export interface IRecordViolationPayload {
	type: AntiCheatEventType;
	metadata?: IAntiCheatEventMetadata;
	occurredAt?: string | number | Date;
}

export interface IFlagAttemptPayload {
	reason: string;
	severity?: "MEDIUM" | "HIGH" | "CRITICAL";
	disqualify?: boolean; // if true, terminates attempt immediately
	notes?: string;
}

// ============================================================================
// Response Interfaces
// ============================================================================

export interface IAntiCheatEventResponse {
	id: string;
	attemptId: string;
	type: AntiCheatEventType;
	metadata: IAntiCheatEventMetadata | null;
	occurredAt: Date;
	policyViolationWarning?: string | null;
}

export interface ICheatingRiskReport {
	attemptId: string;
	assessmentId: string;
	assessmentTitle: string;
	candidateId: string;
	candidateName: string;
	candidateEmail: string;
	attemptStatus: AttemptStatus;

	// Risk metrics
	riskScore: number; // 0 to 100
	riskLevel: CheatingRiskLevel;
	isFlagged: boolean;
	flagReason: string | null;
	disqualified: boolean;

	// Event breakdown
	totalEvents: number;
	eventsByType: Record<AntiCheatEventType, number>;
	timeline: Array<{
		id: string;
		type: AntiCheatEventType;
		occurredAt: Date;
		metadata: IAntiCheatEventMetadata | null;
	}>;

	// Policy configurations
	policySettings: {
		preventCopyPaste: boolean;
		requireFullscreen: boolean;
		copyPasteViolationsCount: number;
		fullscreenViolationsCount: number;
	};

	recommendation: string;
}

export interface IFlagAttemptResponse {
	attemptId: string;
	isFlagged: boolean;
	status: AttemptStatus;
	reason: string;
	flaggedAt: Date;
	flaggedBy: string;
	disqualified: boolean;
	event: IAntiCheatEventResponse;
}
