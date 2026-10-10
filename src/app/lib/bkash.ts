import crypto from "crypto";
import config from "../config";
import redisClient from "./redis";

const ID_TOKEN_KEY = "bkash:idToken";
const REFRESH_TOKEN_KEY = "bkash:refreshToken";
const TOKEN_LOCK_KEY = "lock:bkash:token";

const REFRESH_THRESHOLD_SECONDS = 600; // 10 minutes
const ID_TOKEN_DEFAULT_TTL = 3600; // 1 hour
const REFRESH_TOKEN_DEFAULT_TTL = 28 * 24 * 3600; // 28 days
const HTTP_TIMEOUT_MS = 10000; // 10 seconds

export interface IBkashCreatePaymentParams {
	amount: number;
	merchantInvoiceNumber: string;
	payerReference: string;
}

export interface IBkashCreatePaymentResponse {
	statusCode: string;
	statusMessage: string;
	paymentID: string;
	bkashURL: string;
	customerMsisdn?: string;
	amount: string;
	currency: string;
	intent: string;
	merchantInvoiceNumber: string;
	orgLogo?: string;
	orgName?: string;
	transactionStatus?: string;
}

export interface IBkashExecutePaymentResponse {
	statusCode: string;
	statusMessage: string;
	paymentID: string;
	trxID: string;
	transactionStatus: string;
	amount: string;
	currency: string;
	intent?: string;
	merchantInvoiceNumber?: string;
	customerMsisdn?: string;
	paymentExecuteTime?: string;
}

export interface IBkashQueryPaymentResponse {
	statusCode: string;
	statusMessage: string;
	paymentID: string;
	trxID?: string;
	transactionStatus: string;
	amount: string;
	currency: string;
	intent?: string;
	merchantInvoiceNumber?: string;
	customerMsisdn?: string;
	paymentExecuteTime?: string;
}

const safeRedisGet = async (key: string): Promise<string | null> => {
	try {
		if (!redisClient.isOpen) return null;
		const val = await redisClient.get(key);
		return typeof val === "string" ? val : null;
	} catch (err) {
		console.warn(`[bKash] Redis get failed for ${key}:`, err);
		return null;
	}
};

const safeRedisTTL = async (key: string): Promise<number> => {
	try {
		if (!redisClient.isOpen) return -2;
		return await redisClient.ttl(key);
	} catch (err) {
		console.warn(`[bKash] Redis ttl failed for ${key}:`, err);
		return -2;
	}
};

const safeRedisSet = async (
	key: string,
	value: string,
	ttlSeconds: number,
): Promise<void> => {
	try {
		if (!redisClient.isOpen) return;
		await redisClient.set(key, value, {
			expiration: {
				type: "EX",
				value: ttlSeconds,
			},
		});
	} catch (err) {
		console.warn(`[bKash] Redis set failed for ${key}:`, err);
	}
};

const safeRedisDel = async (key: string): Promise<void> => {
	try {
		if (!redisClient.isOpen) return;
		await redisClient.del(key);
	} catch (err) {
		console.warn(`[bKash] Redis del failed for ${key}:`, err);
	}
};

const acquireLock = async (
	lockKey: string,
	lockVal: string,
	ttlSeconds = 15,
): Promise<boolean> => {
	try {
		if (!redisClient.isOpen) return true; // proceed without lock if redis unavailable
		const res = await redisClient.set(lockKey, lockVal, {
			expiration: {
				type: "EX",
				value: ttlSeconds,
			},
			condition: "NX",
		});
		return res === "OK";
	} catch {
		return true;
	}
};

