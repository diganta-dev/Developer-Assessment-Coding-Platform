import { Router, type Request, type Response, type NextFunction } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { uploadProfilePicture, uploadResume } from "../../lib/multer";
import { UserController } from "./user.controller";
import { UserValidation } from "./user.validation";

const router = Router();

// Middleware helper to normalize single file from either profilePicture, image, or file field
const normalizeProfilePictureUpload = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	uploadProfilePicture.fields([
		{ name: "profilePicture", maxCount: 1 },
		{ name: "image", maxCount: 1 },
		{ name: "file", maxCount: 1 },
	])(req, res, (err: unknown) => {
		if (err) return next(err);
		if (req.files && typeof req.files === "object") {
			const filesObj = req.files as Record<string, Express.Multer.File[]>;
			req.file =
				filesObj.profilePicture?.[0] ||
				filesObj.image?.[0] ||
				filesObj.file?.[0] ||
				req.file;
		}
		next();
	});
};

// Middleware helper to normalize single resume from either resume, document, or file field
const normalizeResumeUpload = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	uploadResume.fields([
		{ name: "resume", maxCount: 1 },
		{ name: "document", maxCount: 1 },
		{ name: "file", maxCount: 1 },
	])(req, res, (err: unknown) => {
		if (err) return next(err);
		if (req.files && typeof req.files === "object") {
			const filesObj = req.files as Record<string, Express.Multer.File[]>;
			req.file =
				filesObj.resume?.[0] ||
				filesObj.document?.[0] ||
				filesObj.file?.[0] ||
				req.file;
		}
		next();
	});
};

// 1. Get current authenticated user profile
router.get("/me", auth(), UserController.getProfile);
router.get("/profile", auth(), UserController.getProfile);

// 2. Update basic profile fields
router.patch(
	"/profile",
	auth(),
	validateRequest(UserValidation.updateProfileZodSchema),
	UserController.updateProfile,
);
router.patch(
	"/me/profile",
	auth(),
	validateRequest(UserValidation.updateProfileZodSchema),
	UserController.updateProfile,
);

// 3. Profile Picture Upload & Removal
router.patch(
	"/profile-picture",
	auth(),
	normalizeProfilePictureUpload,
	UserController.updateProfilePicture,
);
router.patch(
	"/me/profile-picture",
	auth(),
	normalizeProfilePictureUpload,
	UserController.updateProfilePicture,
);

router.delete("/profile-picture", auth(), UserController.removeProfilePicture);
router.delete("/me/profile-picture", auth(), UserController.removeProfilePicture);

// 4. Resume Document Upload & Removal
router.patch(
	"/resume",
	auth(),
	normalizeResumeUpload,
	UserController.updateResume,
);
router.patch(
	"/me/resume",
	auth(),
	normalizeResumeUpload,
	UserController.updateResume,
);

router.delete("/resume", auth(), UserController.removeResume);
router.delete("/me/resume", auth(), UserController.removeResume);

export const UserRoutes = router;
