import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { CompanyService } from "./company.service";
import httpStatus from "http-status";
import { jwtUtils } from "../../utils/jwt";
import config from "../../config";
import type { Request } from "express";

const isProduction = config.node_env === "production";

const getCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: isProduction,
	sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
	maxAge,
});

// Helper to extract authenticated user's ID if token or session is provided
const extractUserId = (req: Request): string | undefined => {
	if (req.user?.userId) return req.user.userId;
	const token =
		req.cookies?.accessToken ||
		(req.headers.authorization?.startsWith("Bearer ")
			? req.headers.authorization.split(" ")[1]
			: req.headers.authorization);
	if (token) {
		const verified = jwtUtils.verifyToken(token, config.jwt_access_secret);
		if (verified.success && verified.data) {
			return (verified.data as { userId: string }).userId;
		}
	}
	return undefined;
};

const createCompany = catchAsync(async (req, res) => {
	const userId = extractUserId(req);
	const result = await CompanyService.createCompany(req.body, userId);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Company verification OTP sent successfully",
		data: result,
	});
});

const verifyCompany = catchAsync(async (req, res) => {
	const userId = extractUserId(req);
	const result = await CompanyService.verifyCompany(req.body, userId);
	const { accessToken, refreshToken } = result;

	if (accessToken) {
		res.cookie("accessToken", accessToken, getCookieOptions(1000 * 60 * 60 * 24));
	}
	if (refreshToken) {
		res.cookie("refreshToken", refreshToken, getCookieOptions(1000 * 60 * 60 * 24 * 7));
	}

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Company verified and registered successfully",
		data: result,
	});
});

const updateCompany = catchAsync(async (req, res) => {
	const id = req.params.id as string;
	const user = req.user!;
	const result = await CompanyService.updateCompany(id, user, req.body);
	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Company updated successfully",
		data: result,
	});
});

export const CompanyController = {
	createCompany,
	verifyCompany,
	updateCompany,
};
