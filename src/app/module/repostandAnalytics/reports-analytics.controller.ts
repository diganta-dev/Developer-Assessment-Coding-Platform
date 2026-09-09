import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ReportsAnalyticsService } from "./reports-analytics.service";

/**
 * Generates an authoritative analytical report for an assessment.
 */
const generateAssessmentReport = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.generateAssessmentReport(
			assessmentId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment report generated successfully",
			data: result,
		});
	},
);

/**
 * Generates an individualized performance & career diagnostic report for a candidate.
 */
const generateCandidateReport = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const candidateId =
			(req.params.candidateId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.generateCandidateReport(
			candidateId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Candidate report generated successfully",
			data: result,
		});
	},
);

/**
 * Generates an executive talent recruitment analytics report for an organization.
 */
const generateCompanyReport = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const companyId =
			(req.params.companyId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.generateCompanyReport(
			companyId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Company report generated successfully",
			data: result,
		});
	},
);

/**
 * Calculates the score frequency distribution, quartiles, and statistical variance for an assessment.
 */
const getScoreDistribution = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.getScoreDistribution(
			assessmentId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Score distribution calculated successfully",
			data: result,
		});
	},
);

/**
 * Computes granular pass/fail statistics, threshold comparisons, and near-miss candidate counts.
 */
const getPassFailStatistics = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.getPassFailStatistics(
			assessmentId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Pass/fail statistics retrieved successfully",
			data: result,
		});
	},
);

/**
 * Calculates operational KPIs for an assessment including attempt status distributions, timing, and problem difficulty.
 */
const getAssessmentStatistics = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const assessmentId =
			(req.params.assessmentId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.getAssessmentStatistics(
			assessmentId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment statistics retrieved successfully",
			data: result,
		});
	},
);

/**
 * Detailed diagnostic performance report for an individual candidate attempt.
 */
const getCandidatePerformance = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result = await ReportsAnalyticsService.getCandidatePerformance(
			attemptId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Candidate performance diagnostic retrieved successfully",
			data: result,
		});
	},
);

export const ReportsAnalyticsController = {
	generateAssessmentReport,
	generateCandidateReport,
	generateCompanyReport,
	getScoreDistribution,
	getPassFailStatistics,
	getAssessmentStatistics,
	getCandidatePerformance,
};
