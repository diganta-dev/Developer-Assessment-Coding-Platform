import { Router } from "express";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { CompanyController } from "./company.controller";
import { CompanyValidation } from "./company.validation";

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
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(CompanyValidation.UpdateCompanyZodSchema),
	CompanyController.updateCompany,
);

router.get(
	"/my-company",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	CompanyController.getMyCompany,
);

router.post(
	"/add-member/:companyId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(CompanyValidation.AddCompanyMemberZodSchema),
	CompanyController.addCompanyMember,
);

router.post(
	"/:companyId/members",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(CompanyValidation.AddCompanyMemberZodSchema),
	CompanyController.addCompanyMember,
);

router.get(
	"/:companyId/members",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
		CompanyMemberRole.ASSESSMENT_CREATOR,
		CompanyMemberRole.EVALUATOR,
	),
	CompanyController.getCompanyMembers,
);

router.patch(
	"/:companyId/members/:memberUserId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	validateRequest(CompanyValidation.UpdateMemberRoleZodSchema),
	CompanyController.updateMemberRole,
);

router.delete(
	"/:companyId/members/:memberUserId",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	CompanyController.removeCompanyMember,
);

export const CompanyRoutes = router;
