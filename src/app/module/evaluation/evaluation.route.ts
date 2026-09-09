import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { EvaluationController } from "./evaluation.controller";

const router = Router();

// Automated Judge0 Coding Evaluation
router.post(
	"/coding/:submissionId",
	auth(),
	EvaluationController.evaluateCodingSubmission,
);

// Automated MCQ Evaluation
router.post(
	"/mcq/:submissionId",
	auth(),
	EvaluationController.evaluateMCQSubmission,
);

// Written Question Evaluation
router.post(
	"/written/:submissionId",
	auth(),
	EvaluationController.evaluateWrittenSubmission,
);

// Manual Evaluation (Written questions / Manual grading)
router.post(
	"/manual/:submissionId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	EvaluationController.manualEvaluateSubmission,
);

// Calculate Attempt Total Score & Aggregate Results
router.post(
	"/attempt/:attemptId/score",
	auth(),
	EvaluationController.calculateAttemptScore,
);

router.get(
	"/attempt/:attemptId/score",
	auth(),
	EvaluationController.calculateAttemptScore,
);

// Query all evaluations (paginated, filtered)
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
	EvaluationController.getAllEvaluations,
);

// Query single evaluation by ID
router.get("/:id", auth(), EvaluationController.getEvaluationById);

export const EvaluationRoutes = router;
