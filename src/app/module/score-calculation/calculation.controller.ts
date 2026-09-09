import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { CalculationService } from "./calculation.service";

/**
 * Calculates and resolves score breakdown for an individual submission.
 * Unified endpoint that delegates to problem-type specific scoring logic.
 */
const calculateSubmissionScore = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await CalculationService.calculateSubmissionScore(
			submissionId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Submission score calculated successfully",
			data: result,
		});
	},
);

/**
 * Calculates granular score breakdown for a Coding submission
 * (public vs hidden test case execution results, efficiency metrics, and marks).
 */
const calculateCodingScore = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const submissionId =
		(req.params.submissionId as string) || (req.params.id as string);

	const result = await CalculationService.calculateCodingScore(
		submissionId,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Coding score calculated successfully",
		data: result,
	});
});

/**
 * Calculates granular score breakdown for an MCQ submission
 * (selected option, correct option, explanation, and earned marks).
 */
const calculateMCQScore = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const submissionId =
		(req.params.submissionId as string) || (req.params.id as string);

	const result = await CalculationService.calculateMCQScore(submissionId, user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "MCQ score calculated successfully",
		data: result,
	});
});

/**
 * Calculates granular score breakdown for a Written submission
 * (word count limit checks, manual evaluation status, reviewer marks & feedback).
 */
const calculateWrittenScore = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const submissionId =
			(req.params.submissionId as string) || (req.params.id as string);

		const result = await CalculationService.calculateWrittenScore(
			submissionId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Written score calculated successfully",
			data: result,
		});
	},
);

/**
 * Calculates, aggregates, and persists the total score and results for an attempt.
 */
const calculateAttemptScore = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result = await CalculationService.calculateAttemptScore(
			attemptId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Attempt score calculated and aggregated successfully",
			data: result,
		});
	},
);

export const CalculationController = {
	calculateSubmissionScore,
	calculateCodingScore,
	calculateMCQScore,
	calculateWrittenScore,
	calculateAttemptScore,
};
