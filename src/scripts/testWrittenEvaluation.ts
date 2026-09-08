import http from "node:http";
import bcrypt from "bcryptjs";
import app from "../app";
import config from "../app/config";
import { prisma } from "../app/lib/prisma";
import { jwtUtils } from "../app/utils/jwt";
import {
	AttemptStatus,
	CompanyMemberRole,
	Difficulty,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../generated/prisma/enums";

function assert(condition: boolean, message: string) {
	if (!condition) {
		console.error(`  ❌ FAIL: ${message}`);
		throw new Error(message);
	}
	console.log(`  ✔ ${message}`);
}

async function runWrittenEvaluationTestSuite() {
	console.log("==================================================");
	console.log("    WRITTEN EVALUATION ROUTE & LOGIC TEST SUITE   ");
	console.log("==================================================");

	const cleanupIds: {
		userIds: string[];
		companyIds: string[];
		problemIds: string[];
		assessmentIds: string[];
		attemptIds: string[];
		submissionIds: string[];
	} = {
		userIds: [],
		companyIds: [],
		problemIds: [],
		assessmentIds: [],
		attemptIds: [],
		submissionIds: [],
	};

	let server: http.Server | undefined;
	let baseUrl: string;

	try {
		// 1. Start test server on random port
		const createdServer = http.createServer(app);
		server = createdServer;
		await new Promise<void>((resolve) => createdServer.listen(0, resolve));
		const addr = createdServer.address();
		const port = typeof addr === "object" && addr ? addr.port : 0;
		baseUrl = `http://localhost:${port}/api/v1/evaluation`;
		console.log(`\nTest server listening on port ${port}\n`);

		// 2. Seed test fixtures
		const hashedPassword = await bcrypt.hash("Password123!", 10);
		const timestamp = Date.now();

		const company = await prisma.company.create({
			data: {
				name: `Test Org ${timestamp}`,
				slug: `test-org-${timestamp}`,
				email: `org_${timestamp}@example.com`,
			},
		});
		cleanupIds.companyIds.push(company.id);

		const otherCompany = await prisma.company.create({
			data: {
				name: `Other Org ${timestamp}`,
				slug: `other-org-${timestamp}`,
				email: `otherorg_${timestamp}@example.com`,
			},
		});
		cleanupIds.companyIds.push(otherCompany.id);

		const admin = await prisma.user.create({
			data: {
				name: "Admin User",
				email: `admin_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.ADMIN,
			},
		});
		cleanupIds.userIds.push(admin.id);

		const companyEvaluator = await prisma.user.create({
			data: {
				name: "Company Evaluator",
				email: `evaluator_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.CANDIDATE, // Any base role, their company membership grants evaluation privileges
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.EVALUATOR,
					},
				},
			},
		});
		cleanupIds.userIds.push(companyEvaluator.id);

		const otherCompanyMember = await prisma.user.create({
			data: {
				name: "Other Evaluator",
				email: `othereval_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				companyMembers: {
					create: {
						companyId: otherCompany.id,
						role: CompanyMemberRole.EVALUATOR,
					},
				},
			},
		});
		cleanupIds.userIds.push(otherCompanyMember.id);

		const candidate = await prisma.user.create({
			data: {
				name: "Test Candidate",
				email: `candidate_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
			},
		});
		cleanupIds.userIds.push(candidate.id);

		// Tokens
		const adminToken = jwtUtils.createToken(
			{ userId: admin.id, email: admin.email, role: admin.role },
			config.jwt_access_secret,
			"1h" as any,
		);
		const evaluatorToken = jwtUtils.createToken(
			{
				userId: companyEvaluator.id,
				email: companyEvaluator.email,
				role: companyEvaluator.role,
				companyId: company.id,
				companyRole: CompanyMemberRole.EVALUATOR,
			},
			config.jwt_access_secret,
			"1h" as any,
		);
		const otherEvaluatorToken = jwtUtils.createToken(
			{
				userId: otherCompanyMember.id,
				email: otherCompanyMember.email,
				role: otherCompanyMember.role,
				companyId: otherCompany.id,
				companyRole: CompanyMemberRole.EVALUATOR,
			},
			config.jwt_access_secret,
			"1h" as any,
		);
		const candidateToken = jwtUtils.createToken(
			{ userId: candidate.id, email: candidate.email, role: candidate.role },
			config.jwt_access_secret,
			"1h" as any,
		);

		// Assessment
		const assessment = await prisma.assessment.create({
			data: {
				title: "Fullstack Written Assessment",
				description: "Testing candidate written explanations",
				creatorId: admin.id,
				companyId: company.id,
				durationMinutes: 60,
				totalMarks: 20,
				passingScore: 10,
			},
		});
		cleanupIds.assessmentIds.push(assessment.id);

		// Attempt
		const attempt = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				status: AttemptStatus.IN_PROGRESS,
				attemptNumber: 1,
			},
		});
		cleanupIds.attemptIds.push(attempt.id);

		// 3. Create WRITTEN Problem with word limit = 20, marks = 10
		const writtenProblem = await prisma.problem.create({
			data: {
				title: "Explain Database Indexing",
				description: "Explain how B-tree indexes work and their trade-offs.",
				type: ProblemType.WRITTEN,
				difficulty: Difficulty.MEDIUM,
				marks: 10,
				createdById: admin.id,
				writtenQuestion: {
					create: {
						wordLimit: 20,
						expectedAnswer:
							"B-tree index structures speed up lookup queries from O(N) to O(log N) at the cost of disk space and write latency.",
					},
				},
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						marks: 10,
						questionOrder: 1,
					},
				},
			},
		});
		cleanupIds.problemIds.push(writtenProblem.id);

		// 4. Create MCQ Problem to test type safety
		const mcqProblem = await prisma.problem.create({
			data: {
				title: "HTTP Status Code",
				description: "What does 404 stand for?",
				type: ProblemType.MCQ,
				difficulty: Difficulty.EASY,
				marks: 5,
				createdById: admin.id,
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						marks: 5,
						questionOrder: 2,
					},
				},
			},
		});
		cleanupIds.problemIds.push(mcqProblem.id);

		// Helper fetch function
		const makeRequest = async (
			url: string,
			method: string,
			token?: string,
			body?: any,
		) => {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};
			if (token) {
				headers.Authorization = `Bearer ${token}`;
			}
			const response = await fetch(url, {
				method,
				headers,
				body: body ? JSON.stringify(body) : undefined,
			});
			const json = await response.json().catch(() => ({}));
			return { status: response.status, data: json };
		};

		// ─── Test 1: Candidate forbidden from grading written submission ───────
		console.log(
			"\n[Test 1] Candidate forbidden from grading written submissions",
		);
		const sub1 = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: writtenProblem.id,
				answerText:
					"B-tree organizes sorted key-value pairs into balanced tree nodes allowing logarithmic searches.",
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(sub1.id);

		const res1 = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			candidateToken,
			{ marks: 8, feedback: "Good answer" },
		);
		assert(
			res1.status === 403,
			"Candidate receives 403 Forbidden when attempting to grade",
		);

		// ─── Test 2: Other company evaluator forbidden ─────────────────────────
		console.log("\n[Test 2] Unauthorized company evaluator forbidden");
		const res2 = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			otherEvaluatorToken,
			{ marks: 8, feedback: "Attempting unauthorized grade" },
		);
		assert(
			res2.status === 403,
			"Evaluator from outside company receives 403 Forbidden",
		);

		// ─── Test 3: Rejects evaluation on non-WRITTEN problems ─────────────────
		console.log("\n[Test 3] Rejects evaluation on non-WRITTEN problems");
		const mcqSub = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: mcqProblem.id,
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(mcqSub.id);

		const res3 = await makeRequest(
			`${baseUrl}/written/${mcqSub.id}`,
			"POST",
			evaluatorToken,
			{ marks: 5, feedback: "Trying to grade MCQ as written" },
		);
		assert(
			res3.status === 400,
			"Fails with 400 Bad Request when problem type is not WRITTEN",
		);
		assert(
			res3.data.message?.includes("Only WRITTEN problems can be evaluated"),
			"Error message clearly indicates problem type mismatch",
		);

		// ─── Test 4: Rejects negative marks or marks > maxMarks ────────────────
		console.log("\n[Test 4] Validates marks constraints");
		const res4Negative = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			evaluatorToken,
			{ marks: -2 },
		);
		assert(
			res4Negative.status === 400,
			"Rejects negative marks with 400 Bad Request",
		);

		const res4Exceed = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			evaluatorToken,
			{ marks: 15 }, // max is 10
		);
		assert(
			res4Exceed.status === 400,
			"Rejects marks exceeding problem maximum with 400 Bad Request",
		);

		// ─── Test 5: Full marks evaluation & correct status ───────────────────
		console.log("\n[Test 5] Full marks evaluation by company evaluator");
		const res5 = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			evaluatorToken,
			{ marks: 10, feedback: "Exemplary explanation of balanced index trees." },
		);
		assert(res5.status === 200, "Evaluator successfully grades with 200 OK");
		assert(res5.data.success === true, "Response returns success = true");
		assert(res5.data.data.earnedMarks === 10, "Earned marks = 10");
		assert(
			res5.data.data.isCorrect === true,
			"isCorrect = true for full marks",
		);
		assert(
			res5.data.data.status === SubmissionStatus.EVALUATED,
			"Submission status is EVALUATED",
		);
		assert(
			res5.data.data.evaluator.email === companyEvaluator.email,
			"Evaluator info correctly populated in response",
		);

		// Check database state
		const dbSub5 = await prisma.submission.findUnique({
			where: { id: sub1.id },
		});
		assert(dbSub5?.marks === 10, "Submission in DB has marks = 10");
		assert(dbSub5?.isCorrect === true, "Submission in DB has isCorrect = true");

		const dbEval5 = await prisma.evaluation.findFirst({
			where: { submissionId: sub1.id, type: EvaluationType.MANUAL },
		});
		assert(
			dbEval5?.status === EvaluationStatus.COMPLETED,
			"Evaluation record status is COMPLETED",
		);
		assert(
			dbEval5?.feedback === "Exemplary explanation of balanced index trees.",
			"Evaluation feedback correctly persisted in DB",
		);

		// ─── Test 6: Word count analytics within limit ────────────────────────
		console.log("\n[Test 6] Word count analytics (within limit)");
		// sub1 has 12 words, limit is 20
		assert(
			res5.data.data.wordCount === 12,
			"Word count accurately computed (12 words)",
		);
		assert(
			res5.data.data.wordLimit === 20,
			"Word limit correctly reflected (20 words)",
		);
		assert(
			res5.data.data.isWordLimitExceeded === false,
			"isWordLimitExceeded = false when word count <= word limit",
		);

		// ─── Test 7: Word count analytics exceeding limit ─────────────────────
		console.log("\n[Test 7] Word count analytics (exceeding limit)");
		const attempt2 = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				status: AttemptStatus.IN_PROGRESS,
				attemptNumber: 2,
			},
		});
		cleanupIds.attemptIds.push(attempt2.id);

		const subExceed = await prisma.submission.create({
			data: {
				attemptId: attempt2.id,
				problemId: writtenProblem.id,
				answerText:
					"One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three.",
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(subExceed.id);

		const res7 = await makeRequest(
			`${baseUrl}/written/${subExceed.id}`,
			"POST",
			adminToken,
			{
				marks: 7,
				feedback: "Good content but exceeded the strict 20 word limit.",
			},
		);
		assert(res7.status === 200, "Admin grades submission successfully");
		assert(res7.data.data.wordCount === 23, "Word count = 23");
		assert(
			res7.data.data.isWordLimitExceeded === true,
			"isWordLimitExceeded = true when word count exceeds limit",
		);
		assert(
			res7.data.data.isCorrect === false,
			"isCorrect = false for partial marks (7/10)",
		);

		// ─── Test 8: Empty / Blank answer handling ────────────────────────────
		console.log("\n[Test 8] Empty / Blank answer submission handling");
		const attempt3 = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				status: AttemptStatus.IN_PROGRESS,
				attemptNumber: 3,
			},
		});
		cleanupIds.attemptIds.push(attempt3.id);

		const subBlank = await prisma.submission.create({
			data: {
				attemptId: attempt3.id,
				problemId: writtenProblem.id,
				answerText: "   ",
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(subBlank.id);

		const res8 = await makeRequest(
			`${baseUrl}/written/${subBlank.id}`,
			"POST",
			evaluatorToken,
			{ marks: 0, feedback: "No answer provided." },
		);
		assert(res8.status === 200, "Grades blank submission with 200 OK");
		assert(res8.data.data.wordCount === 0, "Word count is 0 for blank answer");
		assert(
			res8.data.data.isWordLimitExceeded === false,
			"isWordLimitExceeded is false for blank answer",
		);
		assert(res8.data.data.earnedMarks === 0, "Earned marks = 0");

		// ─── Test 9: Re-evaluation Idempotency (Updating existing evaluation) ─
		console.log(
			"\n[Test 9] Re-evaluation idempotency (updates existing record)",
		);
		const res9 = await makeRequest(
			`${baseUrl}/written/${sub1.id}`,
			"POST",
			adminToken,
			{ marks: 9, feedback: "Updated review: Deducted 1 mark for clarity." },
		);
		assert(res9.status === 200, "Re-evaluation returns 200 OK");
		assert(res9.data.data.earnedMarks === 9, "Updated marks = 9");

		const totalEvalRecords = await prisma.evaluation.count({
			where: { submissionId: sub1.id, type: EvaluationType.MANUAL },
		});
		assert(
			totalEvalRecords === 1,
			"Only 1 MANUAL evaluation record exists in DB (idempotent upsert)",
		);

		console.log("\n==================================================");
		console.log("       ALL WRITTEN EVALUATION TESTS PASSED!       ");
		console.log("==================================================");
	} finally {
		// Clean up database records in reverse dependency order
		console.log("\nCleaning up test records...");
		try {
			if (cleanupIds.submissionIds.length > 0) {
				await prisma.evaluation.deleteMany({
					where: { submissionId: { in: cleanupIds.submissionIds } },
				});
				await prisma.submission.deleteMany({
					where: { id: { in: cleanupIds.submissionIds } },
				});
			}
			if (cleanupIds.attemptIds.length > 0) {
				await prisma.assessmentAttempt.deleteMany({
					where: { id: { in: cleanupIds.attemptIds } },
				});
			}
			if (cleanupIds.problemIds.length > 0) {
				await prisma.assessmentProblem.deleteMany({
					where: { problemId: { in: cleanupIds.problemIds } },
				});
				await prisma.writtenQuestion.deleteMany({
					where: { problemId: { in: cleanupIds.problemIds } },
				});
				await prisma.problem.deleteMany({
					where: { id: { in: cleanupIds.problemIds } },
				});
			}
			if (cleanupIds.assessmentIds.length > 0) {
				await prisma.assessment.deleteMany({
					where: { id: { in: cleanupIds.assessmentIds } },
				});
			}
			if (cleanupIds.userIds.length > 0) {
				await prisma.user.deleteMany({
					where: { id: { in: cleanupIds.userIds } },
				});
			}
			if (cleanupIds.companyIds.length > 0) {
				await prisma.company.deleteMany({
					where: { id: { in: cleanupIds.companyIds } },
				});
			}
			console.log("✔ Cleanup completed.");
		} catch (err) {
			console.error("Warning: Cleanup encountered an error:", err);
		}

		if (server) {
			server.close();
		}
	}
}

runWrittenEvaluationTestSuite()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("Test Suite Failed:", err);
		process.exit(1);
	});
