import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AssessmentController } from "./assessment.controller";
import { SubmissionController } from "../submission/submission.controller";
import { createSubmissionValidation } from "../submission/submission.validation";
import {
	addProblemsValidation,
	createAssessmentValidation,
	inviteCandidatesValidation,
	publishResultsValidation,
	startAttemptValidation,
	submitAttemptValidation,
	updateAssessmentValidation,
} from "./assessment.validation";

const router = Router();

/**
 * Route ordering rules (Express processes top-to-bottom):
 * 1. Fully static paths first  → /create-assessment
 * 2. Static-prefix paths next → /start-attempt/:id, /invite-candidates/:id, /add-problems/:id
 * 3. Attempt sub-routes        → /attempts/:attemptId/*
 * 4. Candidate self-service    → /my-attempts
 * 5. Recruiter management      → /get-my-assessments, /get-single-assessment/:id
 * 6. Fully parameterized last  → /:id, /:id/*, /:id/sub-routes
 */

// ─── STATIC PATHS ────────────────────────────────────────────────────────────

router.post(
	"/",
	auth(),
	validateRequest(createAssessmentValidation),
	AssessmentController.createAssessment,
);

router.post(
	"/create-assessment",
	auth(),
	validateRequest(createAssessmentValidation),
	AssessmentController.createAssessment,
);

router.get(
	"/",
	auth(),
	AssessmentController.getMyAssessments,
);

// ─── CANDIDATE SELF-SERVICE (must be before /:id to avoid shadow) ─────────────

router.get("/my-attempts", auth(), AssessmentController.getMyAttempts);

// ─── STATIC-PREFIX ALTERNATE FORMS (before /:id prefix) ──────────────────────

router.post(
	"/start-attempt/:id",
	auth(),
	validateRequest(startAttemptValidation),
	AssessmentController.startAttempt,
);

router.post(
	"/publish-results/:id",
	auth(),
	validateRequest(publishResultsValidation),
	AssessmentController.publishAssessmentResults,
);

router.post(
	"/invite-candidates/:id",
	auth(),
	validateRequest(inviteCandidatesValidation),
	AssessmentController.inviteCandidates,
);

router.post(
	"/add-problems/:id",
	auth(),
	validateRequest(addProblemsValidation),
	AssessmentController.addProblemsToAssessment,
);

// ─── ATTEMPT SUB-ROUTES (before /:id to avoid shadow) ────────────────────────

router.get(
	"/attempts/:attemptId",
	auth(),
	AssessmentController.getAttemptDetails,
);

router.post(
	"/attempts/:attemptId/submit",
	auth(),
	validateRequest(submitAttemptValidation),
	AssessmentController.submitAssessmentAttempt,
);

router.post(
	"/attempts/:attemptId/submissions",
	auth(),
	validateRequest(createSubmissionValidation),
	SubmissionController.createSubmission,
);

router.get(
	"/attempts/:attemptId/result",
	auth(),
	AssessmentController.getAttemptResult,
);

router.get(
	"/attempts/:attemptId/detailed-report",
	auth(),
	AssessmentController.getDetailedResultReport,
);

// ─── RECRUITER MANAGEMENT — STATIC NAMED ALIASES ─────────────────────────────

router.get(
	"/get-my-assessments",
	auth(),
	AssessmentController.getMyAssessments,
);

router.get(
	"/get-single-assessment/:id",
	auth(),
	AssessmentController.getSingleAssessment,
);

router.patch(
	"/update-assessment/:id",
	auth(),
	validateRequest(updateAssessmentValidation),
	AssessmentController.updateAssessment,
);

router.patch(
	"/publish-assessment/:id",
	auth(),
	AssessmentController.publishAssessment,
);

router.delete(
	"/delete-assessment/:id",
	auth(),
	AssessmentController.deleteAssessment,
);

// ─── PARAMETERIZED /:id ROUTES (must be last to avoid shadowing) ──────────────

router.get("/:id/attempts", auth(), AssessmentController.getAssessmentAttempts);

router.get("/:id/results", auth(), AssessmentController.getAssessmentResults);

router.get(
	"/:id/leaderboard",
	auth(),
	AssessmentController.getAssessmentResults,
);

router.post(
	"/:id/publish-results",
	auth(),
	validateRequest(publishResultsValidation),
	AssessmentController.publishAssessmentResults,
);

router.post(
	"/:id/start-attempt",
	auth(),
	validateRequest(startAttemptValidation),
	AssessmentController.startAttempt,
);

router.patch("/:id/publish", auth(), AssessmentController.publishAssessment);

router.post(
	"/:id/invite",
	auth(),
	validateRequest(inviteCandidatesValidation),
	AssessmentController.inviteCandidates,
);

router.get(
	"/:id/invitations",
	auth(),
	AssessmentController.getAssessmentInvitations,
);

router.post(
	"/:id/problems",
	auth(),
	validateRequest(addProblemsValidation),
	AssessmentController.addProblemsToAssessment,
);

// Bare /:id routes — MUST be absolutely last on each verb
router.get("/:id", auth(), AssessmentController.getSingleAssessment);

router.patch(
	"/:id",
	auth(),
	validateRequest(updateAssessmentValidation),
	AssessmentController.updateAssessment,
);

router.delete("/:id", auth(), AssessmentController.deleteAssessment);

export const AssessmentRoutes = router;
