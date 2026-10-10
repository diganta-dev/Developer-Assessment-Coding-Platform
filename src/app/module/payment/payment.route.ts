import { Router } from "express";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { PaymentController } from "./payment.controller";
import { PaymentValidation } from "./payment.validation";

const router = Router();

// bKash gateway callback endpoints (both GET redirect and POST webhook supported)
router.get(
	"/bkash/callback",
	PaymentController.handleBkashCallback,
);

router.post(
	"/bkash/callback",
	validateRequest(PaymentValidation.BkashCallbackZodSchema),
	PaymentController.handleBkashCallback,
);

// Retrieve payment status (authorized user/owner/admin)
router.get(
	"/status/:paymentReference",
	auth(),
	PaymentController.getPaymentStatus,
);

// Retry / resume pending company payment
router.post(
	"/retry-company-payment",
	auth(),
	validateRequest(PaymentValidation.RetryCompanyPaymentZodSchema),
	PaymentController.retryCompanyPayment,
);

export const PaymentRoutes = router;
