import { Router, type Request, type Response, type NextFunction } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { uploadProfilePicture, uploadResume } from "../../lib/multer.js";
import { UserController } from "../user/user.controller.js";
import { UserValidation as UserProfileValidation } from "../user/user.validation.js";
import { AuthController } from "./auth.controller.js";
import { UserValidation } from "./auth.validation.js";

const router = Router();

// Multipart normalizers
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

router.post(
	"/register",
	validateRequest(UserValidation.CandidateRegistrationZodSchema),
	AuthController.registerCandidate,
);

router.post(
	"/verify-email",
	validateRequest(UserValidation.VerifyOtpZodSchema),
	AuthController.verifyRegistrationEmail,
);

router.post(
	"/login",
	validateRequest(UserValidation.LoginZodSchema),
	AuthController.loginUser,
);

router.post(
	"/verify-login-otp",
	validateRequest(UserValidation.VerifyOtpZodSchema),
	AuthController.verifyLoginOtp,
);

router.post(
	"/resend-login-otp",
	validateRequest(UserValidation.ResendOtpZodSchema),
	AuthController.resendLoginOtp,
);

router.post("/google", AuthController.googleLogin);
router.post("/google-login", AuthController.googleLogin);

router.post("/logout", AuthController.logoutUser);

router.get(
	"/me",
	auth(UserRole.ADMIN, UserRole.CANDIDATE, UserRole.SUPER_ADMIN),
	AuthController.getMe,
);

// Profile management routes
router.patch(
	"/me/profile",
	auth(),
	validateRequest(UserProfileValidation.updateProfileZodSchema),
	UserController.updateProfile,
);

router.patch(
	"/me/profile-picture",
	auth(),
	normalizeProfilePictureUpload,
	UserController.updateProfilePicture,
);

router.delete("/me/profile-picture", auth(), UserController.removeProfilePicture);

router.patch(
	"/me/resume",
	auth(),
	normalizeResumeUpload,
	UserController.updateResume,
);

router.delete("/me/resume", auth(), UserController.removeResume);

router.post("/refresh-token", AuthController.refreshToken);

router.post(
	"/forgot-password",
	validateRequest(UserValidation.ForgotPasswordZodSchema),
	AuthController.forgotPassword,
);

router.post(
	"/reset-password",
	validateRequest(UserValidation.ResetPasswordZodSchema),
	AuthController.resetPassword,
);

export const AuthRoutes = router;
