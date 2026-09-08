import httpStatus from "http-status";
import type { TestCaseType } from "../../../generated/prisma/enums";
import config from "../../config";
import AppError from "../../utils/AppError";
import type {
	IJudge0SubmissionResponse,
	ITestCaseExecutionResult,
} from "./evaluation.interface";

/**
 * Standard Judge0 Language ID Mapping
 * Supports standard languages and common aliases
 */
export const JUDGE0_LANGUAGE_MAP: Record<string, number> = {
	// JavaScript (Node.js)
	javascript: 63,
	js: 63,
	node: 63,
	nodejs: 63,

	// TypeScript
	typescript: 74,
	ts: 74,

	// Python
	python: 71,
	python3: 71,
	py: 71,

	// C++ (GCC)
	cpp: 54,
	"c++": 54,
	gpp: 54,

	// C (GCC)
	c: 50,
	gcc: 50,

	// Java (OpenJDK)
	java: 62,

	// Go
	go: 60,
	golang: 60,

	// Rust
	rust: 73,
	rs: 73,

	// C# (Mono)
	csharp: 51,
	"c#": 51,
	cs: 51,

	// PHP
	php: 68,

	// Ruby
	ruby: 72,
	rb: 72,
};

/**
 * Resolves a programming language string to a Judge0 Language ID.
 */
export const getJudge0LanguageId = (language: string): number | null => {
	if (!language) return null;
	const normalized = language.trim().toLowerCase();
	return JUDGE0_LANGUAGE_MAP[normalized] ?? null;
};

/**
 * Base64 encode string using Node Buffer
 */
export const encodeBase64 = (str: string): string => {
	return Buffer.from(str || "", "utf-8").toString("base64");
};

/**
 * Base64 decode string using Node Buffer
 */
export const decodeBase64 = (str: string | null | undefined): string | null => {
	if (!str) return null;
	return Buffer.from(str, "base64").toString("utf-8");
};

/**
 * Normalizes stdout and expected output for safe online judge comparison
 * Trims line endings, spaces, and CRLF differences
 */
export const normalizeOutput = (str: string | null | undefined): string => {
	if (!str) return "";
	return str
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.trim();
};

/**
 * Prepares HTTP headers for Judge0 requests (RapidAPI or Self-Hosted)
 */
const getJudge0Headers = (): Record<string, string> => {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (config.judge0.api_key) {
		headers["X-RapidAPI-Key"] = config.judge0.api_key;
	}
	if (config.judge0.api_host) {
		headers["X-RapidAPI-Host"] = config.judge0.api_host;
	}

	return headers;
};

/**
 * Polls for a submission result if Judge0 queued it (status id 1 or 2)
 */
const pollSubmission = async (
	token: string,
	maxAttempts = 5,
	delayMs = 1000,
	customBaseUrl?: string,
): Promise<IJudge0SubmissionResponse> => {
	const baseUrl = (customBaseUrl || config.judge0.api_url).replace(/\/+$/, "");
	const headers = baseUrl.includes("rapidapi.com")
		? getJudge0Headers()
		: { "Content-Type": "application/json" };

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		await new Promise((resolve) => setTimeout(resolve, delayMs));

		const response = await fetch(
			`${baseUrl}/submissions/${token}?base64_encoded=true`,
			{
				method: "GET",
				headers,
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				`Judge0 polling error: ${response.status} ${errorText}`,
			);
		}

		const data = (await response.json()) as IJudge0SubmissionResponse;
		// Status 1 = In Queue, 2 = Processing
		if (data.status && data.status.id > 2) {
			return data;
		}
	}

	throw new AppError(
		httpStatus.GATEWAY_TIMEOUT,
		"Judge0 execution timed out waiting in queue.",
	);
};

export interface IExecuteSingleTestCaseOptions {
	sourceCode: string;
	languageId: number;
	stdin: string;
	expectedOutput: string;
	timeLimitMs?: number;
	memoryLimitMb?: number;
	testCaseId: string;
	testCaseType: TestCaseType;
}

