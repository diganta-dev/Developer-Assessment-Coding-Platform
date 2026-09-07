import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AssessmentService } from "./assessment.service";

const createAssessment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const result = await AssessmentService.createAssessment(user, req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Assessment created successfully",
		data: result,
	});
});

const getMyAssessments = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const result = await AssessmentService.getMyAssessments(user, req.query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessments retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

const getSingleAssessment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.getSingleAssessment(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment retrieved successfully",
		data: result,
	});
});

const updateAssessment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.updateAssessment(user, id, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment updated successfully",
		data: result,
	});
});

const deleteAssessment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.deleteAssessment(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment deleted successfully",
		data: result,
	});
});

const publishAssessment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.publishAssessment(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment published successfully",
		data: result,
	});
});

const addProblemsToAssessment = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const id = req.params.id as string;

		const result = await AssessmentService.addProblemsToAssessment(
			user,
			id,
			req.body,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Problems added to assessment successfully",
			data: result,
		});
	},
);

const inviteCandidates = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.inviteCandidates(user, id, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidates invited successfully",
		data: result,
	});
});

const getAssessmentInvitations = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const id = req.params.id as string;

		const result = await AssessmentService.getAssessmentInvitations(user, id);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment invitations retrieved successfully",
			data: result,
		});
	},
);

const startAttempt = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.startAttempt(user, id, req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: result.isResume
			? "Assessment attempt resumed successfully"
			: "Assessment attempt started successfully",
		data: result,
	});
});

const getAttemptDetails = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId = req.params.attemptId as string;

	const result = await AssessmentService.getAttemptDetails(user, attemptId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment attempt retrieved successfully",
		data: result,
	});
});

const submitAssessmentAttempt = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId = req.params.attemptId as string;

		const result = await AssessmentService.submitAssessmentAttempt(
			user,
			attemptId,
			req.body,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment submitted and evaluated successfully",
			data: result,
		});
	},
);

const getAssessmentAttempts = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const id = req.params.id as string;

		const result = await AssessmentService.getAssessmentAttempts(
			user,
			id,
			req.query,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment attempts retrieved successfully",
			meta: result.meta,
			data: result.data,
		});
	},
);

const getMyAttempts = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	const result = await AssessmentService.getMyAttempts(user, req.query);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Candidate attempts retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

const publishAssessmentResults = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const id = req.params.id as string;

		const result = await AssessmentService.publishAssessmentResults(
			user,
			id,
			req.body,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Assessment results published successfully",
			data: result,
		});
	},
);

const getAttemptResult = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId = req.params.attemptId as string;

	const result = await AssessmentService.getAttemptResult(user, attemptId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment result retrieved successfully",
		data: result,
	});
});

const getAssessmentResults = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await AssessmentService.getAssessmentResults(
		user,
		id,
		req.query,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Assessment results retrieved successfully",
		meta: result.meta,
		data: {
			assessment: result.assessment,
			overview: result.overview,
			results: result.data,
		},
	});
});

const getDetailedResultReport = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId = req.params.attemptId as string;

		const result = await AssessmentService.getDetailedResultReport(
			user,
			attemptId,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Detailed assessment report retrieved successfully",
			data: result,
		});
	},
);

export const AssessmentController = {
	createAssessment,
	getMyAssessments,
	getSingleAssessment,
	updateAssessment,
	deleteAssessment,
	publishAssessment,
	addProblemsToAssessment,
	inviteCandidates,
	getAssessmentInvitations,
	startAttempt,
	getAttemptDetails,
	submitAssessmentAttempt,
	getAssessmentAttempts,
	getMyAttempts,
	publishAssessmentResults,
	getAttemptResult,
	getAssessmentResults,
	getDetailedResultReport,
};
