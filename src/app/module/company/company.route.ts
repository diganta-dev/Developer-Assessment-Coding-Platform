import { Router } from "express";
import { CompanyController } from "./company.controller";
import { validateRequest } from "../../middleware/validateRequest";
import { CompanyValidation } from "./company.validation";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.post(
	"/create-company",auth(),
	validateRequest(CompanyValidation.CreateCompanyZodSchema),
	CompanyController.createCompany,
);

router.post(
	"/verify-company",auth(),
	validateRequest(CompanyValidation.VerifyCompanyZodSchema),
	CompanyController.verifyCompany,
);

router.patch(
	"/update-company/:id",
	auth(),
	validateRequest(CompanyValidation.UpdateCompanyZodSchema), 
	CompanyController.updateCompany,
);

export const CompanyRoutes = router;
