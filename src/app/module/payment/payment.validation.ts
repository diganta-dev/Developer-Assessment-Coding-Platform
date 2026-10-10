import { z } from "zod";

const RetryCompanyPaymentZodSchema = z.object({
	companyId: z.string().optional(),
	paymentReference: z.string().optional(),
});

const BkashCallbackZodSchema = z.object({
	paymentID: z.string().optional(),
	status: z.string().optional(),
	signature: z.string().optional(),
}).optional();

export const PaymentValidation = {
	RetryCompanyPaymentZodSchema,
	BkashCallbackZodSchema,
};
