import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { CalculationController } from "./calculation.controller";

const router = Router();

// ============================================================================
// Score Calculation Endpoints
// ============================================================================

// 1. Unified individual submission score calculation (orchestrates Coding, MCQ, Written)
router.get(
	"/submission/:submissionId",
	auth(),
	CalculationController.calculateSubmissionScore,
);
router.post(
	"/submission/:submissionId",
	auth(),
	CalculationController.calculateSubmissionScore,
);

// 2. Granular coding submission score breakdown (public vs hidden tests, memory, time, marks)
router.get(
	"/coding/:submissionId/score",
	auth(),
	CalculationController.calculateCodingScore,
);
router.post(
	"/coding/:submissionId/score",
	auth(),
	CalculationController.calculateCodingScore,
);

// 3. Granular MCQ submission score breakdown (options, selected option, explanation, marks)
router.get(
	"/mcq/:submissionId/score",
	auth(),
	CalculationController.calculateMCQScore,
);
router.post(
	"/mcq/:submissionId/score",
	auth(),
	CalculationController.calculateMCQScore,
);

// 4. Granular Written submission score breakdown (word count check, examiner marks & feedback)
router.get(
	"/written/:submissionId/score",
	auth(),
	CalculationController.calculateWrittenScore,
);
router.post(
	"/written/:submissionId/score",
	auth(),
	CalculationController.calculateWrittenScore,
);

// 5. Attempt total score aggregation and result persistence
router.get(
	"/attempt/:attemptId",
	auth(),
	CalculationController.calculateAttemptScore,
);
router.post(
	"/attempt/:attemptId",
	auth(),
	CalculationController.calculateAttemptScore,
);

export const CalculationRoutes = router;
