import { Router } from "express";
import { AuthRoutes } from "../module/auth/auth.route";
import { CompanyRoutes } from "../module/company/company.route";

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
];

routes.forEach((route) => {
	router.use(route.path, route.route);
});

export default router;