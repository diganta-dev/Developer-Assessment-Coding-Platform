import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ProblemService } from "./problem.service";

const createProblem = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const data = req.body;

	const result = await ProblemService.createProblem(user, data);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Problem created successfully",
		data: result,
	});
});

export const ProblemController = {
	createProblem,
};
