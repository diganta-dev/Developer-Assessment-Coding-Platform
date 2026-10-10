import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const getProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.getProfile(req.user!.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const updateProfile = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.updateProfile(req.user!.userId, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile updated successfully",
		data: result,
	});
});

const updateProfilePicture = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.updateProfilePicture(
		req.user!.userId,
		req.file,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile picture updated successfully",
		data: result,
	});
});

const removeProfilePicture = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.removeProfilePicture(req.user!.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile picture removed successfully",
		data: result,
	});
});

const updateResume = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.updateResume(req.user!.userId, req.file);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Resume uploaded successfully",
		data: result,
	});
});

const removeResume = catchAsync(async (req: Request, res: Response) => {
	const result = await UserService.removeResume(req.user!.userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Resume removed successfully",
		data: result,
	});
});

export const UserController = {
	getProfile,
	updateProfile,
	updateProfilePicture,
	removeProfilePicture,
	updateResume,
	removeResume,
};
