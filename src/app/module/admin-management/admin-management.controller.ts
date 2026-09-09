import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	IAssessmentFilterQuery,
	ICompanyFilterQuery,
	ISubmissionFilterQuery,
	IUpdateUserStatusPayload,
	IUserFilterQuery,
} from "./admin-management.interface";
import { AdminManagementService } from "./admin-management.service";

/**
 * 1. Get platform-wide dashboard statistics
 */
const getDashboardStatistics = catchAsync(async (_req: Request, res: Response) => {
	const result = await AdminManagementService.getDashboardStatistics();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Dashboard statistics retrieved successfully",
		data: result,
	});
});

/**
 * 2. Get paginated users directory with search & filters
 */
const getUsers = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as IUserFilterQuery;
	const result = await AdminManagementService.getUsers(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Users retrieved successfully",
		meta: result.meta,
		data: result.users,
	});
});

/**
 * 3. Get detailed profile dossier for a user
 */
const getUserDetails = catchAsync(async (req: Request, res: Response) => {
	const userId = (req.params.userId as string) || (req.params.id as string);
	const result = await AdminManagementService.getUserDetails(userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User details retrieved successfully",
		data: result,
	});
});

/**
 * 4. Update user status (isActive, role, isVerified) and evict active sessions on suspension
 */
const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
	const adminUser = req.user as RequestUser;
	const userId = (req.params.userId as string) || (req.params.id as string);
	const payload = req.body as IUpdateUserStatusPayload;

	const result = await AdminManagementService.updateUserStatus(
		userId,
		payload,
		adminUser,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User status updated successfully",
		data: result,
	});
});

/**
 * 5. Delete a user account safely
 */
const deleteUser = catchAsync(async (req: Request, res: Response) => {
	const adminUser = req.user as RequestUser;
	const userId = (req.params.userId as string) || (req.params.id as string);

	const result = await AdminManagementService.deleteUser(userId, adminUser);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: result.message,
		data: null,
	});
});

/**
 * 6. Get paginated companies directory
 */
const getCompanies = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as ICompanyFilterQuery;
	const result = await AdminManagementService.getCompanies(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Companies retrieved successfully",
		meta: result.meta,
		data: result.companies,
	});
});

/**
 * 7. Get paginated assessments directory
 */
const getAssessments = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as IAssessmentFilterQuery;
	const result = await AdminManagementService.getAssessments(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessments retrieved successfully",
		meta: result.meta,
		data: result.assessments,
	});
});

/**
 * 8. Get paginated platform submissions audit log
 */
const getSubmissions = catchAsync(async (req: Request, res: Response) => {
	const query = req.query as ISubmissionFilterQuery;
	const result = await AdminManagementService.getSubmissions(query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Submissions retrieved successfully",
		meta: result.meta,
		data: result.submissions,
	});
});

/**
 * 9. Get system health, server memory, uptime, and database telemetry
 */
const getSystemStatistics = catchAsync(async (_req: Request, res: Response) => {
	const result = await AdminManagementService.getSystemStatistics();

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "System statistics retrieved successfully",
		data: result,
	});
});

export const AdminManagementController = {
	getDashboardStatistics,
	getUsers,
	getUserDetails,
	updateUserStatus,
	deleteUser,
	getCompanies,
	getAssessments,
	getSubmissions,
	getSystemStatistics,
};
