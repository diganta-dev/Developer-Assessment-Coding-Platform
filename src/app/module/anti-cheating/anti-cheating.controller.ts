import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import type {
	ICopyPastePayload,
	IFlagAttemptPayload,
	IFullscreenExitPayload,
	IMultipleTabPayload,
	IRecordViolationPayload,
	ISuspiciousActivityPayload,
	ITabSwitchPayload,
} from "./anti-cheating.interface";
import { AntiCheatingService } from "./anti-cheating.service";

/**
 * 1. Record generic anti-cheat event/violation
 */
const recordViolation = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as IRecordViolationPayload;

	const result = await AntiCheatingService.recordViolation(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Anti-cheat violation recorded successfully",
		data: result,
	});
});

/**
 * 2. Detect candidate tab switch or visibility loss
 */
const detectTabSwitch = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as ITabSwitchPayload;

	const result = await AntiCheatingService.detectTabSwitch(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Tab switch event recorded successfully",
		data: result,
	});
});

/**
 * 3. Detect multiple concurrent browser tabs
 */
const detectMultipleTabs = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as IMultipleTabPayload;

	const result = await AntiCheatingService.detectMultipleTabs(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Multiple tabs anomaly recorded successfully",
		data: result,
	});
});

/**
 * 4. Detect clipboard copy/paste operation
 */
const detectCopyPaste = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as ICopyPastePayload;

	const result = await AntiCheatingService.detectCopyPaste(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Copy/Paste event recorded successfully",
		data: result,
	});
});

/**
 * 5. Detect fullscreen exit
 */
const detectFullscreenExit = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as IFullscreenExitPayload;

	const result = await AntiCheatingService.detectFullscreenExit(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Fullscreen exit event recorded successfully",
		data: result,
	});
});

/**
 * 6. Detect general suspicious anomaly
 */
const detectSuspiciousActivity = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);
		const payload = req.body as ISuspiciousActivityPayload;

		const result = await AntiCheatingService.detectSuspiciousActivity(
			attemptId,
			payload,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.CREATED,
			success: true,
			message: "Suspicious activity recorded successfully",
			data: result,
		});
	},
);

/**
 * 7. Calculate multi-factor cheating risk score & audit trail
 */
const calculateCheatingRisk = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user as RequestUser;
		const attemptId =
			(req.params.attemptId as string) || (req.params.id as string);

		const result = await AntiCheatingService.calculateCheatingRisk(
			attemptId,
			user,
		);

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Cheating risk calculated successfully",
			data: result,
		});
	},
);

/**
 * 8. Formally flag an attempt with optional disqualification
 */
const flagAttempt = catchAsync(async (req: Request, res: Response) => {
	const user = req.user as RequestUser;
	const attemptId =
		(req.params.attemptId as string) || (req.params.id as string);
	const payload = req.body as IFlagAttemptPayload;

	const result = await AntiCheatingService.flagAttempt(
		attemptId,
		payload,
		user,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Attempt flagged successfully",
		data: result,
	});
});

export const AntiCheatingController = {
	recordViolation,
	detectTabSwitch,
	detectMultipleTabs,
	detectCopyPaste,
	detectFullscreenExit,
	detectSuspiciousActivity,
	calculateCheatingRisk,
	flagAttempt,
};
