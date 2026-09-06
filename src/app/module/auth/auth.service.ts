import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
	IForgotPasswordPayload,
	ILoginUserPayload,
	IRegisterCandidatePayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
	IVerifyRegistrationEmailPayload,
} from "./auth.interface";
import type { TokenPayload } from "google-auth-library";

import crypto from "crypto";

import path from "path";
import ejs from "ejs";
import AppError from "../../utils/AppError";
import redisClient from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import { googleClient } from "../../lib/googleAuth";


const registerCandidate = async (payload: IRegisterCandidatePayload) => {
	const { name, password, candidateProfile } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);
	const otp = crypto.randomInt(100000, 999999).toString();

	const expirationSeconds = 5 * 60; // 5 minutes
	const key = `register-verify-otp:${email}`;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const redisPayloadUserData = {
		name,
		email,
		password: hashedPassword,
		candidateProfile,
	};
	const userRegistrationKey = `register-user:${email}`;
	await redisClient.set(userRegistrationKey, JSON.stringify(redisPayloadUserData), {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/user-registration-otp.ejs",
	);
	const templateData = {
		name: name,
		otp: otp,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: email,
		subject: "Registration Verification OTP",
		html: html,
	});
};

const verifyRegistrationEmail = async (
	payload: IVerifyRegistrationEmailPayload,
) => {
	const { email, otp } = payload;
	const cleanEmail = email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email: cleanEmail },
	});

	if (user) {
		if (user.isVerified) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"User email is already verified",
			);
		}
		if (!user.isActive) {
			throw new AppError(httpStatus.FORBIDDEN, "User account is deactivated");
		}
	}

	const redisOtp = await redisClient.get(`register-verify-otp:${cleanEmail}`);
	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}

	const redisUserData = await redisClient.get(`register-user:${cleanEmail}`);
	if (!redisUserData) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"User registration data not found or expired",
		);
	}

	const userData: IRegisterCandidatePayload = JSON.parse(redisUserData);

	const createdUser = await prisma.user.create({
		data: {
			name: userData.name,
			email: cleanEmail,
			password: userData.password,
			role: UserRole.CANDIDATE,
			isActive: true,
			isVerified: true,
			candidateProfile: {
				create: {
					phone: userData.candidateProfile?.phone || userData.candidateProfile?.contactNumber,
					bio: userData.candidateProfile?.bio,
					location: userData.candidateProfile?.location,
					resumeUrl: userData.candidateProfile?.resumeUrl,
					githubUrl: userData.candidateProfile?.githubUrl,
					linkedinUrl: userData.candidateProfile?.linkedinUrl,
				},
			},
		},
		omit: { password: true },
		include: { candidateProfile: true },
	});

	await redisClient.del(`register-verify-otp:${cleanEmail}`);
	await redisClient.del(`register-user:${cleanEmail}`);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/welcome-email.ejs",
	);
	const templateData = {
		name: createdUser.name,
		appName: config.app_name,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: cleanEmail,
		subject: `Welcome to ${config.app_name}`,
		html: html,
	});

	const { candidateProfile, ...users } = createdUser;
	const jwtPayload = {
		userId: users.id,
		name: users.name,
		email: users.email,
		role: users.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user: users,
		candidateProfile,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
		include: {
			candidateProfile: true,
			companyMembers: {
				include: {
					company: true,
				},
			},
		},
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (!user.isActive) {
		throw new AppError(httpStatus.FORBIDDEN, "Your account is deactivated");
	}

	if (!user.password && user.googleId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This account is registered with Google. Please login with Google.",
		);
	}

	if (!user.password) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Account has no password set. Please login with Google or reset password.",
		);
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password,
	);

	if (!isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid credentials");
	}

	const primaryMembership = user.companyMembers?.[0];

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		tokenVersion: user.tokenVersion,
		...(primaryMembership
			? {
					companyId: primaryMembership.companyId,
					companyRole: primaryMembership.role,
				}
			: {}),
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	const { password: _, ...userData } = user;

	return {
		user: userData,
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (tokenOrPayload: string | { idToken: string }) => {
	const token = typeof tokenOrPayload === "string" ? tokenOrPayload : tokenOrPayload.idToken;

	if (!token) {
		throw new AppError(httpStatus.BAD_REQUEST, "Google ID token is required");
	}

	let googleIdTokenPayload: TokenPayload | undefined | null = null;

	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: token,
			audience: config.google_client_id,
		});

		googleIdTokenPayload = ticket.getPayload();
	} catch (error) {
		console.log("Google ID Token verification failed:", error);
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid or expired Google token",
		);
	}

	if (!googleIdTokenPayload || !googleIdTokenPayload.email) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Invalid Google token payload or email not found",
		);
	}

	const email = googleIdTokenPayload.email.trim().toLowerCase();

	// Check if user exists by email or googleId
	let user = await prisma.user.findUnique({
		where: { email },
		include: {
			candidateProfile: true,
			companyMembers: {
				include: {
					company: true,
				},
			},
		},
	});

	if (user) {
		if (!user.isActive) {
			throw new AppError(httpStatus.FORBIDDEN, "Your account is deactivated");
		}

		// Link Google ID or update avatar if not present
		const updates: { googleId?: string; profilePictureUrl?: string; isVerified?: boolean } = {};
		if (!user.googleId && googleIdTokenPayload.sub) {
			updates.googleId = googleIdTokenPayload.sub;
		}
		if (!user.profilePictureUrl && googleIdTokenPayload.picture) {
			updates.profilePictureUrl = googleIdTokenPayload.picture;
		}
		if (!user.isVerified) {
			updates.isVerified = true;
		}

		if (Object.keys(updates).length > 0) {
			user = await prisma.user.update({
				where: { id: user.id },
				data: updates,
				include: {
					candidateProfile: true,
					companyMembers: {
						include: {
							company: true,
						},
					},
				},
			});
		}
	} else {
		// Create new Candidate
		user = await prisma.user.create({
			data: {
				name: googleIdTokenPayload.name || email.split("@")[0],
				email,
				googleId: googleIdTokenPayload.sub,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				profilePictureUrl: googleIdTokenPayload.picture,
				candidateProfile: {
					create: {
						profileImage: googleIdTokenPayload.picture,
					},
				},
			},
			include: {
				candidateProfile: true,
				companyMembers: {
					include: {
						company: true,
					},
				},
			},
		});

		const templatePath = path.join(
			process.cwd(),
			"src/app/templates/welcome-email.ejs",
		);
		const templateData = {
			name: user.name,
			appName: config.app_name,
		};
		const html = await ejs.renderFile(templatePath, templateData);
		await transporter.sendMail({
			from: config.SENDER_EMAIL_USER,
			to: user.email,
			subject: `Welcome to ${config.app_name}`,
			html: html,
		});
	}

	const primaryMembership = user.companyMembers?.[0];

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		tokenVersion: user.tokenVersion,
		...(primaryMembership
			? {
					companyId: primaryMembership.companyId,
					companyRole: primaryMembership.role,
				}
			: {}),
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	const { password: _, ...userData } = user;

	return {
		user: userData,
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			candidateProfile: true,
			companyMembers: {
				include: {
					company: true,
				},
			},
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			config.node_env === "development"
				? verifiedRefreshToken.error
				: "Invalid refresh token",
		);
	}

	const data = verifiedRefreshToken.data as JwtPayload & {
		userId: string;
		tokenVersion?: number;
	};

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
		include: {
			candidateProfile: true,
			companyMembers: {
				include: {
					company: true,
				},
			},
		},
		omit: {
			password: true,
		},
	});

	if (!user || !user.isActive) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User is inactive or not found",
		);
	}

	if (
		typeof data.tokenVersion === "number" &&
		data.tokenVersion !== user.tokenVersion
	) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Refresh token is revoked or outdated. Please log in again.",
		);
	}

	const primaryMembership = user.companyMembers?.[0];

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		tokenVersion: user.tokenVersion,
		...(primaryMembership
			? {
					companyId: primaryMembership.companyId,
					companyRole: primaryMembership.role,
				}
			: {}),
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const newRefreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		user,
		accessToken,
		refreshToken: newRefreshToken,
	};
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const email = payload.email.trim().toLowerCase();
	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (!isUserExists.isActive) {
		throw new AppError(httpStatus.FORBIDDEN, "Your account is deactivated");
	}

	if (!isUserExists.password && isUserExists.googleId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This account is registered with Google. Please login with Google.",
		);
	}

	const otp = crypto.randomInt(100000, 999999).toString();
	const expirationSeconds = 5 * 60;
	const key = `forgot-password-otp:${isUserExists.email}`;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/forget-password.ejs",
	);
	const templateData = {
		name: isUserExists.name,
		email: isUserExists.email,
		otp,
		appName: config.app_name,
		expiresIn: "5 minutes",
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: isUserExists.email,
		subject: "Password Reset OTP",
		html: html,
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, newPassword, otp } = payload;
	const cleanEmail = email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email: cleanEmail },
	});

	if (!isUserExists) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (!isUserExists.isActive) {
		throw new AppError(httpStatus.FORBIDDEN, "Your account is deactivated");
	}

	const key = `forgot-password-otp:${isUserExists.email}`;
	const storedOtp = await redisClient.get(key);

	if (!storedOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	if (storedOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP does not match");
	}

	const hashedPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: { email: isUserExists.email },
		data: {
			password: hashedPassword,
		},
	});

	await redisClient.del(key);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/reset-password-success.ejs",
	);
	const templateData = {
		name: isUserExists.name,
		appName: config.app_name,
	};

	const html = await ejs.renderFile(templatePath, templateData);

	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: isUserExists.email,
		subject: "Password Reset Successful",
		html: html,
	});
};

export const AuthService = {
	registerCandidate,
	registerPatient: registerCandidate,
	registerUser: registerCandidate,
	verifyRegistrationEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
};