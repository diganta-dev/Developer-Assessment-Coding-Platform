import crypto from "crypto";
import httpStatus from "http-status";
import {
	CompanyMemberRole,
	PaymentStatus,
	PaymentType,
	UserRole,
} from "../../../generated/prisma/enums";
import config from "../../config";
import {
	createBkashPayment,
	executeBkashPayment,
	queryBkashPayment,
} from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	IBkashCallbackQuery,
	IRetryCompanyPaymentPayload,
} from "./payment.interface";

const getFrontendBaseUrl = (): string => {
	const raw = config.frontend_url || "http://localhost:3000";
	return raw.endsWith("/") ? raw.slice(0, -1) : raw;
};

/**
 * Handles callback from bKash gateway.
 * Returns the destination frontend redirect URL with encoded parameters.
 */
const handleBkashCallback = async (
	query: IBkashCallbackQuery,
): Promise<string> => {
	const frontendUrl = getFrontendBaseUrl();
	const paymentID = query.paymentID?.trim();
	const status = query.status?.toLowerCase().trim();

	if (!paymentID || !status) {
		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "error");
		redirect.searchParams.set("message", "Invalid callback parameters from gateway");
		return redirect.toString();
	}

	const payment = await prisma.payment.findUnique({
		where: { bkashPaymentId: paymentID },
		include: { company: true },
	});

	if (!payment) {
		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "error");
		redirect.searchParams.set("message", "Payment record not found");
		return redirect.toString();
	}

	// Idempotency: If already completed, redirect to success
	if (payment.status === PaymentStatus.COMPLETED) {
		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "success");
		redirect.searchParams.set("paymentReference", payment.paymentReference);
		return redirect.toString();
	}

	if (status === "cancel") {
		await prisma.payment.update({
			where: { id: payment.id },
			data: {
				status: PaymentStatus.CANCELLED,
				failureReason: "Payment cancelled by user on bKash portal",
			},
		});

		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "cancelled");
		redirect.searchParams.set("paymentReference", payment.paymentReference);
		return redirect.toString();
	}

	if (status === "failure") {
		await prisma.payment.update({
			where: { id: payment.id },
			data: {
				status: PaymentStatus.FAILED,
				failureReason: "Payment failed on bKash gateway",
			},
		});

		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "failed");
		redirect.searchParams.set("paymentReference", payment.paymentReference);
		return redirect.toString();
	}

	if (status === "success") {
		let executeRes;
		try {
			executeRes = await executeBkashPayment(paymentID);
		} catch (execErr: unknown) {
			const errMessage =
				execErr instanceof Error ? execErr.message : "Payment execution failed";

			// Attempt reconciliation via status query before failing
			try {
				const queryRes = await queryBkashPayment(paymentID);
				if (
					(queryRes.transactionStatus === "Completed" ||
						queryRes.statusCode === "0000") &&
					queryRes.trxID
				) {
					executeRes = {
						...queryRes,
						trxID: queryRes.trxID,
					};
				} else {
					throw new Error(errMessage);
				}
			} catch {
				await prisma.payment.update({
					where: { id: payment.id },
					data: { failureReason: errMessage },
				});

				const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
				redirect.searchParams.set("status", "failed");
				redirect.searchParams.set("paymentReference", payment.paymentReference);
				redirect.searchParams.set("message", errMessage);
				return redirect.toString();
			}
		}

		// Security validations
		if (executeRes.paymentID !== payment.bkashPaymentId) {
			await prisma.payment.update({
				where: { id: payment.id },
				data: { failureReason: "Payment ID mismatch on verification" },
			});
			const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
			redirect.searchParams.set("status", "failed");
			redirect.searchParams.set("paymentReference", payment.paymentReference);
			redirect.searchParams.set("message", "Security verification failed: ID mismatch");
			return redirect.toString();
		}

		const returnedAmount = Number(executeRes.amount);
		if (Math.abs(returnedAmount - payment.amount) > 0.01) {
			await prisma.payment.update({
				where: { id: payment.id },
				data: { failureReason: "Payment amount mismatch on verification" },
			});
			const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
			redirect.searchParams.set("status", "failed");
			redirect.searchParams.set("paymentReference", payment.paymentReference);
			redirect.searchParams.set("message", "Security verification failed: Amount mismatch");
			return redirect.toString();
		}

		if (executeRes.currency && executeRes.currency !== payment.currency) {
			await prisma.payment.update({
				where: { id: payment.id },
				data: { failureReason: "Payment currency mismatch on verification" },
			});
			const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
			redirect.searchParams.set("status", "failed");
			redirect.searchParams.set("paymentReference", payment.paymentReference);
			redirect.searchParams.set("message", "Security verification failed: Currency mismatch");
			return redirect.toString();
		}

		// Short atomic database update
		await prisma.$transaction(async (tx) => {
			await tx.payment.update({
				where: { id: payment.id },
				data: {
					status: PaymentStatus.COMPLETED,
					bkashTransactionId: executeRes.trxID,
					customerMsisdn: executeRes.customerMsisdn || undefined,
					paymentExecuteTime: executeRes.paymentExecuteTime
						? new Date(executeRes.paymentExecuteTime)
						: new Date(),
					metadata: executeRes as any,
				},
			});

			if (payment.companyId) {
				await tx.company.update({
					where: { id: payment.companyId },
					data: {
						isPaymentVerified: true,
						isVerified: true,
					},
				});
			}
		});

		const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
		redirect.searchParams.set("status", "success");
		redirect.searchParams.set("paymentReference", payment.paymentReference);
		return redirect.toString();
	}

	const redirect = new URL(`${frontendUrl}/company-registration/verify-company`);
	redirect.searchParams.set("status", "unknown");
	redirect.searchParams.set("paymentReference", payment.paymentReference);
	return redirect.toString();
};

