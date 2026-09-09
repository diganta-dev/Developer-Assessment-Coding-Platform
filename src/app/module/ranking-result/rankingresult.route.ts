import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { RankingResultController } from "./rankingresult.controller";

const router = Router();

// ============================================================================
// Ranking & Result Endpoints
// ============================================================================

// 1. Generate / finalize result for a specific attempt
router.post(
	"/generate/:attemptId",
	auth(),
	RankingResultController.generateAssessmentResult,
);

// 2. Calculate competitive rank & percentile for a candidate attempt
router.get(
	"/rank/:attemptId",
	auth(),
	RankingResultController.calculateCandidateRank,
);

// 3. Generate assessment ranking leaderboard
router.get(
	"/leaderboard/:assessmentId",
	auth(),
	RankingResultController.generateAssessmentRanking,
);

// 4. Publish official assessment results for all participants (POST and PATCH supported)
router.post(
	"/publish/:assessmentId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	RankingResultController.publishAssessmentResult,
);
router.patch(
	"/publish/:assessmentId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	RankingResultController.publishAssessmentResult,
);

// 5. Get current authenticated candidate's results across all assessments
router.get("/my-results", auth(), RankingResultController.getMyResults);

// 6. Get a candidate's attempt result
router.get(
	"/attempt/:attemptId",
	auth(),
	RankingResultController.getCandidateResult,
);

export const RankingResultRoutes = router;
