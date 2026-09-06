import { Router } from "express";
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
];

routes.forEach((route) => {
	router.use(route.path, route.route);
});

export default router;