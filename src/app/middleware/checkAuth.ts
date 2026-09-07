import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { JwtPayload } from "jsonwebtoken";
import type { CompanyMemberRole, UserRole } from "../../generated/prisma/enums";
import config from "../config";
import AppError from "../utils/AppError";
import { prisma } from "../lib/prisma";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

declare global {
	export interface RequestUser {
		email: string;
		name: string;
		userId: string;
		role: UserRole;
		tokenVersion?: number;
		companyId?: string;
		companyRole?: CompanyMemberRole;
	}

	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

export type { RequestUser };


export const auth = (...requiredRoles: UserRole[]) => {
	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		const token = req.cookies?.accessToken
			? req.cookies.accessToken
			: req.headers.authorization?.startsWith("Bearer ")
				? req.headers.authorization.split(" ")[1]
				: req.headers.authorization;

		if (!token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

		if (!verifiedToken.success) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				verifiedToken.error || "Invalid or expired access token",
			);
		}

		const decoded = verifiedToken.data as JwtPayload & {
			userId: string;
			email: string;
			name: string;
			role: UserRole;
			tokenVersion?: number;
			companyId?: string;
			companyRole?: CompanyMemberRole;
		};

		const user = await prisma.user.findUnique({
			where: {
				id: decoded.userId,
			},
			include: {
				companyMembers: {
					include: {
						company: true,
					},
				},
			},
		});

		if (!user) {
			throw new AppError(
				httpStatus.NOT_FOUND,
				"User not found. Please log in again.",
			);
		}

		if (!user.isActive) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Your account is deactivated. Please contact support.",
			);
		}

		// Token Version check: If the token version is outdated, invalidate the request
		if (
			typeof decoded.tokenVersion === "number" &&
			decoded.tokenVersion !== user.tokenVersion
		) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"Your session or role has changed. Please refresh your token.",
			);
		}

		if (requiredRoles.length && !requiredRoles.includes(user.role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		const primaryMembership = user.companyMembers?.[0];

		req.user = {
			email: user.email,
			name: user.name,
			userId: user.id,
			role: user.role,
			tokenVersion: user.tokenVersion,
			companyId: primaryMembership?.companyId,
			companyRole: primaryMembership?.role,
		};

		next();
	});
};
