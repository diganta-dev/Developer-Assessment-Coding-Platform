import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import type { SignOptions } from "jsonwebtoken";
import path from "path";
import { CompanyMemberRole, UserRole } from "../../../generated/prisma/enums";
import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import redisClient from "../../lib/redis";
import AppError from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import { slugify } from "../../utils/slug";
import type {
	IAddCompanyMemberPayload,
	ICompanyPayload,
	IUpdateCompanyPayload,
	IVerifyCompanyPayload,
} from "./company.interface";

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

const createCompany = async (
	payload: ICompanyPayload,
	creatorUserId: string,
) => {
	const name = payload.name.trim();
	const email = payload.email.trim().toLowerCase();

	const creatorUser = await prisma.user.findUnique({
		where: { id: creatorUserId },
	});

	if (!creatorUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"User not found. You must be registered and logged in to create a company.",
		);
	}

	if (!creatorUser.isActive) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is inactive. Please contact support.",
		);
	}

	// Rule: 1 user can only belong to 1 company
	const existingMembership = await prisma.companyMember.findFirst({
		where: { userId: creatorUserId },
	});
	if (existingMembership) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You are already associated with a company. A user can only belong to one company.",
		);
	}

	const isExistCompany = await prisma.company.findFirst({
		where: {
			OR: [
				{
					name: {
						equals: name,
						mode: "insensitive",
					},
				},
				{ email },
			],
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
		creatorUserId: creatorUser.id,
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

// verify company registration otp and assign registered creator as COMPANY_OWNER
const verifyCompany = async (
	payload: IVerifyCompanyPayload,
	verifierUserId: string,
) => {
	const { otp } = payload;
	const email = payload.email.trim().toLowerCase();
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
			"Company registration data not found or expired",
		);
	}

	const userData = JSON.parse(redisUserData);

	// Verify that the person verifying is the registered user who initiated registration
	if (userData.creatorUserId !== verifierUserId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to verify this company registration.",
		);
	}

	const ownerUser = await prisma.user.findUnique({
		where: { id: verifierUserId },
	});
	if (!ownerUser) {
		throw new AppError(httpStatus.NOT_FOUND, "Registered user not found");
	}

	// Auto generate unique slug for the company
	const slug = await generateUniqueCompanySlug(userData.name);

	// Create company and assign registered user as COMPANY_OWNER
	const createdCompany = await prisma.company.create({
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
					userId: ownerUser.id,
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

	await redisClient.del(`register-verify-otp:${email}`);
	await redisClient.del(`register-company:${email}`);

	try {
		const templatePath = path.join(
			process.cwd(),
			"src/app/templates/company-welcome-email.ejs",
		);
		const templateData = {
			name: createdCompany.name,
			email: userData.email,
			appName: config.application_name || config.app_name,
		};
		const html = await ejs.renderFile(templatePath, templateData);
		await transporter.sendMail({
			from: config.SENDER_EMAIL_USER,
			to: email,
			subject: `Welcome to ${config.application_name || config.app_name}`,
			html: html,
		});
	} catch (mailError) {
		console.error("Failed to send welcome email:", mailError);
	}

	// Increment tokenVersion so any previous candidate tokens are revoked
	const updatedOwner = await prisma.user.update({
		where: { id: ownerUser.id },
		data: { tokenVersion: { increment: 1 } },
	});

	// Generate refreshed JWT tokens for the owner user with company details
	const jwtPayload = {
		userId: updatedOwner.id,
		name: updatedOwner.name,
		email: updatedOwner.email,
		role: updatedOwner.role,
		tokenVersion: updatedOwner.tokenVersion,
		companyId: createdCompany.id,
		companyRole: CompanyMemberRole.COMPANY_OWNER,
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
		...createdCompany,
		accessToken,
		refreshToken,
	};
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

	// Disallow updating email through general company profile update
	const { email, ...allowedPayload } = payload as any;

	let newSlug: string | undefined;
	if (allowedPayload.name && allowedPayload.name !== isExistCompany.name) {
		const trimmedName = allowedPayload.name.trim();
		const nameExists = await prisma.company.findFirst({
			where: {
				name: {
					equals: trimmedName,
					mode: "insensitive",
				},
				id: { not: companyId },
			},
		});
		if (nameExists) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"A company with this name already exists",
			);
		}
		newSlug = await generateUniqueCompanySlug(trimmedName);
		allowedPayload.name = trimmedName;
	}

	const updatedCompany = await prisma.company.update({
		where: { id: companyId },
		data: {
			...allowedPayload,
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
const getMyCompany = async (userId: string) => {
	const member = await prisma.companyMember.findFirst({
		where: {
			userId,
			role: {
				in: [
					CompanyMemberRole.COMPANY_OWNER,
					CompanyMemberRole.COMPANY_ADMIN,
					CompanyMemberRole.ASSESSMENT_CREATOR,
					CompanyMemberRole.EVALUATOR,
				],
			},
		},
		include: {
			company: {
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
			},
		},
	});

	if (!member) {
		const anyMembership = await prisma.companyMember.findFirst({
			where: { userId },
		});

		if (anyMembership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not authorized to access this company",
			);
		}

		throw new AppError(httpStatus.NOT_FOUND, "Company not found for this user");
	}

	return member.company;
};

const addCompanyMember = async (
	companyId: string,
	currentUser: { userId: string; role: UserRole },
	payload: IAddCompanyMemberPayload,
) => {
	const company = await prisma.company.findUnique({
		where: { id: companyId },
	});
	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	// Platform SUPER_ADMIN has full system override
	const isPlatformSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;

	let requesterRole: CompanyMemberRole | undefined;

	if (!isPlatformSuperAdmin) {
		const requesterMembership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: currentUser.userId,
					companyId,
				},
			},
		});

		if (!requesterMembership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a member of this company",
			);
		}

		const allowedRequesterRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		if (!allowedRequesterRoles.includes(requesterMembership.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to add members. Only company owner or admin can perform this action.",
			);
		}

		requesterRole = requesterMembership.role;
	}

	// An admin cannot assign someone as owner (only owner or platform super admin can)
	if (
		!isPlatformSuperAdmin &&
		requesterRole === CompanyMemberRole.COMPANY_ADMIN &&
		payload.role === CompanyMemberRole.COMPANY_OWNER
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only company owner can assign the COMPANY_OWNER role.",
		);
	}

	const targetEmail = payload.email.trim().toLowerCase();

	const targetUser = await prisma.user.findUnique({
		where: { email: targetEmail },
	});

	// Only existing registered users can be added; never auto-create
	if (!targetUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"User with this email does not exist. The user must register on the platform first.",
		);
	}

	if (!targetUser.isActive) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This user account is inactive or suspended.",
		);
	}

	// Rule: 1 user can only belong to 1 company at a time
	const existingMembership = await prisma.companyMember.findFirst({
		where: { userId: targetUser.id },
	});

	if (existingMembership) {
		throw new AppError(
			httpStatus.CONFLICT,
			"This user is already a member of a company. A user can only belong to one company at a time.",
		);
	}

	// Create member and increment target user's tokenVersion so their session is refreshed
	const [newMember] = await prisma.$transaction([
		prisma.companyMember.create({
			data: {
				companyId,
				userId: targetUser.id,
				role: payload.role,
			},
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
						profilePictureUrl: true,
					},
				},
				company: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
		}),
		prisma.user.update({
			where: { id: targetUser.id },
			data: { tokenVersion: { increment: 1 } },
		}),
	]);

	return newMember;
};

