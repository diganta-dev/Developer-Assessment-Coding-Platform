import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { EvaluationController } from "../evaluation/evaluation.controller";
import { SubmissionController } from "./submission.controller";
import {
	createSubmissionByParamValidation,
	createSubmissionValidation,
	submitSubmissionValidation,
} from "./submission.validation";

const router = Router();

// ─── Create / Upsert Submission ───────────────────────────────────────────────

// attemptId from request body
router.post(
	"/",
	auth(),
	validateRequest(createSubmissionValidation),
	SubmissionController.createSubmission,
);

// attemptId from URL param
router.post(
	"/attempts/:attemptId",
	auth(),
	validateRequest(createSubmissionByParamValidation),
	SubmissionController.createSubmission,
);

// ─── Finalize / Submit Submission ─────────────────────────────────────────────

// submit by body (submissionId or attemptId+problemId in body)
router.post(
	"/submit",
	auth(),
	validateRequest(submitSubmissionValidation),
	SubmissionController.submitSubmission,
);

// submit by submission ID from URL param
router.post(
	"/:id/submit",
	auth(),
	validateRequest(submitSubmissionValidation),
	SubmissionController.submitSubmission,
);

// evaluate coding submission by ID
router.post(
	"/:id/evaluate",
	auth(),
	EvaluationController.evaluateCodingSubmission,
);

// ─── Read Submissions ─────────────────────────────────────────────────────────

// Candidate self-service — must come BEFORE /:id to avoid route shadowing
router.get("/my-submissions", auth(), SubmissionController.getMySubmissions);

// All submissions for a specific attempt
router.get(
	"/attempts/:attemptId",
	auth(),
	SubmissionController.getAttemptSubmissions,
);

// Single submission by ID
router.get("/:id", auth(), SubmissionController.getSubmissionById);

export const SubmissionRoutes = router;
