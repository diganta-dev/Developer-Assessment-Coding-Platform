import type { UserRole } from "../../../generated/prisma/enums";

export interface ILoginUserPayload {
	email: string;
	password: string;
}

export interface IRegisterCandidatePayload {
	name: string;
	email: string;
	password: string;
	candidateProfile?: {
		phone?: string;
		contactNumber?: string;
		bio?: string;
		location?: string;
		resumeUrl?: string;
		githubUrl?: string;
		linkedinUrl?: string;
	};
}

export type IRegisterPatientPayload = IRegisterCandidatePayload;

export interface IVerifyRegistrationEmailPayload {
	email: string;
	otp: string;
}

export interface IRequestUser {
	userId: string;
	email: string;
	name: string;
	role: UserRole;
}

export interface IGoogleLoginPayload {
	idToken: string;
}

export interface IForgotPasswordPayload {
	email: string;
}

export interface IResetPasswordPayload {
	email: string;
	newPassword: string;
	otp: string;
}

export interface IVerifyLoginOtpPayload {
	email: string;
	otp: string;
}

export interface IResendLoginOtpPayload {
	email: string;
}

export type ILoginResult =
	| {
			requiresVerification: false;
			user: Record<string, unknown>;
			accessToken: string;
			refreshToken: string;
	  }
	| {
			requiresVerification: true;
			email: string;
			message: string;
	  };
