import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { ReportsAnalyticsController } from "./reports-analytics.controller";

const router = Router();

// ============================================================================
// Reports & Analytics Routes
// ============================================================================

// 1. Generate / Refresh comprehensive assessment report
router.get(
	"/assessment/:assessmentId/report",
	auth(),
	ReportsAnalyticsController.generateAssessmentReport,
);
router.post(
	"/assessment/:assessmentId/report",
	auth(),
	ReportsAnalyticsController.generateAssessmentReport,
);

// 2. Score frequency distribution & statistical variance
router.get(
	"/assessment/:assessmentId/score-distribution",
	auth(),
	ReportsAnalyticsController.getScoreDistribution,
);

// 3. Granular pass/fail statistics and near-miss diagnostics
router.get(
	"/assessment/:assessmentId/pass-fail",
	auth(),
	ReportsAnalyticsController.getPassFailStatistics,
);

// 4. Operational KPIs and problem difficulty statistics for an assessment
router.get(
	"/assessment/:assessmentId/statistics",
	auth(),
	ReportsAnalyticsController.getAssessmentStatistics,
);

// 5. Individual candidate performance diagnostic & cohort benchmark
router.get(
	"/attempt/:attemptId/performance",
	auth(),
	ReportsAnalyticsController.getCandidatePerformance,
);

// 6. Candidate career & multi-assessment analytical report
router.get(
	"/candidate/:candidateId/report",
	auth(),
	ReportsAnalyticsController.generateCandidateReport,
);

// 7. Organization recruitment pipeline & executive talent report
router.get(
	"/company/:companyId/report",
	auth(),
	ReportsAnalyticsController.generateCompanyReport,
);

export const ReportsAnalyticsRoutes = router;
