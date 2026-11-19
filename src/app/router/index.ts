import { Router } from "express";
import { AdminManagementRoutes } from "../module/admin-management/admin-management.route.js";
import { AntiCheatingRoutes } from "../module/anti-cheating/anti-cheating.route.js";
import { AssessmentRoutes } from "../module/assessment/assessment.route.js";
import { AuthRoutes } from "../module/auth/auth.route.js";
import { CompanyRoutes } from "../module/company/company.route.js";
import { EvaluationRoutes } from "../module/evaluation/evaluation.route.js";
import { PaymentRoutes } from "../module/payment/payment.route.js";
import { ProblemRoute } from "../module/problem-bank/problem.route.js";
import { RankingResultRoutes } from "../module/ranking-result/rankingresult.route.js";
import { ReportsAnalyticsRoutes } from "../module/repostandAnalytics/reports-analytics.route.js";
import { CalculationRoutes } from "../module/score-calculation/calculation.route.js";
import { SubmissionRoutes } from "../module/submission/submission.route.js";
import { UserRoutes } from "../module/user/user.route.js";

const router = Router();

const routes = [
	{
		path: "/auth",
		route: AuthRoutes,
	},
	{
		path: "/user",
		route: UserRoutes,
	},
	{
		path: "/users",
		route: UserRoutes,
	},
	{
		path: "/company",
		route: CompanyRoutes,
	},
	{
		path: "/payment",
		route: PaymentRoutes,
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
