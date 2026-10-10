import { Router, type Request, type Response, type NextFunction } from "express";
import { uploadProfilePicture } from "../../lib/multer";
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


// Middleware helper to normalize single logo from either logo, image, profilePicture, or file field
const normalizeCompanyLogoUpload = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	uploadProfilePicture.fields([
		{ name: "logo", maxCount: 1 },
		{ name: "image", maxCount: 1 },
		{ name: "profilePicture", maxCount: 1 },
		{ name: "file", maxCount: 1 },
	])(req, res, (err: unknown) => {
		if (err) return next(err);
		if (req.files && typeof req.files === "object") {
			const filesObj = req.files as Record<string, Express.Multer.File[]>;
			req.file =
				filesObj.logo?.[0] ||
				filesObj.image?.[0] ||
				filesObj.profilePicture?.[0] ||
				filesObj.file?.[0] ||
				req.file;
		}
		next();
	});
};

router.patch(
	"/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	normalizeCompanyLogoUpload,
	CompanyController.updateCompanyLogo,
);

router.patch(
	"/my-company/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	normalizeCompanyLogoUpload,
	CompanyController.updateCompanyLogo,
);

router.patch(
	"/:id/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	normalizeCompanyLogoUpload,
	CompanyController.updateCompanyLogo,
);

router.delete(
	"/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	CompanyController.removeCompanyLogo,
);

router.delete(
	"/my-company/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	CompanyController.removeCompanyLogo,
);

router.delete(
	"/:id/logo",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		CompanyMemberRole.COMPANY_OWNER,
		CompanyMemberRole.COMPANY_ADMIN,
	),
	CompanyController.removeCompanyLogo,
);

export const CompanyRoutes = router;
