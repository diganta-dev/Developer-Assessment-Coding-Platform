import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ProblemController } from "./problem.controller";
import { createProblemValidation } from "./problem.validation";

const router = Router();

router.post(
	"/create-problem",
	auth(),
	validateRequest(createProblemValidation),
	ProblemController.createProblem,
);

export const ProblemRoute = router;