const releaseLock = async (
	lockKey: string,
	lockVal: string,
): Promise<void> => {
	try {
		if (!redisClient.isOpen) return;
		const currentVal = await redisClient.get(lockKey);
		if (currentVal === lockVal) {
			await redisClient.del(lockKey);
		}
	} catch (err) {
		console.warn("[bKash] Failed to release lock:", err);
	}
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const requestFreshToken = async (): Promise<{
	id_token: string;
	refresh_token: string;
	expires_in?: number;
}> => {
	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/token/grant`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				username: config.bkash_username,
				password: config.bkash_password,
			},
			body: JSON.stringify({
				app_key: config.bkash_app_key,
				app_secret: config.bkash_app_secret,
			}),
			signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		throw new Error(
			`bKash token grant HTTP error: status ${response.status}`,
		);
	}

	const result = await response.json();

	if (
		result.statusCode &&
		result.statusCode !== "0000" &&
		result.statusCode !== "200"
	) {
		throw new Error(
			result.statusMessage || "bKash token grant rejected by provider",
		);
	}

	if (typeof result.id_token !== "string" || !result.id_token.trim()) {
		throw new Error("bKash token grant returned missing or invalid id_token");
	}

	if (
		typeof result.refresh_token !== "string" ||
		!result.refresh_token.trim()
	) {
		throw new Error(
			"bKash token grant returned missing or invalid refresh_token",
		);
	}

	return {
		id_token: result.id_token,
		refresh_token: result.refresh_token,
		expires_in: Number(result.expires_in) || ID_TOKEN_DEFAULT_TTL,
	};
};

const requestRefreshToken = async (
	refreshToken: string,
): Promise<{
	id_token: string;
	refresh_token?: string;
	expires_in?: number;
} | null> => {
	try {
		const response = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/token/refresh`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					username: config.bkash_username,
					password: config.bkash_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_app_key,
					app_secret: config.bkash_app_secret,
					refresh_token: refreshToken,
				}),
				signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
			},
		);

		if (!response.ok) {
			return null;
		}

		const result = await response.json();

		if (
			result.statusCode &&
			result.statusCode !== "0000" &&
			result.statusCode !== "200"
		) {
			return null;
		}

		if (typeof result.id_token !== "string" || !result.id_token.trim()) {
			return null;
		}

		return {
			id_token: result.id_token,
			refresh_token:
				typeof result.refresh_token === "string" && result.refresh_token.trim()
					? result.refresh_token
					: undefined,
			expires_in: Number(result.expires_in) || ID_TOKEN_DEFAULT_TTL,
		};
	} catch {
		return null;
	}
};

/**
 * Retrieves a valid bKash access token (id_token).
 * Checks Redis cache, refreshes near-expiry tokens, requests fresh grant if needed.
 * Employs distributed locking and bounded retries to prevent concurrent stampedes and infinite recursion.
 */
export const getBkashIdToken = async (attempt = 1): Promise<string> => {
	const MAX_ATTEMPTS = 2;
	if (attempt > MAX_ATTEMPTS) {
		throw new Error("Maximum bKash token acquisition attempts exceeded");
	}

	// 1. Fast path: check cached id_token
	let cachedIdToken = await safeRedisGet(ID_TOKEN_KEY);
	let idTokenTTL = await safeRedisTTL(ID_TOKEN_KEY);

	// If TTL is -1 (key exists without expiration), consider valid and re-apply expiration
	if (idTokenTTL === -1 && cachedIdToken) {
		await safeRedisSet(ID_TOKEN_KEY, cachedIdToken, ID_TOKEN_DEFAULT_TTL);
		idTokenTTL = ID_TOKEN_DEFAULT_TTL;
	}

	if (cachedIdToken && idTokenTTL > REFRESH_THRESHOLD_SECONDS) {
		return cachedIdToken;
	}

	// 2. Token needs refresh or fresh grant: acquire distributed lock
	const lockValue = crypto.randomUUID();
	const hasLock = await acquireLock(TOKEN_LOCK_KEY, lockValue, 15);

	if (!hasLock) {
		// Wait for the lock holder to finish refreshing (up to 5 polls)
		for (let i = 0; i < 5; i++) {
			await sleep(300);
			cachedIdToken = await safeRedisGet(ID_TOKEN_KEY);
			idTokenTTL = await safeRedisTTL(ID_TOKEN_KEY);
			if (cachedIdToken && idTokenTTL > REFRESH_THRESHOLD_SECONDS) {
				return cachedIdToken;
			}
		}
	}

	try {
		// Recheck cache after acquiring lock
		cachedIdToken = await safeRedisGet(ID_TOKEN_KEY);
		idTokenTTL = await safeRedisTTL(ID_TOKEN_KEY);
		if (cachedIdToken && idTokenTTL > REFRESH_THRESHOLD_SECONDS) {
			return cachedIdToken;
		}

		const cachedRefreshToken = await safeRedisGet(REFRESH_TOKEN_KEY);
		const refreshTokenTTL = await safeRedisTTL(REFRESH_TOKEN_KEY);

		// Try refresh if refresh token exists and has adequate validity
		if (
			cachedRefreshToken &&
			(refreshTokenTTL > REFRESH_THRESHOLD_SECONDS || refreshTokenTTL === -1)
		) {
			const refreshResult = await requestRefreshToken(cachedRefreshToken);
			if (refreshResult) {
				await safeRedisSet(
					ID_TOKEN_KEY,
					refreshResult.id_token,
					refreshResult.expires_in || ID_TOKEN_DEFAULT_TTL,
				);
				if (refreshResult.refresh_token) {
					await safeRedisSet(
						REFRESH_TOKEN_KEY,
						refreshResult.refresh_token,
						REFRESH_TOKEN_DEFAULT_TTL,
					);
				}
				return refreshResult.id_token;
			}
			// Refresh failed: clear invalid cached credentials and fall through to fresh grant
			await safeRedisDel(REFRESH_TOKEN_KEY);
			await safeRedisDel(ID_TOKEN_KEY);
		}

		// Fresh grant
		const grantResult = await requestFreshToken();
		await safeRedisSet(
			ID_TOKEN_KEY,
			grantResult.id_token,
			grantResult.expires_in || ID_TOKEN_DEFAULT_TTL,
		);
		await safeRedisSet(
			REFRESH_TOKEN_KEY,
			grantResult.refresh_token,
			REFRESH_TOKEN_DEFAULT_TTL,
		);

		return grantResult.id_token;
	} finally {
		if (hasLock) {
			await releaseLock(TOKEN_LOCK_KEY, lockValue);
		}
	}
};

