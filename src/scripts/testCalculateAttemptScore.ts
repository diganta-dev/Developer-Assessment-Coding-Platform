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
	ProblemType,
	ResultStatus,
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

async function runCalculateAttemptScoreTestSuite() {
	console.log("==================================================");
	console.log("    CALCULATE ATTEMPT SCORE LOGIC & ROUTE TESTS   ");
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
	let evalBaseUrl: string;
	let assessmentBaseUrl: string;

	try {
		// 1. Start test server on random port
		const createdServer = http.createServer(app);
		server = createdServer;
		await new Promise<void>((resolve) => createdServer.listen(0, resolve));
		const addr = createdServer.address();
		const port = typeof addr === "object" && addr ? addr.port : 0;
		evalBaseUrl = `http://localhost:${port}/api/v1/evaluation`;
		assessmentBaseUrl = `http://localhost:${port}/api/v1/assessment`;
		console.log(`\nTest server listening on port ${port}\n`);

		// 2. Seed test fixtures
		const hashedPassword = await bcrypt.hash("Password123!", 10);
		const timestamp = Date.now();

		const company = await prisma.company.create({
			data: {
				name: `Scoring Corp ${timestamp}`,
				slug: `scoring-corp-${timestamp}`,
				email: `scoring_${timestamp}@company.com`,
			},
		});
		cleanupIds.companyIds.push(company.id);

		const otherCompany = await prisma.company.create({
			data: {
				name: `Other Corp ${timestamp}`,
				slug: `other-corp-${timestamp}`,
				email: `othercorp_${timestamp}@company.com`,
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
				role: UserRole.CANDIDATE,
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.EVALUATOR,
					},
				},
			},
		});
		cleanupIds.userIds.push(companyEvaluator.id);

		const candidate = await prisma.user.create({
			data: {
				name: "Candidate One",
				email: `candidate1_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
			},
		});
		cleanupIds.userIds.push(candidate.id);

		const intruderCandidate = await prisma.user.create({
			data: {
				name: "Intruder Candidate",
				email: `intruder_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
			},
		});
		cleanupIds.userIds.push(intruderCandidate.id);

		const otherCompanyMember = await prisma.user.create({
			data: {
				name: "Other Company Member",
				email: `other_member_${timestamp}@example.com`,
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

		// Tokens
		const adminToken = jwtUtils.createToken(
			{ userId: admin.id, email: admin.email, role: admin.role },
			config.jwt_access_secret,
			"1h" as unknown as never,
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
			"1h" as unknown as never,
		);
		const candidateToken = jwtUtils.createToken(
			{ userId: candidate.id, email: candidate.email, role: candidate.role },
			config.jwt_access_secret,
			"1h" as unknown as never,
		);
		const intruderToken = jwtUtils.createToken(
			{
				userId: intruderCandidate.id,
				email: intruderCandidate.email,
				role: intruderCandidate.role,
			},
			config.jwt_access_secret,
			"1h" as unknown as never,
		);
		const otherMemberToken = jwtUtils.createToken(
			{
				userId: otherCompanyMember.id,
				email: otherCompanyMember.email,
				role: otherCompanyMember.role,
				companyId: otherCompany.id,
				companyRole: CompanyMemberRole.EVALUATOR,
			},
			config.jwt_access_secret,
			"1h" as unknown as never,
		);

		// 3. Create Assessment with passingScore = 20, totalMarks = 30
		const assessment = await prisma.assessment.create({
			data: {
				title: "Fullstack Developer Assessment",
				description: "Comprehensive multi-type assessment",
				creatorId: admin.id,
				companyId: company.id,
				durationMinutes: 90,
				totalMarks: 30,
				passingScore: 20,
			},
		});
		cleanupIds.assessmentIds.push(assessment.id);

		// 4. Create 3 Problems: MCQ (5m), Written (10m), Coding (15m)
		const mcqProblem = await prisma.problem.create({
			data: {
				title: "Event Loop Question",
				description: "What phase runs setImmediate callbacks?",
				type: ProblemType.MCQ,
				difficulty: Difficulty.MEDIUM,
				marks: 5,
				createdById: admin.id,
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						marks: 5,
						questionOrder: 1,
					},
				},
			},
		});
		cleanupIds.problemIds.push(mcqProblem.id);

		const writtenProblem = await prisma.problem.create({
			data: {
				title: "Explain Database Sharding",
				description:
					"Explain horizontal partitioning strategies and tradeoffs.",
				type: ProblemType.WRITTEN,
				difficulty: Difficulty.HARD,
				marks: 10,
				createdById: admin.id,
				writtenQuestion: {
					create: {
						wordLimit: 100,
						expectedAnswer:
							"Sharding partitions databases by shard key to scale write throughput.",
					},
				},
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						marks: 10,
						questionOrder: 2,
					},
				},
			},
		});
		cleanupIds.problemIds.push(writtenProblem.id);

		const codingProblem = await prisma.problem.create({
			data: {
				title: "Two Sum Algorithm",
				description: "Find two indices that sum up to the target value.",
				type: ProblemType.CODING,
				difficulty: Difficulty.MEDIUM,
				marks: 15,
				createdById: admin.id,
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						marks: 15,
						questionOrder: 3,
					},
				},
			},
		});
		cleanupIds.problemIds.push(codingProblem.id);

		// 5. Create Assessment Attempt
		const attempt = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				status: AttemptStatus.SUBMITTED,
				attemptNumber: 1,
				startedAt: new Date(Date.now() - 3600 * 1000),
				submittedAt: new Date(),
			},
		});
		cleanupIds.attemptIds.push(attempt.id);

		// Helper fetch function
		const makeRequest = async (
			url: string,
			method: string,
			token?: string,
			body?: unknown,
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

		// ─── Test 1: Unauthorized candidate forbidden from calculating attempt ─
		console.log("\n[Test 1] Intruder candidate receives 403 Forbidden");
		const res1 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
			intruderToken,
		);
		assert(
			res1.status === 403,
			"Intruder candidate receives 403 Forbidden when calculating another attempt's score",
		);

		// ─── Test 2: Unrelated company member forbidden ───────────────────────
		console.log("\n[Test 2] Outside company evaluator receives 403 Forbidden");
		const res2 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
			otherMemberToken,
		);
		assert(
			res2.status === 403,
			"Outside company evaluator receives 403 Forbidden",
		);

		// ─── Test 3: Unauthenticated request receives 401 Unauthorized ────────
		console.log("\n[Test 3] Unauthenticated request receives 401 Unauthorized");
		const res3 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
		);
		assert(
			res3.status === 401,
			"Unauthenticated request receives 401 Unauthorized",
		);

		// ─── Test 4: Score with no submissions (initial state) ────────────────
		console.log("\n[Test 4] Calculate attempt score with no submissions");
		const res4 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
			candidateToken,
		);
		assert(
			res4.status === 200,
			"Candidate owner successfully accesses calculateAttemptScore (200 OK)",
		);
		assert(res4.data.success === true, "Response reports success = true");
		assert(
			res4.data.data.totalMarks === 30,
			"Total marks correctly sums to 30",
		);
		assert(
			res4.data.data.obtainedMarks === 0,
			"Obtained marks = 0 when no submissions are evaluated",
		);
		assert(res4.data.data.percentage === 0, "Percentage = 0%");
		assert(
			res4.data.data.isFullyEvaluated === false,
			"isFullyEvaluated = false",
		);
		assert(res4.data.data.evaluatedProblems === 0, "evaluatedProblems = 0");
		assert(res4.data.data.pendingProblems === 3, "pendingProblems = 3");
		assert(res4.data.data.isPassed === false, "isPassed = false");
		assert(
			res4.data.data.resultStatus === ResultStatus.FAILED,
			"resultStatus is FAILED (0 < 20 passingScore)",
		);

		// ─── Test 5: Partial evaluation (1 of 3 problems evaluated) ───────────
		console.log("\n[Test 5] Partial evaluation (MCQ evaluated with 5/5)");
		const subMcq = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: mcqProblem.id,
				marks: 5,
				isCorrect: true,
				status: SubmissionStatus.EVALUATED,
			},
		});
		cleanupIds.submissionIds.push(subMcq.id);

		const res5 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
			evaluatorToken,
		);
		assert(res5.status === 200, "Evaluator calculates score successfully");
		assert(res5.data.data.obtainedMarks === 5, "Obtained marks = 5");
		assert(
			res5.data.data.percentage === 16.67,
			"Percentage = 16.67% (5 / 30 * 100)",
		);
		assert(
			res5.data.data.isFullyEvaluated === false,
			"isFullyEvaluated remains false",
		);
		assert(res5.data.data.evaluatedProblems === 1, "evaluatedProblems = 1");
		assert(res5.data.data.pendingProblems === 2, "pendingProblems = 2");
		assert(
			res5.data.data.attemptStatus === AttemptStatus.SUBMITTED,
			"Attempt status remains SUBMITTED while grading is incomplete",
		);

		// ─── Test 6: Full evaluation (all 3 problems evaluated) ───────────────
		console.log(
			"\n[Test 6] Full evaluation: Written (8/10) and Coding (12/15) added",
		);
		const subWritten = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: writtenProblem.id,
				marks: 8,
				isCorrect: false,
				status: SubmissionStatus.EVALUATED,
			},
		});
		cleanupIds.submissionIds.push(subWritten.id);

		const subCoding = await prisma.submission.create({
			data: {
				attemptId: attempt.id,
				problemId: codingProblem.id,
				marks: 12,
				isCorrect: false,
				status: SubmissionStatus.EVALUATED,
			},
		});
		cleanupIds.submissionIds.push(subCoding.id);

		const res6 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"POST",
			adminToken,
		);
		assert(res6.status === 200, "Admin calculates score successfully");
		assert(
			res6.data.data.obtainedMarks === 25,
			"Obtained marks = 25 (5 + 8 + 12)",
		);
		assert(
			res6.data.data.percentage === 83.33,
			"Percentage = 83.33% (25 / 30 * 100)",
		);
		assert(
			res6.data.data.isFullyEvaluated === true,
			"isFullyEvaluated = true when all 3 problems are graded",
		);
		assert(res6.data.data.evaluatedProblems === 3, "evaluatedProblems = 3");
		assert(res6.data.data.pendingProblems === 0, "pendingProblems = 0");
		assert(
			res6.data.data.attemptStatus === AttemptStatus.EVALUATED,
			"Attempt status transitioned to EVALUATED",
		);
		assert(
			res6.data.data.isPassed === true,
			"isPassed = true (25 >= 20 passingScore)",
		);
		assert(
			res6.data.data.resultStatus === ResultStatus.PASSED,
			"resultStatus = PASSED",
		);
		assert(
			res6.data.data.breakdown.length === 3,
			"Breakdown contains exactly 3 problems",
		);

		// Verify database persistence
		const dbAttempt = await prisma.assessmentAttempt.findUnique({
			where: { id: attempt.id },
		});
		assert(
			dbAttempt?.status === AttemptStatus.EVALUATED,
			"Database attempt status is EVALUATED",
		);
		assert(dbAttempt?.obtainedMarks === 25, "Database obtainedMarks = 25");
		assert(dbAttempt?.percentage === 83.33, "Database percentage = 83.33");

		const dbResult = await prisma.result.findUnique({
			where: { attemptId: attempt.id },
		});
		assert(dbResult !== null, "Database Result record was upserted");
		assert(
			dbResult?.obtainedMarks === 25,
			"Database Result obtainedMarks = 25",
		);
		assert(
			dbResult?.status === ResultStatus.PASSED,
			"Database Result status is PASSED",
		);

		// ─── Test 7: GET endpoint on evaluation route ─────────────────────────
		console.log("\n[Test 7] GET /api/v1/evaluation/attempt/:id/score");
		const res7 = await makeRequest(
			`${evalBaseUrl}/attempt/${attempt.id}/score`,
			"GET",
			candidateToken,
		);
		assert(res7.status === 200, "GET request returns 200 OK");
		assert(
			res7.data.data.obtainedMarks === 25,
			"GET request returns accurate obtainedMarks (25)",
		);

		// ─── Test 8: Assessment route alias POST /api/v1/assessment/attempts/:id/calculate-score
		console.log(
			"\n[Test 8] POST /api/v1/assessment/attempts/:id/calculate-score alias",
		);
		const res8 = await makeRequest(
			`${assessmentBaseUrl}/attempts/${attempt.id}/calculate-score`,
			"POST",
			candidateToken,
		);
		assert(
			res8.status === 200,
			"Assessment module calculate-score route returns 200 OK",
		);
		assert(
			res8.data.data.percentage === 83.33,
			"Assessment route returns identical calculated percentage",
		);

		console.log("\n==================================================");
		console.log("    ALL CALCULATE ATTEMPT SCORE TESTS PASSED!     ");
		console.log("==================================================");
	} finally {
		console.log("\nCleaning up test records...");
		try {
			if (cleanupIds.attemptIds.length > 0) {
				await prisma.result.deleteMany({
					where: { attemptId: { in: cleanupIds.attemptIds } },
				});
			}
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

runCalculateAttemptScoreTestSuite()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("Test Suite Failed:", err);
		process.exit(1);
	});