const updateMemberRole = async (
	companyId: string,
	currentUser: { userId: string; role: UserRole },
	memberUserId: string,
	newRole: CompanyMemberRole,
) => {
	const company = await prisma.company.findUnique({
		where: { id: companyId },
	});
	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	const isPlatformSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;
	let requesterRole: CompanyMemberRole | undefined;

	if (!isPlatformSuperAdmin) {
		const requesterMembership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: currentUser.userId,
					companyId,
				},
			},
		});

		if (!requesterMembership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a member of this company",
			);
		}

		const allowedRequesterRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		if (!allowedRequesterRoles.includes(requesterMembership.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to update member roles. Only company owner or admin can perform this action.",
			);
		}

		requesterRole = requesterMembership.role;
	}

	const targetMembership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: memberUserId,
				companyId,
			},
		},
	});

	if (!targetMembership) {
		throw new AppError(httpStatus.NOT_FOUND, "Company member not found");
	}

	if (
		!isPlatformSuperAdmin &&
		requesterRole === CompanyMemberRole.COMPANY_ADMIN &&
		(newRole === CompanyMemberRole.COMPANY_OWNER ||
			targetMembership.role === CompanyMemberRole.COMPANY_OWNER)
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only company owner can assign or modify the COMPANY_OWNER role.",
		);
	}

	if (
		targetMembership.role === CompanyMemberRole.COMPANY_OWNER &&
		newRole !== CompanyMemberRole.COMPANY_OWNER
	) {
		const ownerCount = await prisma.companyMember.count({
			where: {
				companyId,
				role: CompanyMemberRole.COMPANY_OWNER,
			},
		});
		if (ownerCount <= 1) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Cannot demote the only owner of the company. Assign another owner first.",
			);
		}
	}

	// Update role in CompanyMember and increment tokenVersion in User
	const [updatedMember] = await prisma.$transaction([
		prisma.companyMember.update({
			where: {
				userId_companyId: {
					userId: memberUserId,
					companyId,
				},
			},
			data: { role: newRole },
			include: {
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
						profilePictureUrl: true,
					},
				},
				company: {
					select: {
						id: true,
						name: true,
						slug: true,
					},
				},
			},
		}),
		prisma.user.update({
			where: { id: memberUserId },
			data: { tokenVersion: { increment: 1 } },
		}),
	]);

	return updatedMember;
};

