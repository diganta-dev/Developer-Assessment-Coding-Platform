import type { PaymentStatus, PaymentType } from "../../../generated/prisma/enums";

export interface IRetryCompanyPaymentPayload {
	companyId?: string;
	paymentReference?: string;
}

export interface IBkashCallbackQuery {
	paymentID?: string;
	status?: "success" | "failure" | "cancel" | string;
	signature?: string;
}

export interface IPaymentFilterQuery {
	status?: PaymentStatus;
	paymentType?: PaymentType;
	searchTerm?: string;
	page?: number;
	limit?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}