/**
 * Returns safe payment and company registration status for authorized users.
 */
const getPaymentStatus = async (
	paymentReference: string,
	currentUser: RequestUser,
) => {
	const payment = await prisma.payment.findUnique({
		where: { paymentReference },
		include: {
			company: {
				select: {
					id: true,
					name: true,
					slug: true,
					email: true,
					isVerified: true,
					isPaymentVerified: true,
				},
			},
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment record not found");
	}

	const isPlatformAdmin =
		currentUser.role === UserRole.SUPER_ADMIN ||
		currentUser.role === UserRole.ADMIN;
	const isPayer = payment.userId === currentUser.userId;
	const isCompanyMember = payment.companyId === currentUser.companyId;

	if (!isPlatformAdmin && !isPayer && !isCompanyMember) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to view this payment status",
		);
	}

	return {
		id: payment.id,
		paymentReference: payment.paymentReference,
		amount: payment.amount,
		currency: payment.currency,
		paymentType: payment.paymentType,
		status: payment.status,
		bkashTransactionId: payment.bkashTransactionId,
		createdAt: payment.createdAt,
		updatedAt: payment.updatedAt,
		company: payment.company,
	};
};

/**
 * Retries or resumes an incomplete company registration payment.
 */
const retryCompanyPayment = async (
	currentUser: RequestUser,
	payload: IRetryCompanyPaymentPayload,
) => {
	let companyId = payload.companyId || currentUser.companyId;

	if (!companyId) {
		const membership = await prisma.companyMember.findFirst({
			where: {
				userId: currentUser.userId,
				role: CompanyMemberRole.COMPANY_OWNER,
			},
		});
		if (membership) {
			companyId = membership.companyId;
		}
	}

	if (!companyId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"No company found associated with your account to retry payment for.",
		);
	}

	const company = await prisma.company.findUnique({
		where: { id: companyId },
		include: {
			members: true,
		},
	});

	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found");
	}

	const isPlatformAdmin =
		currentUser.role === UserRole.SUPER_ADMIN ||
		currentUser.role === UserRole.ADMIN;
	const isOwner = company.members.some(
		(m) =>
			m.userId === currentUser.userId &&
			(m.role === CompanyMemberRole.COMPANY_OWNER ||
				m.role === CompanyMemberRole.COMPANY_ADMIN),
	);

	if (!isPlatformAdmin && !isOwner) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only the company owner or admin can initiate payment retry",
		);
	}

	if (company.isPaymentVerified) {
		return {
			alreadyVerified: true,
			message: "Company registration is already paid and verified",
			company,
		};
	}

	// Trusted registration fee from backend config
	const fee = config.bkash_company_registration_fee_bdt || 1000;

	// Check if an existing pending payment can be reconciled before initiating another charge
	const existingPending = await prisma.payment.findFirst({
		where: {
			companyId: company.id,
			status: PaymentStatus.PENDING,
		},
		orderBy: { createdAt: "desc" },
	});

	if (existingPending?.bkashPaymentId) {
		try {
			const queryRes = await queryBkashPayment(existingPending.bkashPaymentId);
			if (
				(queryRes.transactionStatus === "Completed" ||
					queryRes.statusCode === "0000") &&
				queryRes.trxID
			) {
				// Reconcile already-completed gateway payment
				await prisma.$transaction([
					prisma.payment.update({
						where: { id: existingPending.id },
						data: {
							status: PaymentStatus.COMPLETED,
							bkashTransactionId: queryRes.trxID,
							customerMsisdn: queryRes.customerMsisdn || undefined,
							metadata: queryRes as any,
						},
					}),
					prisma.company.update({
						where: { id: company.id },
						data: {
							isPaymentVerified: true,
							isVerified: true,
						},
					}),
				]);

				return {
					alreadyVerified: true,
					reconciled: true,
					message: "Previous payment was completed and is now verified",
					company,
				};
			}
		} catch {
			// Query failed or unconfirmed, generate fresh checkout
		}
	}

	// Generate new unique references
	const paymentReference = `PAY-COMP-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
	const merchantInvoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;

	// Initiate bKash checkout outside of any DB transaction
	const bkashRes = await createBkashPayment({
		amount: fee,
		merchantInvoiceNumber,
		payerReference: currentUser.email,
	});

	// Persist local payment record
	const payment = await prisma.payment.create({
		data: {
			paymentReference,
			companyId: company.id,
			userId: currentUser.userId,
			email: currentUser.email,
			amount: fee,
			currency: "BDT",
			paymentType: PaymentType.COMPANY_REGISTRATION,
			status: PaymentStatus.PENDING,
			merchantInvoiceNumber,
			bkashPaymentId: bkashRes.paymentID,
			metadata: bkashRes as any,
		},
	});

	return {
		paymentReference: payment.paymentReference,
		bkashURL: bkashRes.bkashURL,
		paymentId: bkashRes.paymentID,
		amount: payment.amount,
		currency: payment.currency,
		companyId: company.id,
		status: payment.status,
	};
};

export const PaymentService = {
	handleBkashCallback,
	getPaymentStatus,
	retryCompanyPayment,
};
