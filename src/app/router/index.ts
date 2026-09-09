import { Router } from "express";
import { AssessmentRoutes } from "../module/assessment/assessment.route";
import { AuthRoutes } from "../module/auth/auth.route";
import { CompanyRoutes } from "../module/company/company.route";
import { EvaluationRoutes } from "../module/evaluation/evaluation.route";
import { ProblemRoute } from "../module/problem-bank/problem.route";
import { CalculationRoutes } from "../module/score-calculation/calculation.route";
import { RankingResultRoutes } from "../module/ranking-result/rankingresult.route";
import { ReportsAnalyticsRoutes } from "../module/repostandAnalytics/reports-analytics.route";
import { AdminManagementRoutes } from "../module/admin-management/admin-management.route";
import { AntiCheatingRoutes } from "../module/anti-cheating/anti-cheating.route";
import { SubmissionRoutes } from "../module/submission/submission.route";

const router = Router();

const routes = [
	{
		path: "/auth",
		route: AuthRoutes,
	},
	{
		path: "/company",
		route: CompanyRoutes,
	},
	{
		path: "/problem",
		route: ProblemRoute,
	},
	{
		path: "/assessment",
		route: AssessmentRoutes,
	},
	{
		path: "/submission",
		route: SubmissionRoutes,
	},
	{
		path: "/evaluation",
		route: EvaluationRoutes,
	},
	{
		path: "/score-calculation",
		route: CalculationRoutes,
	},
	{
		path: "/ranking-result",
		route: RankingResultRoutes,
	},
	{
		path: "/reports-analytics",
		route: ReportsAnalyticsRoutes,
	},
	{
		path: "/admin-management",
		route: AdminManagementRoutes,
	},
	{
		path: "/anti-cheating",
		route: AntiCheatingRoutes,
	},
];

routes.forEach((route) => {
	router.use(route.path, route.route);
});

export default router;
