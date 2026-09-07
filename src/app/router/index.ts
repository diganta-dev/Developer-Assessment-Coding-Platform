import { Router } from "express";
import { AssessmentRoutes } from "../module/assessment/assessment.route";
import { AuthRoutes } from "../module/auth/auth.route";
import { CompanyRoutes } from "../module/company/company.route";
import { ProblemRoute } from "../module/Problem Bank/problem.route";

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
];

routes.forEach((route) => {
	router.use(route.path, route.route);
});

export default router;
