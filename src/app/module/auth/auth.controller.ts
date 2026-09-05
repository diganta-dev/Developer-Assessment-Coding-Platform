import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import AppError from "../../errors/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IRequestUser } from "./auth.interface";
import { AuthService } from "./auth.service";

const isProduction = config.node_env === "production";

const getCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: isProduction,
	sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
	maxAge,
});

const registerUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await AuthService.registerUser(payload);

	const { accessToken, refreshToken, user, candidateProfile } = result;

	res.cookie("accessToken", accessToken, getCookieOptions(1000 * 60 * 60 * 24)); // 1 day
	res.cookie("refreshToken", refreshToken, getCookieOptions(1000 * 60 * 60 * 24 * 7)); // 7 days

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "User registered successfully",
		data: {
			accessToken,
			refreshToken,
			user,
			candidateProfile,
		},
	});
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const result = await AuthService.loginUser(payload);
	const { accessToken, refreshToken, user } = result;

	res.cookie("accessToken", accessToken, getCookieOptions(1000 * 60 * 60 * 24)); // 1 day
	res.cookie("refreshToken", refreshToken, getCookieOptions(1000 * 60 * 60 * 24 * 7)); // 7 days

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: {
			accessToken,
			refreshToken,
			user,
		},
	});
});

const logoutUser = catchAsync(async (_req: Request, res: Response) => {
	const clearOptions = {
		httpOnly: true,
		secure: isProduction,
		sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
	};

	res.clearCookie("accessToken", clearOptions);
	res.clearCookie("refreshToken", clearOptions);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged out successfully",
		data: null,
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as unknown as IRequestUser;

	if (!user) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User information is missing in the request",
		);
	}

	const result = await AuthService.getMe(user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	const token =
		req.cookies?.refreshToken ||
		req.body?.refreshToken ||
		(req.headers.authorization?.startsWith("Bearer ")
			? req.headers.authorization.split(" ")[1]
			: req.headers.authorization);

	if (!token) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is missing");
	}

	const result = await AuthService.refreshToken(token);
	const { accessToken, refreshToken: newRefreshToken, user } = result;

	res.cookie("accessToken", accessToken, getCookieOptions(1000 * 60 * 60 * 24));
	res.cookie("refreshToken", newRefreshToken, getCookieOptions(1000 * 60 * 60 * 24 * 7));

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: {
			accessToken,
			refreshToken: newRefreshToken,
			user,
		},
	});
});

export const AuthController = {
	registerUser,
	loginUser,
	logoutUser,
	getMe,
	refreshToken,
};
