import http from "node:http";
import bcrypt from "bcryptjs";
import app from "../app";
import config from "../app/config";
import {
	AttemptStatus,
	Difficulty,
	EvaluationStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../generated/prisma/enums";
import { prisma } from "../app/lib/prisma";
import { jwtUtils } from "../app/utils/jwt";

function assert(condition: boolean, message: string) {
	if (!condition) {
		console.error(`  ❌ FAIL: ${message}`);
		throw new Error(message);
	}
	console.log(`  ✔ ${message}`);
}

async function runMCQEvaluationTestSuite() {
	console.log("==================================================");
	console.log("       MCQ EVALUATION ROUTE & LOGIC TEST SUITE    ");
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

	let server: http.Server;
	let baseUrl: string;

	try {
		// 1. Start test server on random port
		server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const port = (server.address() as any).port;
		baseUrl = `http://localhost:${port}/api/v1/evaluation`;
		console.log(`\nTest server listening on port ${port}\n`);

		// 2. Seed test fixtures
		const hashedPassword = await bcrypt.hash("Password123!", 10);
		const timestamp = Date.now();

		const admin = await prisma.user.create({
			data: {
				name: "Admin User",
				email: `admin_${timestamp}@example.com`,
				password: hashedPassword,
				role: UserRole.ADMIN,
			},
		});
		cleanupIds.userIds.push(admin.id);

		const candidate = await prisma.user.create({
			data: {
				name: "Test Candidate",
				email: `candidate_${timestamp}@example.com`,
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

		// Tokens
		const adminToken = jwtUtils.createToken(
			{ userId: admin.id, email: admin.email, role: admin.role },
			config.jwt_access_secret,
			"1h" as any,
		);
		const candidateToken = jwtUtils.createToken(
			{ userId: candidate.id, email: candidate.email, role: candidate.role },
			config.jwt_access_secret,
			"1h" as any,
		);
		const intruderToken = jwtUtils.createToken(
			{
				userId: intruderCandidate.id,
				email: intruderCandidate.email,
				role: intruderCandidate.role,
			},
			config.jwt_access_secret,
			"1h" as any,
		);

		// Isolated Company
		const company = await prisma.company.create({
			data: {
				name: `MCQ Test Corp ${timestamp}`,
				slug: `mcq-test-corp-${timestamp}`,
				email: `mcq_${timestamp}@company.com`,
			},
		});
		cleanupIds.companyIds.push(company.id);

		// Assessment
		const assessment = await prisma.assessment.create({
			data: {
				title: `MCQ Assessment ${timestamp}`,
				description: "MCQ evaluation verification",
				durationMinutes: 60,
				totalMarks: 20,
				passingScore: 10,
				creatorId: admin.id,
				companyId: company.id,
			},
		});
		cleanupIds.assessmentIds.push(assessment.id);

		// Problem 1: Valid MCQ (Correct answer scenario)
		const mcqProblem1 = await prisma.problem.create({
			data: {
				title: "What is Node.js?",
				description: "Choose the correct description of Node.js.",
				type: ProblemType.MCQ,
				difficulty: Difficulty.EASY,
				marks: 5,
				createdById: admin.id,
				mcqQuestion: {
					create: {
						explanation: "Node.js is an open-source JavaScript runtime environment built on V8.",
						options: {
							create: [
								{
									optionText: "A database engine",
									isCorrect: false,
									optionOrder: 1,
								},
								{
									optionText: "A JavaScript runtime built on Chrome's V8",
									isCorrect: true,
									optionOrder: 2,
								},
								{
									optionText: "A front-end CSS framework",
									isCorrect: false,
									optionOrder: 3,
								},
							],
						},
					},
				},
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						questionOrder: 1,
						marks: 5,
					},
				},
			},
			include: {
				mcqQuestion: {
					include: {
						options: true,
					},
				},
			},
		});
		cleanupIds.problemIds.push(mcqProblem1.id);

		// Problem 2: Valid MCQ (Incorrect answer scenario)
		const mcqProblem2 = await prisma.problem.create({
			data: {
				title: "What is TypeScript?",
				description: "Choose the correct description of TypeScript.",
				type: ProblemType.MCQ,
				difficulty: Difficulty.EASY,
				marks: 5,
				createdById: admin.id,
				mcqQuestion: {
					create: {
						explanation: "TypeScript is a typed superset of JavaScript.",
						options: {
							create: [
								{
									optionText: "A typed superset of JavaScript",
									isCorrect: true,
									optionOrder: 1,
								},
								{
									optionText: "A Python web framework",
									isCorrect: false,
									optionOrder: 2,
								},
							],
						},
					},
				},
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						questionOrder: 2,
						marks: 5,
					},
				},
			},
			include: {
				mcqQuestion: {
					include: {
						options: true,
					},
				},
			},
		});
		cleanupIds.problemIds.push(mcqProblem2.id);

		// Problem 3: Valid MCQ (Unanswered / blank scenario)
		const mcqProblem3 = await prisma.problem.create({
			data: {
				title: "What is PostgreSQL?",
				description: "Choose the correct description of PostgreSQL.",
				type: ProblemType.MCQ,
				difficulty: Difficulty.EASY,
				marks: 5,
				createdById: admin.id,
				mcqQuestion: {
					create: {
						explanation: "PostgreSQL is a powerful object-relational database system.",
						options: {
							create: [
								{
									optionText: "Relational database",
									isCorrect: true,
									optionOrder: 1,
								},
								{
									optionText: "Web browser",
									isCorrect: false,
									optionOrder: 2,
								},
							],
						},
					},
				},
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						questionOrder: 3,
						marks: 5,
					},
				},
			},
			include: {
				mcqQuestion: {
					include: {
						options: true,
					},
				},
			},
		});
		cleanupIds.problemIds.push(mcqProblem3.id);

		const options1 = mcqProblem1.mcqQuestion!.options;
		const correctOption1 = options1.find((o) => o.isCorrect)!;

		const options2 = mcqProblem2.mcqQuestion!.options;
		const incorrectOption2 = options2.find((o) => !o.isCorrect)!;

		// Problem 4: Coding problem (to test type validation error)
		const codingProblem = await prisma.problem.create({
			data: {
				title: "Reverse a string",
				description: "Reverse the input string",
				type: ProblemType.CODING,
				difficulty: Difficulty.EASY,
				marks: 10,
				createdById: admin.id,
				assessmentProblems: {
					create: {
						assessmentId: assessment.id,
						questionOrder: 4,
						marks: 10,
					},
				},
			},
		});
		cleanupIds.problemIds.push(codingProblem.id);

		// Attempt 1 (SUBMITTED)
		const completedAttempt = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				attemptNumber: 1,
				status: AttemptStatus.SUBMITTED,
				startedAt: new Date(),
				submittedAt: new Date(),
			},
		});
		cleanupIds.attemptIds.push(completedAttempt.id);

		// Attempt 2 (IN_PROGRESS - for anti-cheat test)
		const activeAttempt = await prisma.assessmentAttempt.create({
			data: {
				assessmentId: assessment.id,
				candidateId: candidate.id,
				attemptNumber: 2,
				status: AttemptStatus.IN_PROGRESS,
				startedAt: new Date(),
			},
		});
		cleanupIds.attemptIds.push(activeAttempt.id);

		// Submissions:
		// Sub 1: Correct answer on completed attempt
		const correctSubmission = await prisma.submission.create({
			data: {
				attemptId: completedAttempt.id,
				problemId: mcqProblem1.id,
				selectedOptionId: correctOption1.id,
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(correctSubmission.id);

		// Sub 2: Incorrect answer on completed attempt
		const incorrectSubmission = await prisma.submission.create({
			data: {
				attemptId: completedAttempt.id,
				problemId: mcqProblem2.id,
				selectedOptionId: incorrectOption2.id,
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(incorrectSubmission.id);

		// Sub 3: Unanswered MCQ
		const blankSubmission = await prisma.submission.create({
			data: {
				attemptId: completedAttempt.id,
				problemId: mcqProblem3.id,
				selectedOptionId: null,
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(blankSubmission.id);

		// Sub 4: Live active exam submission
		const liveSubmission = await prisma.submission.create({
			data: {
				attemptId: activeAttempt.id,
				problemId: mcqProblem1.id,
				selectedOptionId: correctOption1.id,
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(liveSubmission.id);

		// Sub 5: Coding problem submission (for type mismatch test)
		const codingSubmission = await prisma.submission.create({
			data: {
				attemptId: completedAttempt.id,
				problemId: codingProblem.id,
				sourceCode: "print('hello')",
				language: "python",
				status: SubmissionStatus.PENDING,
			},
		});
		cleanupIds.submissionIds.push(codingSubmission.id);

		console.log("Seed data created successfully.\n");

		// ─── Test 1: Candidate evaluates correct MCQ submission ───────────────────
		console.log("=== TEST 1: Evaluate correct MCQ submission ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${correctSubmission.id}`, {
				method: "POST",
				headers: { Authorization: candidateToken },
			});
			const body = await res.json();
			assert(res.status === 200, "Returns 200 OK for correct submission");
			assert(body.data.isCorrect === true, "Marked as isCorrect = true");
			assert(body.data.earnedMarks === 5, "Earned full 5 marks");
			assert(body.data.totalMarks === 5, "Total marks is 5");
			assert(
				body.data.status === SubmissionStatus.EVALUATED,
				"Submission status updated to EVALUATED",
			);
			assert(
				body.data.correctOptionId === correctOption1.id,
				"Reveals correctOptionId on submitted attempt",
			);
			assert(
				body.data.explanation.includes("JavaScript runtime"),
				"Includes question explanation",
			);

			// Verify in Database
			const subInDb = await prisma.submission.findUnique({
				where: { id: correctSubmission.id },
			});
			assert(subInDb?.marks === 5 && subInDb?.isCorrect === true, "Database submission marks updated to 5");

			const evalInDb = await prisma.evaluation.findFirst({
				where: {
					submissionId: correctSubmission.id,
					type: EvaluationType.AUTOMATIC,
				},
			});
			assert(evalInDb !== null, "Evaluation record created in database");
			assert(evalInDb?.marks === 5, "Evaluation record has 5 marks");
			assert(
				evalInDb?.status === EvaluationStatus.COMPLETED,
				"Evaluation record status is COMPLETED",
			);
		}

		// ─── Test 2: Candidate evaluates incorrect MCQ submission ─────────────────
		console.log("\n=== TEST 2: Evaluate incorrect MCQ submission ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${incorrectSubmission.id}`, {
				method: "POST",
				headers: { Authorization: candidateToken },
			});
			const body = await res.json();
			assert(res.status === 200, "Returns 200 OK for incorrect submission");
			assert(body.data.isCorrect === false, "Marked as isCorrect = false");
			assert(body.data.earnedMarks === 0, "Earned 0 marks");
			assert(body.data.totalMarks === 5, "Total marks is 5");

			const subInDb = await prisma.submission.findUnique({
				where: { id: incorrectSubmission.id },
			});
			assert(subInDb?.marks === 0 && subInDb?.isCorrect === false, "Database submission marks is 0");
		}

		// ─── Test 3: Candidate evaluates unanswered / blank MCQ ───────────────────
		console.log("\n=== TEST 3: Evaluate unselected/blank MCQ submission ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${blankSubmission.id}`, {
				method: "POST",
				headers: { Authorization: candidateToken },
			});
			const body = await res.json();
			assert(res.status === 200, "Returns 200 OK for blank submission");
			assert(body.data.isCorrect === false, "Marked as isCorrect = false");
			assert(body.data.earnedMarks === 0, "Earned 0 marks");
			assert(body.data.selectedOptionId === null, "selectedOptionId is null");
		}

		// ─── Test 4: Type mismatch (attempting to evaluate CODING via MCQ route) ──
		console.log("\n=== TEST 4: Reject non-MCQ problem submission ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${codingSubmission.id}`, {
				method: "POST",
				headers: { Authorization: candidateToken },
			});
			const body = await res.json();
			assert(res.status === 400, "Returns 400 Bad Request for non-MCQ submission");
			assert(
				body.message.includes("Only MCQ problems"),
				"Helpful error message specifying only MCQ problems can be evaluated",
			);
		}

		// ─── Test 5: Authorization - Unauthorized candidate cannot evaluate ──────
		console.log("\n=== TEST 5: Reject evaluation from unauthorized candidate ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${correctSubmission.id}`, {
				method: "POST",
				headers: { Authorization: intruderToken },
			});
			const body = await res.json();
			assert(res.status === 403, "Returns 403 Forbidden for unauthorized user");
			assert(
				body.message.includes("permission"),
				"Error message informs lack of permission",
			);
		}

		// ─── Test 6: Anti-cheat protection during live exam ───────────────────────
		console.log("\n=== TEST 6: Anti-cheat data protection for live exam ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${liveSubmission.id}`, {
				method: "POST",
				headers: { Authorization: candidateToken },
			});
			const body = await res.json();
			assert(res.status === 200, "Candidate can record/evaluate live exam submission");
			assert(body.data.correctOptionId === undefined, "correctOptionId is hidden for live exam");
			assert(body.data.explanation === undefined, "explanation is hidden for live exam");
			assert(body.data.isCorrect === undefined, "isCorrect is hidden to prevent live test leakage");
		}

		// ─── Test 7: Admin evaluates live submission (Admin sees full details) ────
		console.log("\n=== TEST 7: Admin evaluates submission (Full inspector visibility) ===");
		{
			const res = await fetch(`${baseUrl}/mcq/${liveSubmission.id}`, {
				method: "POST",
				headers: { Authorization: adminToken },
			});
			const body = await res.json();
			assert(res.status === 200, "Admin can evaluate submission");
			assert(body.data.isCorrect === true, "Admin sees isCorrect");
			assert(body.data.correctOptionId === correctOption1.id, "Admin sees correctOptionId");
			assert(body.data.explanation !== undefined, "Admin sees explanation");
		}

		// ─── Test 8: Re-evaluation idempotency (updates existing record) ──────────
		console.log("\n=== TEST 8: Re-evaluation idempotency ===");
		{
			const countBefore = await prisma.evaluation.count({
				where: {
					submissionId: correctSubmission.id,
					type: EvaluationType.AUTOMATIC,
				},
			});

			await fetch(`${baseUrl}/mcq/${correctSubmission.id}`, {
				method: "POST",
				headers: { Authorization: adminToken },
			});

			const countAfter = await prisma.evaluation.count({
				where: {
					submissionId: correctSubmission.id,
					type: EvaluationType.AUTOMATIC,
				},
			});
			assert(
				countBefore === 1 && countAfter === 1,
				"Idempotent: Re-evaluation does not create duplicate evaluation records",
			);
		}

		console.log("\n==================================================");
		console.log("   ALL 8 MCQ EVALUATION TEST SUITES PASSED!  ");
		console.log("==================================================");
	} finally {
		// Clean up
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
				await prisma.mCQOption.deleteMany({
					where: {
						mcqQuestion: { problemId: { in: cleanupIds.problemIds } },
					},
				});
				await prisma.mCQQuestion.deleteMany({
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
			console.log("Cleanup completed.");
		} catch (cleanupErr) {
			console.error("Error during test cleanup:", cleanupErr);
		}

		if (server!) {
			server.close();
		}
		await prisma.$disconnect();
		process.exit(0);
	}
}

runMCQEvaluationTestSuite().catch((err) => {
	console.error("Test execution failed:", err);
	process.exit(1);
});
