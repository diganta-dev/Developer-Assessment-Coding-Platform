import { z } from "zod";

const passwordSchema = z
	.string()
	.min(8, "Password must be at least 8 characters")
	.max(30, "Password must be at most 30 characters")
	.regex(/[a-z]/, "Password must contain at least one lowercase letter")
	.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
	.regex(/[0-9]/, "Password must contain at least one number")
	.regex(
		/[^a-zA-Z0-9]/,
		"Password must contain at least one special character",
	);

export const CandidateRegistrationZodSchema = z.object({
	name: z
		.string()
		.min(3, "Name must be at least 3 characters")
		.max(50, "Name must be at most 50 characters"),
	email: z
		.string()
		.email("follow the email format"),
	password: passwordSchema,
	candidateProfile: z
		.object({
			phone: z.string().optional(),
			contactNumber: z.string().optional(),
			bio: z.string().optional(),
			location: z.string().optional(),
			resumeUrl: z.string().url("Invalid resume URL").optional(),
			githubUrl: z.string().url("Invalid GitHub URL").optional(),
			linkedinUrl: z.string().url("Invalid LinkedIn URL").optional(),
		})
		.optional(),
});

export const PatientRegistrationZodSchema = CandidateRegistrationZodSchema;

export const VerifyOtpZodSchema = z.object({
	email: z
		.string()
		.email("follow the email format"),
	otp: z
		.string()
		.length(6, "OTP must be exactly 6 digits"),
});

export const patientValidationZodSchema = VerifyOtpZodSchema;

export const LoginZodSchema = z.object({
	email: z
		.string()
		.email("follow the email format"),
	password: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long."),
});

export const GoogleLoginZodSchema = z.object({
	idToken: z
		.string()
		.min(1, "Google ID token cannot be empty"),
});

export const ForgotPasswordZodSchema = z.object({
	email: z
		.string()
		.email("follow the email format"),
});

export const ResetPasswordZodSchema = z.object({
	email: z
		.string()
		.email("follow the email format"),
	newPassword: passwordSchema,
	otp: z
		.string()
		.length(6, "OTP must be exactly 6 digits"),
});

export const RefreshTokenZodSchema = z.object({
	refreshToken: z.string().optional(),
});

export const UserValidation = {
	CandidateRegistrationZodSchema,
	PatientRegistrationZodSchema,
	patientValidationZodSchema,
	VerifyOtpZodSchema,
	LoginZodSchema,
	GoogleLoginZodSchema,
	ForgotPasswordZodSchema,
	ResetPasswordZodSchema,
	RefreshTokenZodSchema,
};

export const AuthValidation = UserValidation;