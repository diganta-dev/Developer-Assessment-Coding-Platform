import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();

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
