import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { Difficulty, ProblemType } from "../../../generated/prisma/enums";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type { IPaginationOptions, IProblemFilterRequest } from "./problem.interface";
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

const getAllProblems = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	const filters: IProblemFilterRequest = {
		searchTerm: req.query.searchTerm ? String(req.query.searchTerm) : undefined,
		type: req.query.type as ProblemType | undefined,
		difficulty: req.query.difficulty as Difficulty | undefined,
		companyId: req.query.companyId ? String(req.query.companyId) : undefined,
		createdById: req.query.createdById ? String(req.query.createdById) : undefined,
	};

	const options: IPaginationOptions = {
		page: req.query.page ? Number(req.query.page) : undefined,
		limit: req.query.limit ? Number(req.query.limit) : undefined,
		sortBy: req.query.sortBy ? String(req.query.sortBy) : undefined,
		sortOrder: req.query.sortOrder === "asc" ? "asc" : "desc",
	};

	const result = await ProblemService.getAllProblems(user, filters, options);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problems retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

const getCompanyProblems = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;

	const filters: IProblemFilterRequest = {
		searchTerm: req.query.searchTerm ? String(req.query.searchTerm) : undefined,
		type: req.query.type as ProblemType | undefined,
		difficulty: req.query.difficulty as Difficulty | undefined,
		createdById: req.query.createdById ? String(req.query.createdById) : undefined,
	};

	const options: IPaginationOptions = {
		page: req.query.page ? Number(req.query.page) : undefined,
		limit: req.query.limit ? Number(req.query.limit) : undefined,
		sortBy: req.query.sortBy ? String(req.query.sortBy) : undefined,
		sortOrder: req.query.sortOrder === "asc" ? "asc" : "desc",
	};

	const result = await ProblemService.getCompanyProblems(user, filters, options);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Company problems retrieved successfully",
		meta: result.meta,
		data: result.data,
	});
});

const getSingleProblem = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await ProblemService.getSingleProblem(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem retrieved successfully",
		data: result,
	});
});

const updateProblem = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;
	const data = req.body;

	const result = await ProblemService.updateProblem(user, id, data);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem updated successfully",
		data: result,
	});
});

const deleteProblem = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const id = req.params.id as string;

	const result = await ProblemService.deleteProblem(user, id);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Problem deleted successfully",
		data: result,
	});
});

export const ProblemController = {
	createProblem,
	getAllProblems,
	getCompanyProblems,
	getMyCompanyProblems: getCompanyProblems,
	getSingleProblem,
	updateProblem,
	deleteProblem,
};
