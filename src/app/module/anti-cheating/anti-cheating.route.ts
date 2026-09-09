import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AntiCheatingController } from "./anti-cheating.controller";
import { AntiCheatingValidation } from "./anti-cheating.validation";

const router = Router();

// ============================================================================
// Real-time Event Ingestion Endpoints (Invoked during live assessment attempts)
// Candidates and proctors have access to report client anomalies
// ============================================================================

// 1. Generic Violation Ingestion
router.post(
	"/attempt/:attemptId/violation",
	auth(),
	validateRequest(AntiCheatingValidation.recordViolationValidation),
	AntiCheatingController.recordViolation,
);

// 2. Tab Switch / Window Visibility Loss
router.post(
	"/attempt/:attemptId/tab-switch",
	auth(),
	validateRequest(AntiCheatingValidation.tabSwitchValidation),
	AntiCheatingController.detectTabSwitch,
);

// 3. Multiple Concurrent Tabs / Browser Instances
router.post(
	"/attempt/:attemptId/multiple-tabs",
	auth(),
	validateRequest(AntiCheatingValidation.multipleTabValidation),
	AntiCheatingController.detectMultipleTabs,
);

// 4. Clipboard Operations (Copy / Paste)
router.post(
	"/attempt/:attemptId/copy-paste",
	auth(),
	validateRequest(AntiCheatingValidation.copyPasteValidation),
	AntiCheatingController.detectCopyPaste,
);

// 5. Fullscreen Mode Departures
router.post(
	"/attempt/:attemptId/fullscreen-exit",
	auth(),
	validateRequest(AntiCheatingValidation.fullscreenExitValidation),
	AntiCheatingController.detectFullscreenExit,
);

// 6. General Suspicious Anomalies (DevTools, blur, external screen hooks)
router.post(
	"/attempt/:attemptId/suspicious-activity",
	auth(),
	validateRequest(AntiCheatingValidation.suspiciousActivityValidation),
	AntiCheatingController.detectSuspiciousActivity,
);

// ============================================================================
// Proctoring & Integrity Audit Endpoints
// ============================================================================

// 7. Calculate Multi-Factor Cheating Risk Score (Audit report)
router.get(
	"/attempt/:attemptId/risk",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	AntiCheatingController.calculateCheatingRisk,
);

// 8. Formally Flag Attempt (Admin / Proctor manual review & disqualification)
router.post(
	"/attempt/:attemptId/flag",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	validateRequest(AntiCheatingValidation.flagAttemptValidation),
	AntiCheatingController.flagAttempt,
);

export const AntiCheatingRoutes = router;
