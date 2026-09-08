import { Router } from "express";
import { AssessmentRoutes } from "../module/assessment/assessment.route";
import { AuthRoutes } from "../module/auth/auth.route";
import { CompanyRoutes } from "../module/company/company.route";
import { EvaluationRoutes } from "../module/evaluation/evaluation.route";
import { ProblemRoute } from "../module/problem-bank/problem.route";
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
];

routes.forEach((route) => {
	router.use(route.path, route.route);
});

export default router;
