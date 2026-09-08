import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { ISubmissionFilterQuery } from "./submission.interface";
import { SubmissionService } from "./submission.service";

/**
 * Creates or upserts a submission for a problem within an assessment attempt.
 * - attemptId can come from URL param (:attemptId) or request body.
 */
const createSubmission = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	// Merge URL param attemptId with body — URL param takes precedence
	const payload = {
		...req.body,
		...(req.params.attemptId ? { attemptId: req.params.attemptId } : {}),
	};

	const result = await SubmissionService.createSubmission(user, payload);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Submission saved successfully",
		data: result,
	});
});

/**
 * Retrieves a submission by its ID.
 */
const getSubmissionById = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await SubmissionService.getSubmissionById(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Submission retrieved successfully",
		data: result,
	});
});

/**
 * Retrieves all submissions for a specific attempt.
 */
const getAttemptSubmissions = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId = req.params.attemptId as string;

		const result = await SubmissionService.getAttemptSubmissions(
			user,
			attemptId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Attempt submissions retrieved successfully",
			data: result,
		});
	},
);

/**
 * Retrieves a paginated list of submissions for the current logged-in candidate.
 * Supported query params:
 *   assessmentId, attemptId, problemId, status, isCorrect (true/false), searchTerm,
 *   page, limit, sortBy, sortOrder
 */
const getMySubmissions = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	// Parse and normalize query params into the expected types
	const rawQuery = req.query;
	const query: ISubmissionFilterQuery = {
		assessmentId: rawQuery.assessmentId as string | undefined,
		attemptId: rawQuery.attemptId as string | undefined,
		problemId: rawQuery.problemId as string | undefined,
		searchTerm: rawQuery.searchTerm as string | undefined,
		sortBy: rawQuery.sortBy as string | undefined,
		sortOrder: rawQuery.sortOrder as "asc" | "desc" | undefined,
		page: rawQuery.page as string | undefined,
		limit: rawQuery.limit as string | undefined,
		// Convert string "true"/"false" to boolean — req.query is always strings
		...(rawQuery.isCorrect !== undefined
			? { isCorrect: rawQuery.isCorrect === "true" }
			: {}),
		// Validate that status is a valid SubmissionStatus value
		...(rawQuery.status
			? { status: rawQuery.status as ISubmissionFilterQuery["status"] }
			: {}),
	};

	const result = await SubmissionService.getMySubmissions(user, query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "My submissions retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

/**
 * Finalizes/submits a submission for a problem.
 * - submissionId from URL param (:id) takes precedence over body.
 * - Falls back to attemptId + problemId if no submissionId is provided.
 */
const submitSubmission = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	const payload = {
		...req.body,
		// URL param :id is the submissionId — takes precedence over body
		...(req.params.id ? { submissionId: req.params.id } : {}),
		// URL param :attemptId also supported
		...(req.params.attemptId ? { attemptId: req.params.attemptId } : {}),
	};

	const result = await SubmissionService.submitSubmission(user, payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Submission finalized successfully",
		data: result,
	});
});

export const SubmissionController = {
	createSubmission,
	submitSubmission,
	getSubmissionById,
	getAttemptSubmissions,
	getMySubmissions,
};