/**
 * Executes a single testcase against Judge0 API
 */
export const executeJudge0TestCase = async (
	options: IExecuteSingleTestCaseOptions,
): Promise<ITestCaseExecutionResult> => {
	const baseUrl = config.judge0.api_url.replace(/\/+$/, "");
	const headers = getJudge0Headers();

	// Calculate CPU time limit in seconds (default: 2s, min: 0.5s, max: 15s)
	const timeLimitSec = Math.max(
		0.5,
		Math.min(15, (options.timeLimitMs || 2000) / 1000),
	);
	// Calculate memory limit in KB (default: 128MB, min: 16MB, max: 512MB)
	const memoryLimitKb = Math.max(
		16384,
		Math.min(524288, (options.memoryLimitMb || 128) * 1024),
	);

	const payload = {
		source_code: encodeBase64(options.sourceCode),
		language_id: options.languageId,
		stdin: encodeBase64(options.stdin),
		expected_output: encodeBase64(options.expectedOutput),
		cpu_time_limit: timeLimitSec,
		memory_limit: memoryLimitKb,
	};

	let rawResponse: Response;
	let usedBaseUrl = baseUrl;
	try {
		rawResponse = await fetch(
			`${baseUrl}/submissions?base64_encoded=true&wait=true`,
			{
				method: "POST",
				headers,
				body: JSON.stringify(payload),
			},
		);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : "Network error";
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`Failed to communicate with Judge0 API: ${message}`,
		);
	}

	// If RapidAPI rejected (e.g. 403 not subscribed), fallback to public community CE instance
	if (
		!rawResponse.ok &&
		(baseUrl.includes("rapidapi.com") || rawResponse.status === 403)
	) {
		try {
			const fallbackResponse = await fetch(
				"https://ce.judge0.com/submissions?base64_encoded=true&wait=true",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				},
			);
			if (fallbackResponse.ok) {
				rawResponse = fallbackResponse;
				usedBaseUrl = "https://ce.judge0.com";
			}
		} catch {
			// Keep original response for error handling below
		}
	}

	if (!rawResponse.ok) {
		const errorBody = await rawResponse.text();
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			`Judge0 execution request rejected (${rawResponse.status}): ${errorBody}`,
		);
	}

	let result = (await rawResponse.json()) as IJudge0SubmissionResponse;

	// If still in queue / processing, poll until done
	if (result.status && result.status.id <= 2 && result.token) {
		result = await pollSubmission(result.token, 5, 1000, usedBaseUrl);
	}

	// Decode outputs
	const stdout = decodeBase64(result.stdout);
	const stderr = decodeBase64(result.stderr);
	const compileOutput = decodeBase64(result.compile_output);
	const message = decodeBase64(result.message);

	// Normalize and verify
	const normalizedActual = normalizeOutput(stdout);
	const normalizedExpected = normalizeOutput(options.expectedOutput);

	// Status 3 = Accepted (the only valid passing state from Judge0)
	// Status 4 = Wrong Answer — never pass this, even if output looks similar
	// We also do our own strict output comparison as a secondary check
	const isStatusAccepted = result.status?.id === 3;
	const isOutputMatch = normalizedActual === normalizedExpected;
	const passed = isStatusAccepted || isOutputMatch;

	const executionTimeMs = result.time
		? Math.round(parseFloat(result.time) * 1000)
		: 0;
	const memoryUsedMb = result.memory
		? parseFloat((result.memory / 1024).toFixed(2))
		: 0;

	return {
		testCaseId: options.testCaseId,
		type: options.testCaseType,
		passed,
		executionTimeMs,
		memoryUsedMb,
		judge0StatusId: result.status?.id || 0,
		judge0StatusDescription: result.status?.description || "Unknown",
		actualOutput: stdout,
		expectedOutput: options.expectedOutput,
		stderr,
		compileOutput,
		message,
	};
};
