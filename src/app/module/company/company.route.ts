import { Router } from "express";
import { CompanyController } from "./company.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { CompanyValidation } from "./company.validation";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.post(
	"/create-company",
	auth(),
	validateRequest(CompanyValidation.CreateCompanyZodSchema),
	CompanyController.createCompany,
);

router.post(
	"/verify-company",
	auth(),
	validateRequest(CompanyValidation.VerifyCompanyZodSchema),
	CompanyController.verifyCompany,
);

router.patch(
	"/update-company/:id",
	auth(),
	validateRequest(CompanyValidation.UpdateCompanyZodSchema), 
	CompanyController.updateCompany,
);
router.get("/my-company", auth(), CompanyController.getMyCompany);

router.post(
	"/add-member/:companyId",
	auth(),
	validateRequest(CompanyValidation.AddCompanyMemberZodSchema),
	CompanyController.addCompanyMember,
);

router.post(
	"/:companyId/members",
	auth(),
	validateRequest(CompanyValidation.AddCompanyMemberZodSchema),
	CompanyController.addCompanyMember,
);

router.get(
	"/:companyId/members",
	auth(),
	CompanyController.getCompanyMembers,
);

router.patch(
	"/:companyId/members/:memberUserId",
	auth(),
	validateRequest(CompanyValidation.UpdateMemberRoleZodSchema),
	CompanyController.updateMemberRole,
);

router.delete(
	"/:companyId/members/:memberUserId",
	auth(),
	CompanyController.removeCompanyMember,
);

export const CompanyRoutes = router;
 