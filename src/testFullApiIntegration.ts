import type { Server } from "http";
import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import redisClient from "./app/lib/redis";
import {
	AntiCheatEventType,
	AssessmentStatus,
	AttemptStatus,
} from "./generated/prisma/enums";

// Test execution tracking
let testsPassed = 0;
let testsFailed = 0;
const testResults: { step: string; status: "PASS" | "FAIL"; error?: string }[] =
	[];

function assert(condition: boolean, stepName: string, message?: string) {
	if (condition) {
		console.log(`  ✅ [PASS] ${stepName}`);
		testsPassed++;
		testResults.push({ step: stepName, status: "PASS" });
	} else {
		console.error(`  ❌ [FAIL] ${stepName}: ${message || "Assertion failed"}`);
		testsFailed++;
		testResults.push({
			step: stepName,
			status: "FAIL",
			error: message || "Assertion failed",
		});
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
	});

	let data: any = null;
	const text = await res.text();
	try {
		data = JSON.parse(text);
	} catch {
		data = text;
	}

	return {
		status: res.status,
		headers: res.headers,
		data,
	};
}

async function runFullIntegrationTest() {
	console.log(
		"===============================================================",
	);
	console.log("🚀 STARTING COMPREHENSIVE END-TO-END API INTEGRATION TEST");
	console.log(
		"===============================================================",
	);

	if (!redisClient.isOpen) {
		await redisClient.connect();
	}

	// Start Express server on ephemeral port
	const server: Server = await new Promise((resolve) => {
		const s = app.listen(0, () => resolve(s));
	});

	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 5000;
	const baseUrl = `http://127.0.0.1:${port}`;
	console.log(`📡 Ephemeral Test Server listening on: ${baseUrl}`);

	// Keep track of IDs created for targeted cleanup
	const createdProblemIds: string[] = [];
	let createdAssessmentId: string | null = null;
	let createdAttemptId: string | null = null;
	let mcqSubmissionId: string | null = null;
	let writtenSubmissionId: string | null = null;
	let mcqProblemId: string | null = null;
	let writtenProblemId: string | null = null;
	let testCandidateId: string | null = null;

	try {
		// =========================================================================
		// MODULE 0: ROOT & HEALTH CHECK
		// =========================================================================
		console.log("\n📦 MODULE 0: System Root Endpoint");
		const rootRes = await request(baseUrl, "/");
		assert(
			rootRes.status === 200 && rootRes.data?.success === true,
			"GET / returns 200 with platform welcome banner",
		);

		// =========================================================================
		// MODULE 1: AUTHENTICATION & RBAC LOGINS
		// =========================================================================
		console.log("\n📦 MODULE 1: Authentication & Authorization Flow");

		// 1.1 Super Admin Login
		const superAdminLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.super_admin_email,
				password: config.super_admin_password,
			},
		});
		assert(
			superAdminLogin.status === 200 &&
				Boolean(superAdminLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Super Admin)",
			superAdminLogin.data?.message,
		);
		const superAdminToken = superAdminLogin.data.data.accessToken;

		// 1.2 Platform Admin Login
		const testerAdminLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.tester_admin_email,
				password: config.tester_admin_password,
			},
		});
		assert(
			testerAdminLogin.status === 200 &&
				Boolean(testerAdminLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Platform Admin)",
			testerAdminLogin.data?.message,
		);
		const testerAdminToken = testerAdminLogin.data.data.accessToken;

		// 1.3 Company Admin Login
		const companyAdminLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.company_admin_email,
				password: config.company_admin_password,
			},
		});
		assert(
			companyAdminLogin.status === 200 &&
				Boolean(companyAdminLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Company Admin)",
			companyAdminLogin.data?.message,
		);
		const companyAdminToken = companyAdminLogin.data.data.accessToken;

		// 1.4 Company Recruiter Login
		const recruiterLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.company_recruiter_email,
				password: config.company_recruiter_password,
			},
		});
		assert(
			recruiterLogin.status === 200 &&
				Boolean(recruiterLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Company Recruiter)",
			recruiterLogin.data?.message,
		);
		const recruiterToken = recruiterLogin.data.data.accessToken;

		// 1.5 Assessment Creator Login
		const creatorLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.assessment_creator_email,
				password: config.assessment_creator_password,
			},
		});
		assert(
			creatorLogin.status === 200 &&
				Boolean(creatorLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Assessment Creator)",
			creatorLogin.data?.message,
		);
		const creatorToken = creatorLogin.data.data.accessToken;

		// 1.6 Evaluator Login
		const evaluatorLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.evaluator_email,
				password: config.evaluator_password,
			},
		});
		assert(
			evaluatorLogin.status === 200 &&
				Boolean(evaluatorLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Evaluator)",
			evaluatorLogin.data?.message,
		);
		const evaluatorToken = evaluatorLogin.data.data.accessToken;

		// 1.7 Candidate Login
		const candidateLogin = await request(baseUrl, "/api/v1/auth/login", {
			method: "POST",
			body: {
				email: config.candidate_email,
				password: config.candidate_password,
			},
		});
		assert(
			candidateLogin.status === 200 &&
				Boolean(candidateLogin.data?.data?.accessToken),
			"POST /api/v1/auth/login (Candidate)",
			candidateLogin.data?.message,
		);
		const candidateToken = candidateLogin.data.data.accessToken;
		const candidateRefreshToken = candidateLogin.data.data.refreshToken;
		testCandidateId = candidateLogin.data.data.user.id;

		// 1.8 Verify GET /api/v1/auth/me
		const meRes = await request(baseUrl, "/api/v1/auth/me", {
			token: candidateToken,
		});
		assert(
			meRes.status === 200 &&
				meRes.data?.data?.email === config.candidate_email,
			"GET /api/v1/auth/me (Candidate Profile)",
		);

		// 1.9 Verify POST /api/v1/auth/refresh-token
		const refreshRes = await request(baseUrl, "/api/v1/auth/refresh-token", {
			method: "POST",
			cookie: `refreshToken=${candidateRefreshToken}`,
			body: { refreshToken: candidateRefreshToken },
		});
		assert(
			refreshRes.status === 200 && Boolean(refreshRes.data?.data?.accessToken),
			"POST /api/v1/auth/refresh-token",
		);

		// =========================================================================
		// MODULE 2: COMPANY & WORKSPACE
		// =========================================================================
		console.log("\n📦 MODULE 2: Company & Workspace Management");

		// 2.1 Get My Company (Company Admin)
		const myCompanyRes = await request(baseUrl, "/api/v1/company/my-company", {
			token: companyAdminToken,
		});
		assert(
			myCompanyRes.status === 200 && Boolean(myCompanyRes.data?.data),
			"GET /api/v1/company/my-company",
		);
		const companyId = myCompanyRes.data.data.id;

		// 2.2 Get Company Members
		const membersRes = await request(
			baseUrl,
			`/api/v1/company/${companyId}/members`,
			{
				token: companyAdminToken,
			},
		);
		assert(
			membersRes.status === 200 && Array.isArray(membersRes.data?.data),
			`GET /api/v1/company/${companyId}/members (Found ${membersRes.data?.data?.length} members)`,
		);

		// =========================================================================
		// MODULE 3: PROBLEM BANK
		// =========================================================================
		console.log("\n📦 MODULE 3: Problem Bank Management");

		// 3.1 Create MCQ Problem
		const createMcqRes = await request(
			baseUrl,
			"/api/v1/problem/create-problem",
			{
				method: "POST",
				token: creatorToken,
				body: {
					title: "Integration Test: TypeScript Generics & Mapped Types",
					description:
						"Which TypeScript keyword or operator enables creating a new type by iterating over property keys?",
					type: "MCQ",
					difficulty: "MEDIUM",
					marks: 5,
					companyId: companyId,
					mcq: {
						explanation:
							"The 'keyof' and 'in' operators combined facilitate mapped types in TypeScript.",
						options: [
							{ optionText: "in", isCorrect: true, optionOrder: 1 },
							{ optionText: "implements", isCorrect: false, optionOrder: 2 },
							{ optionText: "extends", isCorrect: false, optionOrder: 3 },
							{ optionText: "namespace", isCorrect: false, optionOrder: 4 },
						],
					},
				},
			},
		);
		assert(
			createMcqRes.status === 201 && Boolean(createMcqRes.data?.data?.id),
			"POST /api/v1/problem/create-problem (MCQ Problem)",
			createMcqRes.data?.message,
		);
		mcqProblemId = createMcqRes.data.data.id;
		if (mcqProblemId) createdProblemIds.push(mcqProblemId);

		// 3.2 Create Written Problem
		const createWrittenRes = await request(
			baseUrl,
			"/api/v1/problem/create-problem",
			{
				method: "POST",
				token: creatorToken,
				body: {
					title: "Integration Test: Database Concurrency & ACID Guarantees",
					description:
						"Explain how MVCC (Multi-Version Concurrency Control) prevents dirty reads without locking tables.",
					type: "WRITTEN",
					difficulty: "HARD",
					marks: 10,
					companyId: companyId,
					written: {
						wordLimit: 300,
						expectedAnswer:
							"MVCC maintains multiple historical versions of data rows using transaction IDs (xmin, xmax), enabling snapshot isolation where readers do not block writers and writers do not block readers.",
					},
				},
			},
		);
		assert(
			createWrittenRes.status === 201 &&
				Boolean(createWrittenRes.data?.data?.id),
			"POST /api/v1/problem/create-problem (Written Problem)",
			createWrittenRes.data?.message,
		);
		writtenProblemId = createWrittenRes.data.data.id;
		if (writtenProblemId) createdProblemIds.push(writtenProblemId);

		// 3.3 Get Platform Problems (Platform Admin)
		const allProblemsRes = await request(baseUrl, "/api/v1/problem/", {
			token: testerAdminToken,
		});
		assert(
			allProblemsRes.status === 200 && Array.isArray(allProblemsRes.data?.data),
			"GET /api/v1/problem/ (Super/Platform Admin View)",
		);

		// 3.4 Get Company Problems
		const companyProblemsRes = await request(
			baseUrl,
			"/api/v1/problem/company-problems",
			{
				token: creatorToken,
			},
		);
		assert(
			companyProblemsRes.status === 200 &&
				Array.isArray(companyProblemsRes.data?.data),
			"GET /api/v1/problem/company-problems",
		);

		// 3.5 Get Single Problem
		const singleProblemRes = await request(
			baseUrl,
			`/api/v1/problem/${mcqProblemId}`,
			{
				token: creatorToken,
			},
		);
		assert(
			singleProblemRes.status === 200 &&
				singleProblemRes.data?.data?.id === mcqProblemId,
			`GET /api/v1/problem/${mcqProblemId}`,
		);

		// 3.6 Update Problem
		const updateProblemRes = await request(
			baseUrl,
			`/api/v1/problem/${mcqProblemId}`,
			{
				method: "PATCH",
				token: creatorToken,
				body: {
					title: "Integration Test: TS Generics & Mapped Types (Updated)",
				},
			},
		);
		assert(
			updateProblemRes.status === 200 &&
				updateProblemRes.data?.data?.title.includes("(Updated)"),
			`PATCH /api/v1/problem/${mcqProblemId}`,
		);

		// =========================================================================
		// MODULE 4: ASSESSMENT CREATION & LIFECYCLE
		// =========================================================================
		console.log("\n📦 MODULE 4: Assessment Creation & Lifecycle");

		// 4.1 Create Assessment
		const createAssessmentRes = await request(
			baseUrl,
			"/api/v1/assessment/create-assessment",
			{
				method: "POST",
				token: creatorToken,
				body: {
					title: "Senior Backend Full-Stack Engineering Assessment",
					description:
						"Official technical assessment covering TypeScript, Postgres concurrency, and system security.",
					companyId: companyId,
					durationMinutes: 45,
					totalMarks: 15,
					passingScore: 8,
					status: "DRAFT",
					settings: {
						preventCopyPaste: true,
						requireFullscreen: true,
						maxAttempts: 2,
					},
				},
			},
		);
		assert(
			createAssessmentRes.status === 201 &&
				Boolean(createAssessmentRes.data?.data?.id),
			"POST /api/v1/assessment/create-assessment (Draft Assessment Created)",
			createAssessmentRes.data?.message,
		);
		createdAssessmentId = createAssessmentRes.data.data.id;

		// 4.2 Add Problems to Assessment
		const addProblemsRes = await request(
			baseUrl,
			`/api/v1/assessment/add-problems/${createdAssessmentId}`,
			{
				method: "POST",
				token: creatorToken,
				body: {
					problems: [
						{ problemId: mcqProblemId!, marks: 5, questionOrder: 1 },
						{ problemId: writtenProblemId!, marks: 10, questionOrder: 2 },
					],
				},
			},
		);
		assert(
			addProblemsRes.status === 200,
			`POST /api/v1/assessment/add-problems/${createdAssessmentId}`,
			addProblemsRes.data?.message,
		);

		// 4.3 Publish Assessment
		const publishAssessmentRes = await request(
			baseUrl,
			`/api/v1/assessment/publish-assessment/${createdAssessmentId}`,
			{
				method: "PATCH",
				token: creatorToken,
			},
		);
		assert(
			publishAssessmentRes.status === 200 &&
				(publishAssessmentRes.data?.data?.status ===
					AssessmentStatus.PUBLISHED ||
					publishAssessmentRes.data?.data?.status === AssessmentStatus.ACTIVE),
			`PATCH /api/v1/assessment/publish-assessment/${createdAssessmentId} (Published)`,
			publishAssessmentRes.data?.message,
		);

		// 4.4 Invite Candidate
		const inviteRes = await request(
			baseUrl,
			`/api/v1/assessment/invite-candidates/${createdAssessmentId}`,
			{
				method: "POST",
				token: recruiterToken,
				body: {
					email: config.candidate_email,
				},
			},
		);
		assert(
			inviteRes.status === 200 || inviteRes.status === 201,
			`POST /api/v1/assessment/invite-candidates/${createdAssessmentId}`,
			inviteRes.data?.message,
		);

		// 4.5 Get Invitations
		const getInvitesRes = await request(
			baseUrl,
			`/api/v1/assessment/${createdAssessmentId}/invitations`,
			{
				token: recruiterToken,
			},
		);
		assert(
			getInvitesRes.status === 200 && Array.isArray(getInvitesRes.data?.data),
			`GET /api/v1/assessment/${createdAssessmentId}/invitations`,
		);

		// 4.6 Candidate Starts Attempt
		const startAttemptRes = await request(
			baseUrl,
			`/api/v1/assessment/start-attempt/${createdAssessmentId}`,
			{
				method: "POST",
				token: candidateToken,
				body: {},
			},
		);
		const attemptId =
			startAttemptRes.data?.data?.attempt?.id || startAttemptRes.data?.data?.id;
		assert(
			(startAttemptRes.status === 201 || startAttemptRes.status === 200) &&
				Boolean(attemptId),
			`POST /api/v1/assessment/start-attempt/${createdAssessmentId} (Attempt Started)`,
			startAttemptRes.data?.message,
		);
		createdAttemptId = attemptId;

		// 4.7 Candidate Views Their Attempts
		const myAttemptsRes = await request(
			baseUrl,
			"/api/v1/assessment/my-attempts",
			{
				token: candidateToken,
			},
		);
		assert(
			myAttemptsRes.status === 200 && Array.isArray(myAttemptsRes.data?.data),
			"GET /api/v1/assessment/my-attempts",
		);

		// 4.8 Get Attempt Details
		const attemptDetailsRes = await request(
			baseUrl,
			`/api/v1/assessment/attempts/${createdAttemptId}`,
			{
				token: candidateToken,
			},
		);
		const returnedAttemptId =
			attemptDetailsRes.data?.data?.attempt?.id ||
			attemptDetailsRes.data?.data?.id;
		assert(
			attemptDetailsRes.status === 200 &&
				returnedAttemptId === createdAttemptId,
			`GET /api/v1/assessment/attempts/${createdAttemptId}`,
		);

		// =========================================================================
		// MODULE 5: SUBMISSIONS
		// =========================================================================
		console.log("\n📦 MODULE 5: Solution Submissions");

		// Fetch the correct MCQ option ID from problem details
		const mcqProblemDetails = await prisma.problem.findUnique({
			where: { id: mcqProblemId! },
			include: { mcqQuestion: { include: { options: true } } },
		});
		const correctOption = mcqProblemDetails?.mcqQuestion?.options.find(
			(o) => o.isCorrect,
		);
		const chosenOptionId = correctOption
			? correctOption.id
			: mcqProblemDetails?.mcqQuestion?.options[0]?.id;

		// 5.1 Submit MCQ Answer
		const submitMcqRes = await request(baseUrl, "/api/v1/submission/", {
			method: "POST",
			token: candidateToken,
			body: {
				attemptId: createdAttemptId,
				problemId: mcqProblemId,
				selectedOptionId: chosenOptionId,
			},
		});
		assert(
			(submitMcqRes.status === 201 || submitMcqRes.status === 200) &&
				Boolean(submitMcqRes.data?.data?.id),
			"POST /api/v1/submission/ (Submit MCQ Solution)",
			submitMcqRes.data?.message,
		);
		mcqSubmissionId = submitMcqRes.data.data.id;

		// 5.2 Submit Written Answer
		const submitWrittenRes = await request(baseUrl, "/api/v1/submission/", {
			method: "POST",
			token: candidateToken,
			body: {
				attemptId: createdAttemptId,
				problemId: writtenProblemId,
				answerText:
					"MVCC uses snapshot isolation by assigning unique transaction IDs (xmin, xmax) to each tuple version. Readers read the version committed before their snapshot timestamp, so writers writing new versions never block concurrent readers.",
			},
		});
		assert(
			(submitWrittenRes.status === 201 || submitWrittenRes.status === 200) &&
				Boolean(submitWrittenRes.data?.data?.id),
			"POST /api/v1/submission/ (Submit Written Solution)",
			submitWrittenRes.data?.message,
		);
		writtenSubmissionId = submitWrittenRes.data.data.id;

		// 5.3 Query Attempt Submissions
		const attemptSubmissionsRes = await request(
			baseUrl,
			`/api/v1/submission/attempts/${createdAttemptId}`,
			{
				token: candidateToken,
			},
		);
		assert(
			attemptSubmissionsRes.status === 200 &&
				Array.isArray(attemptSubmissionsRes.data?.data),
			`GET /api/v1/submission/attempts/${createdAttemptId} (Found ${attemptSubmissionsRes.data?.data?.length} answers)`,
		);

		// 5.4 Candidate Self-Service Submissions
		const mySubmissionsRes = await request(
			baseUrl,
			"/api/v1/submission/my-submissions",
			{
				token: candidateToken,
			},
		);
		assert(
			mySubmissionsRes.status === 200 &&
				Array.isArray(mySubmissionsRes.data?.data),
			"GET /api/v1/submission/my-submissions",
		);

		// 5.5 Finalize / Submit Submission
		const finalizeRes = await request(
			baseUrl,
			`/api/v1/submission/${mcqSubmissionId}/submit`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					submissionId: mcqSubmissionId,
				},
			},
		);
		assert(
			finalizeRes.status === 200,
			`POST /api/v1/submission/${mcqSubmissionId}/submit`,
			finalizeRes.data?.message,
		);

		// =========================================================================
		// MODULE 6: ANTI-CHEATING SECURITY SUITE
		// =========================================================================
		console.log("\n📦 MODULE 6: Anti-Cheating Telemetry & Risk Scoring");

		// 6.1 Record Tab Switch
		const tabSwitchRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/tab-switch`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					durationSeconds: 15,
					count: 1,
					userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
				},
			},
		);
		assert(
			tabSwitchRes.status === 201 &&
				tabSwitchRes.data?.data?.type === AntiCheatEventType.TAB_SWITCH,
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/tab-switch`,
			tabSwitchRes.data?.message,
		);

		// 6.2 Record Clipboard Copy-Paste Violation
		const copyPasteRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/copy-paste`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					operation: "PASTE",
					textLength: 450,
					textPreview: "SELECT * FROM users WHERE 1=1...",
					targetElement: "textarea#code-editor",
				},
			},
		);
		assert(
			copyPasteRes.status === 201 &&
				copyPasteRes.data?.data?.type === AntiCheatEventType.PASTE,
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/copy-paste`,
			copyPasteRes.data?.message,
		);

		// 6.3 Record Fullscreen Departure Violation
		const fullscreenExitRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/fullscreen-exit`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					durationOutsideSeconds: 22,
					screenResolution: "1920x1080",
					reason: "Window focus change",
				},
			},
		);
		assert(
			fullscreenExitRes.status === 201 &&
				fullscreenExitRes.data?.data?.type ===
					AntiCheatEventType.FULLSCREEN_EXIT,
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/fullscreen-exit`,
			fullscreenExitRes.data?.message,
		);

		// 6.4 Record Multiple Tabs Anomaly
		const multiTabsRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/multiple-tabs`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					activeTabCount: 3,
					details: "Concurrent browser session heartbeat collision",
				},
			},
		);
		assert(
			multiTabsRes.status === 201 &&
				multiTabsRes.data?.data?.type === AntiCheatEventType.MULTIPLE_TAB,
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/multiple-tabs`,
			multiTabsRes.data?.message,
		);

		// 6.5 Record Suspicious Activity
		const suspiciousRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/suspicious-activity`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					anomalyType: "DEVTOOLS_INSPECT_OPEN",
					details: "Browser developer tools opened during active exam session",
				},
			},
		);
		assert(
			suspiciousRes.status === 201 && Boolean(suspiciousRes.data?.data?.id),
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/suspicious-activity`,
			suspiciousRes.data?.message,
		);

		// 6.6 Calculate Cheating Risk
		const riskRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/risk`,
			{
				token: recruiterToken,
			},
		);
		assert(
			riskRes.status === 200 &&
				typeof riskRes.data?.data?.riskScore === "number" &&
				riskRes.data?.data?.totalEvents >= 5,
			`GET /api/v1/anti-cheating/attempt/${createdAttemptId}/risk (Risk Score: ${riskRes.data?.data?.riskScore}, Level: ${riskRes.data?.data?.riskLevel})`,
			riskRes.data?.message,
		);

		// 6.7 Proctor / Admin Flags Attempt
		const flagRes = await request(
			baseUrl,
			`/api/v1/anti-cheating/attempt/${createdAttemptId}/flag`,
			{
				method: "POST",
				token: recruiterToken,
				body: {
					reason:
						"Multiple clipboard pastes and fullscreen departures detected during exam session",
					severity: "HIGH",
					disqualify: false,
					notes: "Flagged for manual senior proctor audit review.",
				},
			},
		);
		assert(
			flagRes.status === 200 && flagRes.data?.data?.isFlagged === true,
			`POST /api/v1/anti-cheating/attempt/${createdAttemptId}/flag`,
			flagRes.data?.message,
		);

		// =========================================================================
		// MODULE 7: EVALUATION ENGINE
		// =========================================================================
		console.log("\n📦 MODULE 7: Automated & Manual Evaluation Engine");

		// 7.1 Automated MCQ Evaluation
		const evalMcqRes = await request(
			baseUrl,
			`/api/v1/evaluation/mcq/${mcqSubmissionId}`,
			{
				method: "POST",
				token: evaluatorToken,
			},
		);
		assert(
			evalMcqRes.status === 200 &&
				(evalMcqRes.data?.data?.earnedMarks !== undefined ||
					evalMcqRes.data?.data?.score !== undefined),
			`POST /api/v1/evaluation/mcq/${mcqSubmissionId}`,
			evalMcqRes.data?.message,
		);
		const evaluationId =
			evalMcqRes.data?.data?.evaluationId || evalMcqRes.data?.data?.id;

		// 7.2 Manual / Written Evaluation (Evaluator assigns marks)
		const evalWrittenRes = await request(
			baseUrl,
			`/api/v1/evaluation/manual/${writtenSubmissionId}`,
			{
				method: "POST",
				token: evaluatorToken,
				body: {
					marks: 9,
					feedback:
						"Excellent explanation of Postgres MVCC tuple versioning and lock-free concurrency.",
				},
			},
		);
		assert(
			evalWrittenRes.status === 200 &&
				(evalWrittenRes.data?.data?.marks === 9 ||
					evalWrittenRes.data?.data?.score === 9),
			`POST /api/v1/evaluation/manual/${writtenSubmissionId}`,
			evalWrittenRes.data?.message,
		);

		// 7.3 Attempt Score Calculation & Aggregation
		const evalAttemptScoreRes = await request(
			baseUrl,
			`/api/v1/evaluation/attempt/${createdAttemptId}/score`,
			{
				method: "POST",
				token: evaluatorToken,
			},
		);
		assert(
			evalAttemptScoreRes.status === 200 &&
				(evalAttemptScoreRes.data?.data?.obtainedMarks >= 9 ||
					evalAttemptScoreRes.data?.data?.totalScore >= 9),
			`POST /api/v1/evaluation/attempt/${createdAttemptId}/score`,
			evalAttemptScoreRes.data?.message,
		);

		// 7.4 Query All Evaluations
		const allEvaluationsRes = await request(baseUrl, "/api/v1/evaluation/", {
			token: evaluatorToken,
		});
		assert(
			allEvaluationsRes.status === 200 &&
				Array.isArray(allEvaluationsRes.data?.data),
			"GET /api/v1/evaluation/ (Paginated Evaluation Records)",
		);

		// 7.5 Query Single Evaluation
		if (evaluationId) {
			const singleEvalRes = await request(
				baseUrl,
				`/api/v1/evaluation/${evaluationId}`,
				{
					token: evaluatorToken,
				},
			);
			assert(
				singleEvalRes.status === 200 &&
					singleEvalRes.data?.data?.id === evaluationId,
				`GET /api/v1/evaluation/${evaluationId}`,
			);
		}

		// =========================================================================
		// MODULE 8: SCORE CALCULATION & BREAKDOWN
		// =========================================================================
		console.log("\n📦 MODULE 8: Score Calculation & Granular Breakdown");

		// 8.1 Unified Submission Score Calculation
		const calcSubRes = await request(
			baseUrl,
			`/api/v1/score-calculation/submission/${mcqSubmissionId}`,
			{
				token: evaluatorToken,
			},
		);
		assert(
			calcSubRes.status === 200 &&
				calcSubRes.data?.data?.obtainedMarks !== undefined,
			`GET /api/v1/score-calculation/submission/${mcqSubmissionId}`,
			calcSubRes.data?.message,
		);

		// 8.2 Granular MCQ Breakdown
		const calcMcqRes = await request(
			baseUrl,
			`/api/v1/score-calculation/mcq/${mcqSubmissionId}/score`,
			{
				token: evaluatorToken,
			},
		);
		assert(
			calcMcqRes.status === 200 &&
				(calcMcqRes.data?.data?.totalMarks !== undefined ||
					calcMcqRes.data?.data?.questionMarks !== undefined),
			`GET /api/v1/score-calculation/mcq/${mcqSubmissionId}/score`,
			calcMcqRes.data?.message,
		);

		// 8.3 Granular Written Breakdown
		const calcWrittenRes = await request(
			baseUrl,
			`/api/v1/score-calculation/written/${writtenSubmissionId}/score`,
			{
				token: evaluatorToken,
			},
		);
		assert(
			calcWrittenRes.status === 200 &&
				(calcWrittenRes.data?.data?.earnedMarks === 9 ||
					calcWrittenRes.data?.data?.obtainedMarks === 9),
			`GET /api/v1/score-calculation/written/${writtenSubmissionId}/score`,
			calcWrittenRes.data?.message,
		);

		// 8.4 Attempt Score Calculation Summary
		const calcAttemptRes = await request(
			baseUrl,
			`/api/v1/score-calculation/attempt/${createdAttemptId}`,
			{
				token: evaluatorToken,
			},
		);
		assert(
			calcAttemptRes.status === 200 &&
				calcAttemptRes.data?.data?.totalMarks !== undefined,
			`GET /api/v1/score-calculation/attempt/${createdAttemptId}`,
			calcAttemptRes.data?.message,
		);

		// =========================================================================
		// MODULE 9: ATTEMPT FINALIZATION & RESULTS PREVIEW
		// =========================================================================
		console.log("\n📦 MODULE 9: Attempt Submission & Results Preview");

		// 9.1 Candidate Submits & Finalizes Assessment Attempt
		const submitAttemptRes = await request(
			baseUrl,
			`/api/v1/assessment/attempts/${createdAttemptId}/submit`,
			{
				method: "POST",
				token: candidateToken,
				body: {
					answers: [],
				},
			},
		);
		assert(
			submitAttemptRes.status === 200 &&
				(submitAttemptRes.data?.data?.status === AttemptStatus.SUBMITTED ||
					submitAttemptRes.data?.data?.status === AttemptStatus.EVALUATED ||
					Boolean(submitAttemptRes.data?.data)),
			`POST /api/v1/assessment/attempts/${createdAttemptId}/submit (Attempt Completed)`,
			submitAttemptRes.data?.message,
		);

		// 9.2 Candidate Gets Attempt Result Preview
		const attemptResultRes = await request(
			baseUrl,
			`/api/v1/assessment/attempts/${createdAttemptId}/result`,
			{
				token: candidateToken,
			},
		);
		assert(
			attemptResultRes.status === 200 && Boolean(attemptResultRes.data?.data),
			`GET /api/v1/assessment/attempts/${createdAttemptId}/result`,
		);

		// 9.3 Detailed Result Report (Recruiter / Creator review)
		const detailedReportRes = await request(
			baseUrl,
			`/api/v1/assessment/attempts/${createdAttemptId}/detailed-report`,
			{
				token: recruiterToken,
			},
		);
		assert(
			detailedReportRes.status === 200 && Boolean(detailedReportRes.data?.data),
			`GET /api/v1/assessment/attempts/${createdAttemptId}/detailed-report`,
		);

		// =========================================================================
		// MODULE 10: RANKING & RESULT PUBLICATION
		// =========================================================================
		console.log("\n📦 MODULE 10: Ranking Engine & Result Publication");

		// 10.1 Generate Assessment Result for Attempt
		const genResultRes = await request(
			baseUrl,
			`/api/v1/ranking-result/generate/${createdAttemptId}`,
			{
				method: "POST",
				token: recruiterToken,
			},
		);
		assert(
			genResultRes.status === 200 &&
				(genResultRes.data?.data?.status !== undefined ||
					genResultRes.data?.data?.resultStatus !== undefined),
			`POST /api/v1/ranking-result/generate/${createdAttemptId}`,
			genResultRes.data?.message,
		);

		// 10.2 Calculate Candidate Rank & Percentile
		const rankRes = await request(
			baseUrl,
			`/api/v1/ranking-result/rank/${createdAttemptId}`,
			{
				token: recruiterToken,
			},
		);
		assert(
			rankRes.status === 200 && rankRes.data?.data?.rank !== undefined,
			`GET /api/v1/ranking-result/rank/${createdAttemptId} (Rank: #${rankRes.data?.data?.rank}, Percentile: ${rankRes.data?.data?.percentile}%)`,
			rankRes.data?.message,
		);

		// 10.3 Assessment Leaderboard
		const leaderboardRes = await request(
			baseUrl,
			`/api/v1/ranking-result/leaderboard/${createdAssessmentId}`,
			{
				token: recruiterToken,
			},
		);
		assert(
			leaderboardRes.status === 200 &&
				(Array.isArray(leaderboardRes.data?.data?.rankings) ||
					Array.isArray(leaderboardRes.data?.data?.leaderboard)),
			`GET /api/v1/ranking-result/leaderboard/${createdAssessmentId}`,
			leaderboardRes.data?.message,
		);

		// 10.4 Publish Official Assessment Results
		const publishRes = await request(
			baseUrl,
			`/api/v1/ranking-result/publish/${createdAssessmentId}`,
			{
				method: "POST",
				token: recruiterToken,
				body: {
					publishAll: true,
					recalculateRanks: true,
				},
			},
		);
		assert(
			publishRes.status === 200 &&
				Boolean(publishRes.data?.data?.publishedAt !== undefined),
			`POST /api/v1/ranking-result/publish/${createdAssessmentId}`,
			publishRes.data?.message,
		);

		// 10.5 Candidate Views My Official Results
		const myResultsRes = await request(
			baseUrl,
			"/api/v1/ranking-result/my-results",
			{
				token: candidateToken,
			},
		);
		assert(
			myResultsRes.status === 200 && Array.isArray(myResultsRes.data?.data),
			"GET /api/v1/ranking-result/my-results",
			myResultsRes.data?.message,
		);

		// 10.6 Candidate Result Verification
		const candidateResultRes = await request(
			baseUrl,
			`/api/v1/ranking-result/attempt/${createdAttemptId}`,
			{
				token: candidateToken,
			},
		);
		assert(
			candidateResultRes.status === 200 &&
				(candidateResultRes.data?.data?.status !== undefined ||
					candidateResultRes.data?.data?.obtainedMarks !== undefined ||
					Boolean(candidateResultRes.data?.data)),
			`GET /api/v1/ranking-result/attempt/${createdAttemptId}`,
			candidateResultRes.data?.message,
		);

		// =========================================================================
		// MODULE 11: REPORTS & ANALYTICS
		// =========================================================================
		console.log("\n📦 MODULE 11: Reports & Analytics Intelligence");

		// 11.1 Assessment Comprehensive Analytics Report
		const assessmentReportRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/assessment/${createdAssessmentId}/report`,
			{
				token: recruiterToken,
			},
		);
		assert(
			assessmentReportRes.status === 200 &&
				assessmentReportRes.data?.data?.assessmentId === createdAssessmentId,
			`GET /api/v1/reports-analytics/assessment/${createdAssessmentId}/report`,
			assessmentReportRes.data?.message,
		);

		// 11.2 Score Distribution & Standard Deviation
		const scoreDistRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/assessment/${createdAssessmentId}/score-distribution`,
			{
				token: recruiterToken,
			},
		);
		assert(
			scoreDistRes.status === 200 &&
				(scoreDistRes.data?.data?.mean !== undefined ||
					scoreDistRes.data?.data?.buckets !== undefined),
			`GET /api/v1/reports-analytics/assessment/${createdAssessmentId}/score-distribution`,
			scoreDistRes.data?.message,
		);

		// 11.3 Pass / Fail Statistics
		const passFailRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/assessment/${createdAssessmentId}/pass-fail`,
			{
				token: recruiterToken,
			},
		);
		assert(
			passFailRes.status === 200 &&
				(passFailRes.data?.data?.passRate !== undefined ||
					passFailRes.data?.data?.totalEvaluated !== undefined),
			`GET /api/v1/reports-analytics/assessment/${createdAssessmentId}/pass-fail`,
			passFailRes.data?.message,
		);

		// 11.4 Assessment Statistics & Problem Difficulty Metrics
		const assessmentStatsRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/assessment/${createdAssessmentId}/statistics`,
			{
				token: recruiterToken,
			},
		);
		assert(
			assessmentStatsRes.status === 200 &&
				(assessmentStatsRes.data?.data?.attemptsByStatus !== undefined ||
					assessmentStatsRes.data?.data?.difficultyDistribution !== undefined),
			`GET /api/v1/reports-analytics/assessment/${createdAssessmentId}/statistics`,
			assessmentStatsRes.data?.message,
		);

		// 11.5 Candidate Performance Benchmark
		const perfBenchRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/attempt/${createdAttemptId}/performance`,
			{
				token: recruiterToken,
			},
		);
		assert(
			perfBenchRes.status === 200 &&
				(perfBenchRes.data?.data?.cohortBenchmark !== undefined ||
					perfBenchRes.data?.data?.benchmark !== undefined),
			`GET /api/v1/reports-analytics/attempt/${createdAttemptId}/performance`,
			perfBenchRes.data?.message,
		);

		// 11.6 Candidate Career & Multi-Assessment Report
		const candidateReportRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/candidate/${testCandidateId}/report`,
			{
				token: recruiterToken,
			},
		);
		assert(
			candidateReportRes.status === 200 &&
				candidateReportRes.data?.data?.candidateId === testCandidateId,
			`GET /api/v1/reports-analytics/candidate/${testCandidateId}/report`,
			candidateReportRes.data?.message,
		);

		// 11.7 Company Recruitment Intelligence Report
		const companyReportRes = await request(
			baseUrl,
			`/api/v1/reports-analytics/company/${companyId}/report`,
			{
				token: recruiterToken,
			},
		);
		assert(
			companyReportRes.status === 200 &&
				companyReportRes.data?.data?.companyId === companyId,
			`GET /api/v1/reports-analytics/company/${companyId}/report`,
			companyReportRes.data?.message,
		);

		// =========================================================================
		// MODULE 12: ADMIN MANAGEMENT & PLATFORM TELEMETRY
		// =========================================================================
		console.log("\n📦 MODULE 12: Platform Admin Management & Telemetry");

		// 12.1 Dashboard Overview Statistics
		const dashStatsRes = await request(
			baseUrl,
			"/api/v1/admin-management/dashboard-statistics",
			{
				token: testerAdminToken,
			},
		);
		assert(
			dashStatsRes.status === 200 &&
				dashStatsRes.data?.data?.users !== undefined,
			"GET /api/v1/admin-management/dashboard-statistics",
			dashStatsRes.data?.message,
		);

		// 12.2 System & Infrastructure Telemetry
		const systemStatsRes = await request(
			baseUrl,
			"/api/v1/admin-management/system-statistics",
			{
				token: testerAdminToken,
			},
		);
		assert(
			systemStatsRes.status === 200 &&
				systemStatsRes.data?.data?.databaseCounts?.users !== undefined &&
				systemStatsRes.data?.data?.processMemory?.heapUsedMb !== undefined,
			"GET /api/v1/admin-management/system-statistics (Telemetry Live)",
			systemStatsRes.data?.message,
		);

		// 12.3 Users Management Listing
		const usersListRes = await request(
			baseUrl,
			"/api/v1/admin-management/users",
			{
				token: testerAdminToken,
			},
		);
		assert(
			usersListRes.status === 200 && Array.isArray(usersListRes.data?.data),
			"GET /api/v1/admin-management/users",
		);

		// 12.4 User Details by ID
		const userDetailsRes = await request(
			baseUrl,
			`/api/v1/admin-management/users/${testCandidateId}`,
			{
				token: testerAdminToken,
			},
		);
		assert(
			userDetailsRes.status === 200 &&
				userDetailsRes.data?.data?.id === testCandidateId,
			`GET /api/v1/admin-management/users/${testCandidateId}`,
		);

		// 12.5 Companies Management Listing
		const adminCompaniesRes = await request(
			baseUrl,
			"/api/v1/admin-management/companies",
			{
				token: testerAdminToken,
			},
		);
		assert(
			adminCompaniesRes.status === 200 &&
				Array.isArray(adminCompaniesRes.data?.data),
			"GET /api/v1/admin-management/companies",
		);

		// 12.6 Assessments Management Listing
		const adminAssessmentsRes = await request(
			baseUrl,
			"/api/v1/admin-management/assessments",
			{
				token: testerAdminToken,
			},
		);
		assert(
			adminAssessmentsRes.status === 200 &&
				Array.isArray(adminAssessmentsRes.data?.data),
			"GET /api/v1/admin-management/assessments",
		);

		// 12.7 Submissions Management Listing
		const adminSubmissionsRes = await request(
			baseUrl,
			"/api/v1/admin-management/submissions",
			{
				token: testerAdminToken,
			},
		);
		assert(
			adminSubmissionsRes.status === 200 &&
				Array.isArray(adminSubmissionsRes.data?.data),
			"GET /api/v1/admin-management/submissions",
		);

		// =========================================================================
		// MODULE 13: RBAC & SECURITY EDGE CASES
		// =========================================================================
		console.log("\n📦 MODULE 13: RBAC & Security Boundary Tests");

		// 13.1 Unauthenticated Request Blocked
		const unauthRes = await request(baseUrl, "/api/v1/auth/me");
		assert(
			unauthRes.status === 401,
			"GET /api/v1/auth/me without token returns 401 Unauthorized",
		);

		// 13.2 Candidate blocked from Admin Endpoint
		const forbiddenRes = await request(
			baseUrl,
			"/api/v1/admin-management/dashboard-statistics",
			{
				token: candidateToken,
			},
		);
		assert(
			forbiddenRes.status === 403,
			"Candidate accessing /admin-management/dashboard-statistics returns 403 Forbidden",
		);

		console.log(
			"\n🎉 ALL ENDPOINTS & MODULE CHECKS PASSED EXECUTION SUCCESSFULLY!",
		);
	} catch (error) {
		console.error("\n💥 INTEGRATION TEST RUN ENCOUNTERED AN ERROR:", error);
		throw error;
	} finally {
		console.log("\n🧹 RUNNING CLEANUP TEARDOWN PHASE...");

		// Clean up created entities in reverse foreign key order
		try {
			if (createdAssessmentId) {
				console.log(`  Deleting Assessment: ${createdAssessmentId}`);
				await prisma.assessment.deleteMany({
					where: { id: createdAssessmentId },
				});
			}

			if (createdProblemIds.length > 0) {
				console.log(
					`  Deleting Test Problems: ${createdProblemIds.join(", ")}`,
				);
				await prisma.problem.deleteMany({
					where: { id: { in: createdProblemIds } },
				});
			}

			console.log("  ✅ Cleanup completed successfully.");
		} catch (cleanupErr) {
			console.error("  ⚠️ Error during cleanup:", cleanupErr);
		}

		server.close(() => {
			console.log("🛑 Test server closed.");
		});

		console.log("\n=================================================");
		console.log("📊 INTEGRATION TEST SUITE SUMMARY");
		console.log("=================================================");
		console.log(`Total Assertions Passed: ${testsPassed}`);
		console.log(`Total Assertions Failed: ${testsFailed}`);
		console.log("=================================================");

		if (testsFailed > 0) {
			process.exit(1);
		} else {
			process.exit(0);
		}
	}
}

runFullIntegrationTest().catch((err) => {
	console.error("Fatal error running integration test:", err);
	process.exit(1);
});
