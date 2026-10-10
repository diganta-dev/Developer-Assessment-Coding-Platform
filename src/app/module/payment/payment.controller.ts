import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { PaymentService } from "./payment.service";

const handleBkashCallback = catchAsync(
	async (req: Request, res: Response) => {
		const paymentID =
			(req.query.paymentID as string) || (req.body?.paymentID as string);
		const status =
			(req.query.status as string) || (req.body?.status as string);
		const signature =
			(req.query.signature as string) || (req.body?.signature as string);

		const redirectUrl = await PaymentService.handleBkashCallback({
			paymentID,
			status,
			signature,
		});

		return res.redirect(redirectUrl);
	},
);

const getPaymentStatus = catchAsync(async (req: Request, res: Response) => {
	const paymentReference = req.params.paymentReference as string;
	const result = await PaymentService.getPaymentStatus(
		paymentReference,
		req.user!,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment status retrieved successfully",
		data: result,
	});
});

const retryCompanyPayment = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.retryCompanyPayment(
		req.user!,
		req.body,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: (result as any).message || "bKash checkout session created successfully",
		data: result,
	});
});

export const PaymentController = {
	handleBkashCallback,
	getPaymentStatus,
	retryCompanyPayment,
};
