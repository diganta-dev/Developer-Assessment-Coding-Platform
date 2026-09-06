import { prisma } from "../../lib/prisma";
import AppError from "../../utils/AppError";     
import httpStatus from "http-status";
import { ICompanyPayload, IUpdateCompanyPayload, IVerifyCompanyPayload } from "./company.interface"
import redisClient from "../../lib/redis";
import path from "path";
import crypto from "crypto";
import { transporter } from "../../lib/nodemailer";
import config from "../../config";
import ejs from "ejs";
import { slugify } from "../../utils/slug";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";

const generateUniqueCompanySlug = async (name: string): Promise<string> => {
	const baseSlug = slugify(name) || "company";
	let slug = baseSlug;
	let counter = 1;

	while (await prisma.company.findUnique({ where: { slug } })) {
		slug = `${baseSlug}-${counter}`;
		counter++;
	}

	return slug;
};

const createCompany = async (payload: ICompanyPayload, creatorUserId?: string) => {
	const { name, email } = payload;

	const isExistCompany = await prisma.company.findFirst({
		where: {
			OR: [{ name }, { email }],
		},
	});
	if (isExistCompany) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"A company with this name or email already exists",
		);
	}
	const otp = crypto.randomInt(100000, 999999).toString();
	const expirationSeconds = 5 * 60;
	const key = `register-verify-otp:${email}`;
	await redisClient.set(key, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds, // 5 minutes in seconds
		},
	});

	const redisPayloadUserData = {
		name,
		email,
		description: payload?.description,
		website: payload?.website,
		logoUrl: payload?.logoUrl,
		creatorUserId: creatorUserId || payload?.userId,
	};
	const redisPayload = JSON.stringify(redisPayloadUserData);
	const companyRegistrationKey = `register-company:${email}`;
	await redisClient.set(companyRegistrationKey, redisPayload, {
		expiration: {
			type: "EX",
			value: expirationSeconds, // 5 minutes in seconds
		},
	});
	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/company-registration-otp.ejs",
	);
	const templateData = {
		name: name,
		otp: otp,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: email,
		subject: "Company Registration verification",
		html: html,
	});

	return {
		message: "Verification OTP sent to your company email",
	};
};

// verify company registration otp and assign creator as COMPANY_OWNER
const verifyCompany = async (payload: IVerifyCompanyPayload, verifierUserId?: string) => {
	const { email, otp } = payload;
	const company = await prisma.company.findUnique({
		where: { email },
	});
	if (company) {
		if (company.isVerified) {
			throw new AppError(httpStatus.BAD_REQUEST, "Company already verified");
		}
		throw new AppError(httpStatus.BAD_REQUEST, "Company already registered");
	}

	const redisOtp = await redisClient.get(`register-verify-otp:${email}`);
	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}

	const redisUserData = await redisClient.get(`register-company:${email}`);
	if (!redisUserData) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"User registration data not found or expired",
		);
	}

	const userData = JSON.parse(redisUserData);

	// Auto generate unique slug for the company
	const slug = await generateUniqueCompanySlug(userData.name);

	// Resolve the owner user ID:
	// 1. Authenticated user doing the verification (if present)
	// 2. Authenticated creator stored in Redis during createCompany
	// 3. Existing user matching the company/contact email
	let ownerUserId: string | undefined = verifierUserId || userData.creatorUserId;

	if (!ownerUserId) {
		const existingUser = await prisma.user.findUnique({
			where: { email: userData.email },
		});
		if (existingUser) {
			ownerUserId = existingUser.id;
		}
	}

	// 4. If no registered user exists, provision a verified user account for this company owner
	if (!ownerUserId) {
		const createdOwnerUser = await prisma.user.create({
			data: {
				name: userData.name,
				email: userData.email,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
			},
		});
		ownerUserId = createdOwnerUser.id;
	}

	// Atomically create the company and assign the owner in CompanyMember table
	const createdCompany = await prisma.$transaction(async (tx) => {
		const newCompany = await tx.company.create({
			data: {
				email: userData.email,
				name: userData.name,
				slug,
				isVerified: true,
				description: userData?.description,
				website: userData?.website,
				logoUrl: userData?.logoUrl,
				members: {
					create: {
						userId: ownerUserId!,
						role: CompanyMemberRole.COMPANY_OWNER,
					},
				},
			},
			include: {
				members: {
					include: {
						user: {
							select: {
								id: true,
								name: true,
								email: true,
								role: true,
							},
						},
					},
				},
			},
		});

		return newCompany;
	});

	await redisClient.del(`register-verify-otp:${email}`);
	await redisClient.del(`register-company:${email}`);

	const templatePath = path.join(
		process.cwd(),
		"src/app/templates/company-welcome-email.ejs",
	);
	const templateData = {
		name: createdCompany.name,
		appName: config.application_name || config.app_name,
	};
	const html = await ejs.renderFile(templatePath, templateData);
	await transporter.sendMail({
		from: config.SENDER_EMAIL_USER,
		to: email,
		subject: `Welcome to ${config.application_name || config.app_name}`,
		html: html,
	});

	return createdCompany;
};

const updateCompany = async (
	companyId: string,
	user: { userId: string; role: UserRole },
	payload: IUpdateCompanyPayload,
) => {
	const isExistCompany = await prisma.company.findUnique({
		where: { id: companyId },
	});

	if (!isExistCompany) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	// Platform SUPER_ADMIN has full system override
	const isPlatformSuperAdmin = user.role === UserRole.SUPER_ADMIN;

	if (!isPlatformSuperAdmin) {
		const member = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: user.userId,
					companyId,
				},
			},
		});

		if (!member) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a member of this company",
			);
		}

		const allowedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		if (!allowedRoles.includes(member.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to update this company. Only company owner or admin can perform this action.",
			);
		}
	}

	let newSlug: string | undefined;
	if (payload.name && payload.name !== isExistCompany.name) {
		newSlug = await generateUniqueCompanySlug(payload.name);
	}

	const updatedCompany = await prisma.company.update({
		where: { id: companyId },
		data: {
			...payload,
			...(newSlug ? { slug: newSlug } : {}),
		},
		include: {
			members: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
							email: true,
							role: true,
						},
					},
				},
			},
		},
	});

	return updatedCompany;
};

export const CompanyService = {
	createCompany,
	verifyCompany,
	updateCompany,
};
