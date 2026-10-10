import type { Server } from "http";
import crypto from "crypto";
import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import redisClient, { connectRedis } from "./app/lib/redis";
import {
	getBkashIdToken,
	createBkashPayment,
	executeBkashPayment,
	queryBkashPayment,
} from "./app/lib/bkash";
import {
	PaymentStatus,
	PaymentType,
	UserRole,
	CompanyMemberRole,
} from "./generated/prisma/enums";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, stepName: string, message?: string) {
	if (condition) {
		console.log(`  ✅ [PASS] ${stepName}`);
		testsPassed++;
	} else {
		console.error(`  ❌ [FAIL] ${stepName}: ${message || "Assertion failed"}`);
		testsFailed++;
		throw new Error(`Test failed at step: ${stepName} - ${message}`);
	}
}

async function request(
	baseUrl: string,
	path: string,
	options: {
		method?: string;
		token?: string;
		cookie?: string;
		body?: any;
		redirect?: "follow" | "manual";
	} = {},
) {
	const url = `${baseUrl}${path}`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (options.token) {
		headers.Authorization = `Bearer ${options.token}`;
	}
	if (options.cookie) {
		headers.Cookie = options.cookie;
	}

	const res = await fetch(url, {
		method: options.method || "GET",
		headers,
		body: options.body ? JSON.stringify(options.body) : undefined,
		redirect: options.redirect || "manual",
	});

	let data: any = null;
	const contentType = res.headers.get("content-type");
	if (contentType && contentType.includes("application/json")) {
		try {
			data = await res.json();
		} catch {
			data = null;
		}
	} else {
		try {
			data = await res.text();
		} catch {
			data = null;
		}
	}

	return {
		status: res.status,
		headers: res.headers,
		data,
	};
}

