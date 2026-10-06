import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { SubmissionController } from "../submission/submission.controller";
import { createSubmissionValidation } from "../submission/submission.validation";
import { AssessmentController } from "./assessment.controller";
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
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(createAssessmentValidation),
	AssessmentController.createAssessment,
);

router.post(
	"/create-assessment",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(createAssessmentValidation),
	AssessmentController.createAssessment,
);

router.get(
	"/",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
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
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(publishResultsValidation),
	AssessmentController.publishAssessmentResults,
);

router.post(
	"/invite-candidates/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(inviteCandidatesValidation),
	AssessmentController.inviteCandidates,
);

router.post(
	"/add-problems/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
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

router.post(
	"/attempts/:attemptId/calculate-score",
	auth(),
	AssessmentController.calculateAttemptScore,
);

router.get(
	"/attempts/:attemptId/detailed-report",
	auth(),
	AssessmentController.getDetailedResultReport,
);

// ─── RECRUITER MANAGEMENT — STATIC NAMED ALIASES ─────────────────────────────

router.get(
	"/get-my-assessments",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	AssessmentController.getMyAssessments,
);

router.get(
	"/get-single-assessment/:id",
	auth(),
	AssessmentController.getSingleAssessment,
);

router.patch(
	"/update-assessment/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(updateAssessmentValidation),
	AssessmentController.updateAssessment,
);

router.patch(
	"/publish-assessment/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	AssessmentController.publishAssessment,
);

router.delete(
	"/delete-assessment/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	AssessmentController.deleteAssessment,
);

// ─── PARAMETERIZED /:id ROUTES (must be last to avoid shadowing) ──────────────

router.get(
	"/:id/attempts",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	AssessmentController.getAssessmentAttempts,
);

router.get(
	"/:id/results",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	AssessmentController.getAssessmentResults,
);

router.get(
	"/:id/leaderboard",
	auth(),
	AssessmentController.getAssessmentResults,
);

router.post(
	"/:id/publish-results",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(publishResultsValidation),
	AssessmentController.publishAssessmentResults,
);

router.post(
	"/:id/start-attempt",
	auth(),
	validateRequest(startAttemptValidation),
	AssessmentController.startAttempt,
);

router.patch(
	"/:id/publish",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	AssessmentController.publishAssessment,
);

router.post(
	"/:id/invite",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(inviteCandidatesValidation),
	AssessmentController.inviteCandidates,
);

router.get(
	"/:id/invitations",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	AssessmentController.getAssessmentInvitations,
);

router.post(
	"/:id/problems",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(addProblemsValidation),
	AssessmentController.addProblemsToAssessment,
);

// Bare /:id routes — MUST be absolutely last on each verb
router.get("/:id", auth(), AssessmentController.getSingleAssessment);

router.patch(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(updateAssessmentValidation),
	AssessmentController.updateAssessment,
);

router.delete(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	AssessmentController.deleteAssessment,
);

export const AssessmentRoutes = router;
