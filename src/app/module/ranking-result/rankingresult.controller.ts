import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IRankingFilterQuery } from "./rankingresult.interface";
import { RankingResultService } from "./rankingresult.service";

/**
 * Generates/re-calculates and persists the final result for an assessment attempt.
 */
const generateAssessmentResult = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result = await RankingResultService.generateAssessmentResult(
			attemptId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment result generated successfully",
			data: result,
		});
	},
);

/**
 * Calculates candidate competitive rank and percentile within an assessment.
 */
const calculateCandidateRank = catchAsync(
	async (req: Request, res: Response) => {
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result =
			await RankingResultService.calculateCandidateRank(attemptId);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Candidate rank calculated successfully",
			data: result,
		});
	},
);

/**
 * Generates assessment leaderboard with paginated rankings, filtering, and summary stats.
 */
const generateAssessmentRanking = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const query: IRankingFilterQuery = {
			page: req.query.page as string | undefined,
			limit: req.query.limit as string | undefined,
			searchTerm: req.query.searchTerm as string | undefined,
			status: req.query.status as any,
			sortBy: req.query.sortBy as any,
			sortOrder: req.query.sortOrder as any,
		};

		const result = await RankingResultService.generateAssessmentRanking(
			assessmentId,
			user,
			query,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment ranking and leaderboard retrieved successfully",
			data: result,
		});
	},
);

/**
 * Publishes final assessment results for all participants.
 */
const publishAssessmentResult = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const result = await RankingResultService.publishAssessmentResult(
			assessmentId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment results published successfully",
			data: result,
		});
	},
);

/**
 * Retrieves the specific assessment attempt result for a candidate.
 */
const getCandidateResult = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);

	const result = await RankingResultService.getCandidateResult(attemptId, user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidate result retrieved successfully",
		data: result,
	});
});

/**
 * Retrieves all assessment results for the currently authenticated candidate.
 */
const getMyResults = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	const result = await RankingResultService.getMyResults(user);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidate results retrieved successfully",
		data: result,
	});
});

export const RankingResultController = {
	generateAssessmentResult,
	calculateCandidateRank,
	generateAssessmentRanking,
	publishAssessmentResult,
	getCandidateResult,
	getMyResults,
};
