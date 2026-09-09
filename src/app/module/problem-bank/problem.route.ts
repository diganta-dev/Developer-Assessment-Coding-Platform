import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { ProblemController } from "./problem.controller";
import {
	createProblemValidation,
	updateProblemValidation,
} from "./problem.validation";

const router = Router();

// Create problem (Platform Admins or Company Owner/Admin/Creator)
router.post(
	"/create-problem",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(createProblemValidation),
	ProblemController.createProblem,
);

// Get all problems across platform (Super Admin and Admin only)
router.get(
	"/",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	ProblemController.getAllProblems,
);

router.get(
	"/all-problems",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	ProblemController.getAllProblems,
);

// Get problems created by the logged-in user's company (Company Owner, Admin, Assessment Creator, Evaluator)
router.get(
	"/company-problems",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ProblemController.getCompanyProblems,
);

router.get(
	"/my-company-problems",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	ProblemController.getCompanyProblems,
);

// Get single problem by ID (defined after static routes to avoid URL collisions)
router.get("/:id", auth(), ProblemController.getSingleProblem);

// Update problem by ID (Platform Admins or Company Owner/Admin/Creator)
router.patch(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	validateRequest(updateProblemValidation),
	ProblemController.updateProblem,
);

// Delete problem by ID (Platform Admins or Company Owner/Admin/Creator)
router.delete(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
	),
	ProblemController.deleteProblem,
);

export const ProblemRoute = router;
