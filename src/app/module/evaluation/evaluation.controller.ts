import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IEvaluationFilterQuery } from "./evaluation.interface";
import { EvaluationService } from "./evaluation.service";

/**
 * Triggers automated Judge0 evaluation for a coding submission.
 */
const evaluateCodingSubmission = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await EvaluationService.evaluateCodingSubmission(
			user,
			submissionId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Coding submission evaluated successfully via Judge0",
			data: result,
		});
	},
);

/**
 * Automatically evaluates an MCQ submission.
 */
const evaluateMCQSubmission = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await EvaluationService.evaluateMCQSubmission(
			user,
			submissionId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "MCQ submission evaluated successfully",
			data: result,
		});
	},
);

/**
 * Evaluates a written question submission with marks, feedback, and word count analytics.
 */
const evaluateWrittenSubmission = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await EvaluationService.evaluateWrittenSubmission(
			user,
			submissionId,
			req.body,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Written submission evaluated successfully",
			data: result,
		});
	},
);

/**
 * Evaluates a written submission or manually updates marks/feedback for a submission.
 */
const manualEvaluateSubmission = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await EvaluationService.manualEvaluateSubmission(
			user,
			submissionId,
			req.body,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Manual evaluation submitted successfully",
			data: result,
		});
	},
);

/**
 * Retrieves a list of evaluations with optional filters and pagination.
 */
const getAllEvaluations = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const query = req.query as unknown as IEvaluationFilterQuery;

	const result = await EvaluationService.getAllEvaluations(user, query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Evaluations retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

/**
 * Retrieves a single evaluation by ID.
 */
const getEvaluationById = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await EvaluationService.getEvaluationById(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Evaluation details retrieved successfully",
		data: result,
	});
});

/**
 * Calculates, aggregates, and retrieves the overall score for an assessment attempt.
 */
const calculateAttemptScore = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result = await EvaluationService.calculateAttemptScore(
			user,
			attemptId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment attempt score calculated successfully",
			data: result,
		});
	},
);

export const EvaluationController = {
	evaluateCodingSubmission,
	evaluateMCQSubmission,
	evaluateWrittenSubmission,
	manualEvaluateSubmission,
	calculateAttemptScore,
	getAllEvaluations,
	getEvaluationById,
};
