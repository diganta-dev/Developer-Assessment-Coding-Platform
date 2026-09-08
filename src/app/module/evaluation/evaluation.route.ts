import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { EvaluationController } from "./evaluation.controller";

const router = Router();

// Automated Judge0 Coding Evaluation
router.post(
	"/coding/:submissionId",
	auth(),
	EvaluationController.evaluateCodingSubmission,
);

// Manual Evaluation (Written questions / Manual grading)
router.post(
	"/manual/:submissionId",
	auth(),
	EvaluationController.manualEvaluateSubmission,
);

// Query all evaluations (paginated, filtered)
router.get("/", auth(), EvaluationController.getAllEvaluations);

// Query single evaluation by ID
router.get("/:id", auth(), EvaluationController.getEvaluationById);

export const EvaluationRoutes = router;
