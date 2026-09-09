import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { ReportsAnalyticsController } from "./reports-analytics.controller";

const router = Router();

// ============================================================================
// Reports & Analytics Routes
// ============================================================================

// 1. Generate / Refresh comprehensive assessment report
router.get(
	"/assessment/:assessmentId/report",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ReportsAnalyticsController.generateAssessmentReport,
);
router.post(
	"/assessment/:assessmentId/report",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ReportsAnalyticsController.generateAssessmentReport,
);

// 2. Score frequency distribution & statistical variance
router.get(
	"/assessment/:assessmentId/score-distribution",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ReportsAnalyticsController.getScoreDistribution,
);

// 3. Granular pass/fail statistics and near-miss diagnostics
router.get(
	"/assessment/:assessmentId/pass-fail",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ReportsAnalyticsController.getPassFailStatistics,
);

// 4. Operational KPIs and problem difficulty statistics for an assessment
router.get(
	"/assessment/:assessmentId/statistics",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
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
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ReportsAnalyticsController.generateCompanyReport,
);

export const ReportsAnalyticsRoutes = router;