const removeCompanyMember = async (
	companyId: string,
	currentUser: { userId: string; role: UserRole },
	memberUserId: string,
) => {
	const company = await prisma.company.findUnique({
		where: { id: companyId },
	});
	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	const isPlatformSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;
	let requesterRole: CompanyMemberRole | undefined;

	if (!isPlatformSuperAdmin) {
		const requesterMembership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: currentUser.userId,
					companyId,
				},
			},
		});

		if (!requesterMembership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a member of this company",
			);
		}

		const allowedRequesterRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		if (!allowedRequesterRoles.includes(requesterMembership.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to remove members. Only company owner or admin can perform this action.",
			);
		}

		requesterRole = requesterMembership.role;
	}

	const targetMembership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: memberUserId,
				companyId,
			},
		},
	});

	if (!targetMembership) {
		throw new AppError(httpStatus.NOT_FOUND, "Company member not found");
	}

	if (targetMembership.role === CompanyMemberRole.COMPANY_OWNER) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot remove the company owner.",
		);
	}

	if (
		!isPlatformSuperAdmin &&
		requesterRole === CompanyMemberRole.COMPANY_ADMIN &&
		targetMembership.role === CompanyMemberRole.COMPANY_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Company admins cannot remove another admin. Only owner can.",
		);
	}

	// Delete membership and increment target user's tokenVersion to immediately revoke company access
	await prisma.$transaction([
		prisma.companyMember.delete({
			where: {
				userId_companyId: {
					userId: memberUserId,
					companyId,
				},
			},
		}),
		prisma.user.update({
			where: { id: memberUserId },
			data: { tokenVersion: { increment: 1 } },
		}),
	]);

	return {
		message: "Member removed successfully from company",
	};
};

const getCompanyMembers = async (
	companyId: string,
	currentUser: { userId: string; role: UserRole },
) => {
	const company = await prisma.company.findUnique({
		where: { id: companyId },
	});
	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	const isPlatformSuperAdmin = currentUser.role === UserRole.SUPER_ADMIN;

	if (!isPlatformSuperAdmin) {
		const membership = await prisma.companyMember.findUnique({
			where: {
				userId_companyId: {
					userId: currentUser.userId,
					companyId,
				},
			},
		});

		if (!membership) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a member of this company",
			);
		}

		const allowedRoles: CompanyMemberRole[] = [
			CompanyMemberRole.COMPANY_OWNER,
			CompanyMemberRole.COMPANY_ADMIN,
		];

		if (!allowedRoles.includes(membership.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You don't have permission to view company members. Only company owner or admin can perform this action.",
			);
		}
	}

	const members = await prisma.companyMember.findMany({
		where: { companyId },
		include: {
			user: {
				select: {
					id: true,
					name: true,
					email: true,
					role: true,
					profilePictureUrl: true,
				},
			},
		},
		orderBy: { joinedAt: "asc" },
	});

	return members;
};

export const CompanyService = {
	createCompany,
	verifyCompany,
	updateCompany,
	getMyCompany,
	addCompanyMember,
	updateMemberRole,
	removeCompanyMember,
	getCompanyMembers,
};