/**
 * Initiates a bKash Tokenized Checkout session.
 */
export const createBkashPayment = async (
	params: IBkashCreatePaymentParams,
): Promise<IBkashCreatePaymentResponse> => {
	if (!params.amount || params.amount <= 0 || !Number.isFinite(params.amount)) {
		throw new Error("Invalid payment amount specified");
	}
	if (!params.merchantInvoiceNumber) {
		throw new Error("Merchant invoice number is required");
	}

	const idToken = await getBkashIdToken();

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: idToken,
				"X-APP-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: params.payerReference,
				callbackURL: config.bkash_callback_url,
				amount: params.amount.toFixed(2),
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: params.merchantInvoiceNumber,
			}),
			signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		throw new Error(
			`bKash payment creation failed with HTTP status ${response.status}`,
		);
	}

	const result = (await response.json()) as IBkashCreatePaymentResponse;

	if (result.statusCode !== "0000" && result.statusCode !== "200") {
		throw new Error(
			result.statusMessage || "bKash rejected payment creation request",
		);
	}

	if (!result.paymentID || !result.bkashURL) {
		throw new Error(
			"bKash payment response is missing paymentID or checkout bkashURL",
		);
	}

	return result;
};

/**
 * Executes a bKash Tokenized Checkout payment after candidate redirect.
 */
export const executeBkashPayment = async (
	paymentID: string,
): Promise<IBkashExecutePaymentResponse> => {
	if (!paymentID || typeof paymentID !== "string") {
		throw new Error("Valid bKash paymentID is required for execution");
	}

	const idToken = await getBkashIdToken();

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: idToken,
				"X-APP-Key": config.bkash_app_key,
			},
			body: JSON.stringify({ paymentID }),
			signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		throw new Error(
			`bKash payment execution failed with HTTP status ${response.status}`,
		);
	}

	const result = (await response.json()) as IBkashExecutePaymentResponse;

	if (result.statusCode !== "0000" && result.statusCode !== "200") {
		throw new Error(
			result.statusMessage || "bKash rejected payment execution request",
		);
	}

	if (!result.trxID) {
		throw new Error("bKash execution response is missing transaction trxID");
	}

	return result;
};

/**
 * Queries payment status directly from bKash (useful for reconciliation / timeouts).
 */
export const queryBkashPayment = async (
	paymentID: string,
): Promise<IBkashQueryPaymentResponse> => {
	if (!paymentID || typeof paymentID !== "string") {
		throw new Error("Valid bKash paymentID is required to query payment");
	}

	const idToken = await getBkashIdToken();

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/payment/status`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: idToken,
				"X-APP-Key": config.bkash_app_key,
			},
			body: JSON.stringify({ paymentID }),
			signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
		},
	);

	if (!response.ok) {
		throw new Error(
			`bKash query payment failed with HTTP status ${response.status}`,
		);
	}

	const result = (await response.json()) as IBkashQueryPaymentResponse;
	return result;
};