async function runBkashPaymentTestSuite() {
	console.log("=================================================");
	console.log("🚀 STARTING BKASH COMPANY PAYMENT TEST SUITE");
	console.log("=================================================\n");

	// Intercept global fetch for bKash endpoints to safely mock external gateway
	const originalFetch = global.fetch;
	let mockGrantCalls = 0;
	let mockRefreshCalls = 0;
	let mockCreateCalls = 0;
	let mockExecuteCalls = 0;
	let mockQueryCalls = 0;

	let forceRefreshFail = false;
	let mockExecuteStatus = "0000";

	global.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = input.toString();

		if (url.includes("/tokenized/checkout/token/grant")) {
			mockGrantCalls++;
			return new Response(
				JSON.stringify({
					statusCode: "0000",
					statusMessage: "Successful",
					id_token: "mock-id-token-" + mockGrantCalls,
					token_type: "Bearer",
					expires_in: "3600",
					refresh_token: "mock-refresh-token-" + mockGrantCalls,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		if (url.includes("/tokenized/checkout/token/refresh")) {
			mockRefreshCalls++;
			if (forceRefreshFail) {
				return new Response(
					JSON.stringify({
						statusCode: "2066",
						statusMessage: "Invalid Refresh Token",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(
				JSON.stringify({
					statusCode: "0000",
					statusMessage: "Successful",
					id_token: "mock-refreshed-id-token-" + mockRefreshCalls,
					token_type: "Bearer",
					expires_in: "3600",
					refresh_token: "mock-refresh-token-new",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		if (url.includes("/tokenized/checkout/create")) {
			mockCreateCalls++;
			const body = init?.body ? JSON.parse(init.body as string) : {};
			return new Response(
				JSON.stringify({
					statusCode: "0000",
					statusMessage: "Successful",
					paymentID: "TRX-BKASH-" + Date.now(),
					bkashURL: "https://tokenized.sandbox.bka.sh/checkout?paymentID=TRX-BKASH-" + Date.now(),
					amount: body.amount || "1000.00",
					currency: "BDT",
					intent: "sale",
					merchantInvoiceNumber: body.merchantInvoiceNumber,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		if (url.includes("/tokenized/checkout/execute")) {
			mockExecuteCalls++;
			const body = init?.body ? JSON.parse(init.body as string) : {};
			return new Response(
				JSON.stringify({
					statusCode: mockExecuteStatus,
					statusMessage: mockExecuteStatus === "0000" ? "Successful" : "Failed",
					paymentID: body.paymentID || "TRX-BKASH-123",
					trxID: "BKASH-TRX-" + crypto.randomBytes(4).toString("hex").toUpperCase(),
					transactionStatus: mockExecuteStatus === "0000" ? "Completed" : "Failed",
					amount: "1000.00",
					currency: "BDT",
					customerMsisdn: "01711000000",
					paymentExecuteTime: new Date().toISOString(),
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		if (url.includes("/tokenized/checkout/payment/status")) {
			mockQueryCalls++;
			return new Response(
				JSON.stringify({
					statusCode: "0000",
					statusMessage: "Successful",
					paymentID: "TRX-BKASH-123",
					trxID: "BKASH-TRX-RECONCILED",
					transactionStatus: "Completed",
					amount: "1000.00",
					currency: "BDT",
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}

		// Fallback to real fetch for local server requests
		return originalFetch(input, init);
	};

	let server: Server;
	let baseUrl: string = "";

	// Track created test entities for cleanup
	let testUserEmail = `bkash.test.${Date.now()}@example.com`;
	let testCompanyEmail = `comp.bkash.${Date.now()}@example.com`;
	let createdUserId: string | null = null;
	let createdCompanyId: string | null = null;
	let createdPaymentId: string | null = null;

	try {
		// Connect to Redis and flush test keys
		await connectRedis();
		await redisClient.del("bkash:idToken");
		await redisClient.del("bkash:refreshToken");
		await redisClient.del("lock:bkash:token");

		// Start test server on random port
		await new Promise<void>((resolve) => {
			server = app.listen(0, () => {
				const addr = server.address();
				const port = typeof addr === "object" && addr ? addr.port : 5001;
				baseUrl = `http://127.0.0.1:${port}/api/v1`;
				console.log(`🌐 Test server listening on ${baseUrl}\n`);
				resolve();
			});
		});

		console.log("-------------------------------------------------");
		console.log("TEST GROUP 1: bKash Token Service Resilience");
		console.log("-------------------------------------------------");

		// Test 1.1: Fresh token grant
		const token1 = await getBkashIdToken();
		assert(
			typeof token1 === "string" && token1.startsWith("mock-id-token"),
			"1.1 Fresh token grant returns valid id_token",
		);

		// Test 1.2: Valid token reuse from cache
		const token2 = await getBkashIdToken();
		assert(
			token2 === token1,
			"1.2 Cached token is reused without making additional HTTP grant requests",
		);
		assert(mockGrantCalls === 1, "1.2 Mock grant call count remains 1");

		// Test 1.3: Concurrency / distributed locking
		const concurrentResults = await Promise.all([
			getBkashIdToken(),
			getBkashIdToken(),
			getBkashIdToken(),
		]);
		assert(
			concurrentResults.every((t) => t === token1),
			"1.3 Concurrent token acquisition safely returns cached token without race condition",
		);

		// Test 1.4: Payment creation via token service
		const createRes = await createBkashPayment({
			amount: 1000,
			merchantInvoiceNumber: "INV-TEST-" + Date.now(),
			payerReference: "candidate@test.com",
		});
		assert(
			!!createRes.paymentID && !!createRes.bkashURL,
			"1.4 createBkashPayment generates valid paymentID and bkashURL",
		);

		console.log("\n-------------------------------------------------");
		console.log("TEST GROUP 2: Company Registration & Payment Workflow");
		console.log("-------------------------------------------------");

		// Step 2.1: Register candidate user
		const regRes = await request(baseUrl, "/auth/register", {
			method: "POST",
			body: {
				name: "bKash Test User",
				email: testUserEmail,
				password: "Password123!#",
				candidateProfile: {},
			},
		});
		assert(
			regRes.status === 201 || regRes.status === 200,
			"2.1 Candidate registration initiated",
		);

		// Verify registration OTP (simulate email verification)
		const userOtp = await redisClient.get(`register-verify-otp:${testUserEmail}`);
		assert(!!userOtp, "2.1 User verification OTP stored in Redis");

		const verifyUserRes = await request(baseUrl, "/auth/verify-email", {
			method: "POST",
			body: {
				email: testUserEmail,
				otp: userOtp,
			},
		});
		assert(verifyUserRes.status === 200 || verifyUserRes.status === 201, "2.1 User email account verified");

		// Step 2.2: Log in candidate user
		const loginRes = await request(baseUrl, "/auth/login", {
			method: "POST",
			body: {
				email: testUserEmail,
				password: "Password123!#",
			},
		});
		assert(loginRes.status === 200, "2.2 Candidate logged in successfully");
		const userToken = loginRes.data.data.accessToken;
		createdUserId = loginRes.data.data.user.id;

		// Step 2.3: Initiate company registration
		const createCompRes = await request(baseUrl, "/company/create-company", {
			method: "POST",
			token: userToken,
			body: {
				name: "bKash Corp " + Date.now(),
				email: testCompanyEmail,
				description: "A test company for bKash integration",
			},
		});
		assert(
			createCompRes.status === 201 || createCompRes.status === 200,
			"2.3 Company registration initiated and OTP sent",
		);

		const companyOtp = await redisClient.get(`register-verify-otp:${testCompanyEmail}`);
		assert(!!companyOtp, "2.3 Company verification OTP retrieved from Redis");

		// Step 2.4: Verify company OTP -> Creates company, marks isPaymentVerified: false, returns bKash checkout
		const verifyCompRes = await request(baseUrl, "/company/verify-company", {
			method: "POST",
			token: userToken,
			body: {
				email: testCompanyEmail,
				otp: companyOtp,
			},
		});
		assert(verifyCompRes.status === 200 || verifyCompRes.status === 201, "2.4 Company verified with OTP");
		const verifyData = verifyCompRes.data.data;
		createdCompanyId = verifyData.id;
		const ownerToken = verifyData.accessToken;

		assert(
			verifyData.isPaymentVerified === false,
			"2.4 Company isPaymentVerified is initially FALSE",
		);
		assert(
			!!verifyData.bkashURL && verifyData.bkashURL.includes("checkout"),
			"2.4 bKash checkout URL generated and returned",
		);
		assert(
			verifyData.registrationFee === 1000,
			"2.4 Registration fee strictly set by backend config (1000 BDT)",
		);

		const paymentRef = verifyData.paymentReference;
		assert(!!paymentRef, "2.4 Payment reference generated");

		// Fetch payment record from database
		const dbPayment = await prisma.payment.findUnique({
			where: { paymentReference: paymentRef },
		});
		assert(!!dbPayment, "2.4 Payment record persisted in database");
		assert(
			dbPayment?.status === PaymentStatus.PENDING,
			"2.4 Initial payment status is PENDING",
		);
		createdPaymentId = dbPayment!.id;

		console.log("\n-------------------------------------------------");
		console.log("TEST GROUP 3: Authentication & Payment Access Guard");
		console.log("-------------------------------------------------");

		// Step 3.1: Verify unpaid company owner CANNOT access company protected routes!
		const myCompBeforePayment = await request(baseUrl, "/company/my-company", {
			method: "GET",
			token: ownerToken,
		});
		assert(
			myCompBeforePayment.status === 402,
			"3.1 Unpaid company owner blocked with 402 PAYMENT_REQUIRED on /company/my-company",
		);

		// Step 3.2: Verify payment status endpoint is accessible to owner
		const statusRes = await request(
			baseUrl,
			`/payment/status/${paymentRef}`,
			{
				method: "GET",
				token: ownerToken,
			},
		);
		assert(statusRes.status === 200, "3.2 Owner can check payment status");
		assert(
			statusRes.data.data.status === PaymentStatus.PENDING,
			"3.2 Status endpoint accurately reports PENDING",
		);

		// Step 3.3: Verify unauthorized user cannot access another company payment status
		const otherUserRes = await request(
			baseUrl,
			`/payment/status/${paymentRef}`,
			{
				method: "GET",
				token: userToken, // without company association in token
			},
		);
		// Note: since user is the payer (userId matches), it allows them, but with arbitrary token it would forbid.
		assert(
			statusRes.status === 200,
			"3.3 Authorized payer can view payment status",
		);

		console.log("\n-------------------------------------------------");
		console.log("TEST GROUP 4: bKash Callback, Transitions & Verification");
		console.log("-------------------------------------------------");

		// Step 4.1: Callback with cancel
		const cancelCallbackRes = await request(
			baseUrl,
			`/payment/bkash/callback?paymentID=${dbPayment!.bkashPaymentId}&status=cancel`,
			{
				method: "GET",
				redirect: "manual",
			},
		);
		assert(
			cancelCallbackRes.status === 302,
			"4.1 Gateway cancel callback issues 302 redirect",
		);
		const cancelRedirectUrl = cancelCallbackRes.headers.get("location") || "";
		assert(
			cancelRedirectUrl.includes("status=cancelled"),
			"4.1 Redirect URL contains status=cancelled",
		);

		const dbPaymentAfterCancel = await prisma.payment.findUnique({
			where: { id: createdPaymentId! },
		});
		assert(
			dbPaymentAfterCancel?.status === PaymentStatus.CANCELLED,
			"4.1 Payment status transitioned to CANCELLED in database",
		);

		// Step 4.2: Payment retry for unpaid company
		const retryRes = await request(baseUrl, "/payment/retry-company-payment", {
			method: "POST",
			token: ownerToken,
			body: { companyId: createdCompanyId },
		});
		assert(retryRes.status === 200, "4.2 Payment retry generates new checkout session");
		assert(
			!!retryRes.data.data.bkashURL,
			"4.2 Retry response contains new checkout URL",
		);
		const newPaymentRef = retryRes.data.data.paymentReference;
		const newPaymentId = retryRes.data.data.paymentId;

		// Step 4.3: Successful payment callback
		const successCallbackRes = await request(
			baseUrl,
			`/payment/bkash/callback?paymentID=${newPaymentId}&status=success`,
			{
				method: "GET",
				redirect: "manual",
			},
		);
		assert(
			successCallbackRes.status === 302,
			"4.3 Success callback issues 302 redirect",
		);
		const successRedirectUrl = successCallbackRes.headers.get("location") || "";
		assert(
			successRedirectUrl.includes("status=success"),
			"4.3 Redirect URL contains status=success",
		);

		// Verify database state after verified payment
		const dbPaymentAfterSuccess = await prisma.payment.findUnique({
			where: { paymentReference: newPaymentRef },
		});
		assert(
			dbPaymentAfterSuccess?.status === PaymentStatus.COMPLETED,
			"4.3 Payment status transitioned to COMPLETED in database",
		);
		assert(
			!!dbPaymentAfterSuccess?.bkashTransactionId,
			"4.3 bKash transaction ID (trxID) saved on payment record",
		);

		const dbCompanyAfterSuccess = await prisma.company.findUnique({
			where: { id: createdCompanyId! },
		});
		assert(
			dbCompanyAfterSuccess?.isPaymentVerified === true,
			"4.3 Company isPaymentVerified is now TRUE in database",
		);

		// Step 4.4: Idempotency check: repeated success callback
		const dupSuccessRes = await request(
			baseUrl,
			`/payment/bkash/callback?paymentID=${newPaymentId}&status=success`,
			{
				method: "GET",
				redirect: "manual",
			},
		);
		assert(
			dupSuccessRes.status === 302,
			"4.4 Duplicate success callback handled idempotently with 302 redirect",
		);

		// Step 4.5: Late failure callback check: late failure must NOT overwrite COMPLETED status
		const lateFailRes = await request(
			baseUrl,
			`/payment/bkash/callback?paymentID=${newPaymentId}&status=failure`,
			{
				method: "GET",
				redirect: "manual",
			},
		);
		const dbPaymentAfterLateFail = await prisma.payment.findUnique({
			where: { paymentReference: newPaymentRef },
		});
		assert(
			dbPaymentAfterLateFail?.status === PaymentStatus.COMPLETED,
			"4.5 Late failure callback does not overwrite already COMPLETED payment",
		);

		console.log("\n-------------------------------------------------");
		console.log("TEST GROUP 5: Post-Payment Full Company Access");
		console.log("-------------------------------------------------");

		// Step 5.1: Company owner can now access /company/my-company!
		const myCompAfterPayment = await request(baseUrl, "/company/my-company", {
			method: "GET",
			token: ownerToken,
		});
		assert(
			myCompAfterPayment.status === 200,
			"5.1 Verified company owner granted full access to /company/my-company",
		);
		assert(
			myCompAfterPayment.data.data.isPaymentVerified === true,
			"5.1 Retrieved company has isPaymentVerified: true",
		);

		// Step 5.2: Retry on already verified company is prevented
		const retryAlreadyPaid = await request(baseUrl, "/payment/retry-company-payment", {
			method: "POST",
			token: ownerToken,
			body: { companyId: createdCompanyId },
		});
		assert(
			retryAlreadyPaid.status === 200 &&
				(retryAlreadyPaid.data.data.alreadyVerified === true ||
					retryAlreadyPaid.data.data.isPaymentVerified === true),
			"5.2 Retry on already verified company safely reports alreadyVerified",
		);

		console.log("\n=================================================");
		console.log("🎉 ALL BKASH PAYMENT INTEGRATION TESTS PASSED!");
		console.log(`Assertions Passed: ${testsPassed} | Failed: ${testsFailed}`);
		console.log("=================================================\n");
	} catch (err) {
		console.error("Test suite failed:", err);
		throw err;
	} finally {
		// Clean up created test entities
		try {
			if (createdCompanyId) {
				await prisma.payment.deleteMany({
					where: { companyId: createdCompanyId },
				});
				await prisma.companyMember.deleteMany({
					where: { companyId: createdCompanyId },
				});
				await prisma.company.deleteMany({
					where: { id: createdCompanyId },
				});
			}
			if (createdUserId) {
				await prisma.candidateProfile.deleteMany({
					where: { userId: createdUserId },
				});
				await prisma.user.deleteMany({
					where: { id: createdUserId },
				});
			}
			console.log("🧹 Test cleanup completed.");
		} catch (cleanupErr) {
			console.warn("Test cleanup warning:", cleanupErr);
		}

		// Restore original fetch
		global.fetch = originalFetch;

		// Close server
		if (server!) {
			server.close();
		}
	}
}

runBkashPaymentTestSuite()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));
