import http from "http";
import app from "../app";
import config from "../app/config";
import { prisma } from "../app/lib/prisma";
import { jwtUtils } from "../app/utils/jwt";
import {
	AssessmentStatus,
	AttemptStatus,
	EvaluationType,
	ProblemType,
	SubmissionStatus,
	UserRole,
} from "../generated/prisma/enums";

// ANSI color helpers
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, message: string) {
	if (condition) {
		console.log(`  ${green("✔")} ${message}`);
		passedCount++;
	} else {
		console.error(`  ${red("✖")} ${message}`);
		failedCount++;
	}
}

async function runTestSuite() {
	console.log(bold(cyan("\n=== STARTING EVALUATION ROUTES TEST SUITE ===\n")));

	// ─── 1. Setup Test Users & Data ──────────────────────────────────────────
	console.log(cyan("Setting up test users and records..."));

	// Clean up any stale test users/companies from previous test runs
	await prisma.user.deleteMany({
		where: { email: { contains: "evaltest.com" } },
	});

	// Create a dedicated platform admin
	const timestamp = Date.now();
	const adminUser = await prisma.user.create({
		data: {
			name: "Test Super Admin",
			email: `admin_${timestamp}@evaltest.com`,
			password: "hashedpassword123",
			role: UserRole.SUPER_ADMIN,
			isActive: true,
		},
	});

	// Create a dedicated pure candidate (attempt owner, NO company membership)
	const candidateUser = await prisma.user.create({
		data: {
			name: "Pure Candidate Owner",
			email: `candidate_owner_${timestamp}@evaltest.com`,
			password: "hashedpassword123",
			role: UserRole.CANDIDATE,
			isActive: true,
		},
	});

	// Create an unrelated candidate (NO company membership, different person)
	const otherCandidateUser = await prisma.user.create({
		data: {
			name: "Unrelated Candidate",
			email: `unrelated_candidate_${timestamp}@evaltest.com`,
			password: "hashedpassword123",
			role: UserRole.CANDIDATE,
			isActive: true,
		},
	});

	// Create an isolated test company
	const company = await prisma.company.create({
		data: {
			name: `Eval Test Corp ${timestamp}`,
			slug: `eval-test-corp-${timestamp}`,
			email: `eval_test_${timestamp}@company.com`,
		},
	});

	// Find the existing coding problem and written problem
	const codingProblem = await prisma.problem.findFirst({
		where: { type: ProblemType.CODING },
		include: { codingQuestion: { include: { testCases: true } } },
	});
	if (!codingProblem) {
		throw new Error("No CODING problem found in database. Seed problems first.");
	}

	const writtenProblem = await prisma.problem.findFirst({
		where: { type: ProblemType.WRITTEN },
	});
	if (!writtenProblem) {
		throw new Error("No WRITTEN problem found in database. Seed problems first.");
	}

	// Create a test Assessment
	const testAssessment = await prisma.assessment.create({
		data: {
			title: `Evaluation Test Assessment ${Date.now()}`,
			companyId: company.id,
			creatorId: adminUser.id,
			durationMinutes: 60,
			totalMarks: 15,
			status: AssessmentStatus.PUBLISHED,
			problems: {
				create: [
					{
						problemId: codingProblem.id,
						questionOrder: 1,
						marks: 10,
					},
					{
						problemId: writtenProblem.id,
						questionOrder: 2,
						marks: 5,
					},
				],
			},
		},
	});

	// Create an AssessmentAttempt for the candidate
	const testAttempt = await prisma.assessmentAttempt.create({
		data: {
			assessmentId: testAssessment.id,
			candidateId: candidateUser.id,
			status: AttemptStatus.SUBMITTED,
			startedAt: new Date(),
			submittedAt: new Date(),
		},
	});

	// Create Coding Submission (Python code that passes Two Sum testcases)
	const pythonSolution = `
import sys

def main():
    data = sys.stdin.read().split()
    if not data:
        return
    n = int(data[0])
    target = int(data[1])
    nums = [int(x) for x in data[2:2+n]]
    seen = {}
    for i, x in enumerate(nums):
        diff = target - x
        if diff in seen:
            print(f"{seen[diff]} {i}")
            return
        seen[x] = i

if __name__ == '__main__':
    main()
`.trim();

	const codingSubmission = await prisma.submission.create({
		data: {
			attemptId: testAttempt.id,
			problemId: codingProblem.id,
			language: "python",
			sourceCode: pythonSolution,
			status: SubmissionStatus.PENDING,
		},
	});

	// Create Written Submission
	const writtenSubmission = await prisma.submission.create({
		data: {
			attemptId: testAttempt.id,
			problemId: writtenProblem.id,
			answerText:
				"Database indexes use B-Tree structures to organize table rows for O(log n) lookups. Leaf nodes store indexed keys and pointers to data pages.",
			status: SubmissionStatus.PENDING,
		},
	});

	console.log(green("✔ Test records initialized successfully."));

	// ─── 2. Generate Tokens ──────────────────────────────────────────────────
	const adminToken = jwtUtils.createToken(
		{
			userId: adminUser.id,
			email: adminUser.email,
			name: adminUser.name,
			role: adminUser.role,
			tokenVersion: adminUser.tokenVersion,
		},
		config.jwt_access_secret,
		"1h" as any,
	);

	const candidateToken = jwtUtils.createToken(
		{
			userId: candidateUser.id,
			email: candidateUser.email,
			name: candidateUser.name,
			role: candidateUser.role,
			tokenVersion: candidateUser.tokenVersion,
		},
		config.jwt_access_secret,
		"1h" as any,
	);

	const otherCandidateToken = jwtUtils.createToken(
		{
			userId: otherCandidateUser.id,
			email: otherCandidateUser.email,
			name: otherCandidateUser.name,
			role: otherCandidateUser.role,
			tokenVersion: otherCandidateUser.tokenVersion,
		},
		config.jwt_access_secret,
		"1h" as any,
	);

	// ─── 3. Start Test HTTP Server ───────────────────────────────────────────
	const server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	const port = (server.address() as any).port;
	const baseUrl = `http://localhost:${port}/api/v1/evaluation`;
	console.log(`Test server running on port ${port}\n`);

	let createdAutomaticEvaluationId: string = "";
	let createdManualEvaluationId: string = "";

	try {
		// ═══════════════════════════════════════════════════════════════════════
		// ROUTE 1: POST /api/v1/evaluation/coding/:submissionId
		// ═══════════════════════════════════════════════════════════════════════
		console.log(bold(cyan("=== Testing ROUTE 1: POST /api/v1/evaluation/coding/:submissionId ===")));

		// Test 1.1: Unauthorized request (no token)
		{
			const res = await fetch(`${baseUrl}/coding/${codingSubmission.id}`, {
				method: "POST",
			});
			assert(res.status === 401, "Route 1.1: Fails with 401 when no token is provided");
		}

		// Test 1.2: Forbidden request (unauthorized other candidate)
		{
			const res = await fetch(`${baseUrl}/coding/${codingSubmission.id}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${otherCandidateToken}` },
			});
			assert(
				res.status === 403,
				"Route 1.2: Fails with 403 when user is not candidate owner, admin, or creator",
			);
		}

		// Test 1.3: Non-existent submission ID
		{
			const res = await fetch(`${baseUrl}/coding/non_existent_sub_123`, {
				method: "POST",
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			assert(res.status === 404, "Route 1.3: Returns 404 for non-existent submission ID");
		}

		// Test 1.4: Non-coding submission
		{
			const res = await fetch(`${baseUrl}/coding/${writtenSubmission.id}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(
				res.status === 400 && body.message?.includes("only supported for CODING"),
				"Route 1.4: Returns 400 when attempting to run Judge0 on non-coding problem",
			);
		}

		// Test 1.5: Valid Judge0 execution by Candidate Owner
		{
			console.log("  Executing automated Judge0 evaluation (this calls Judge0 Sandbox)...");
			const res = await fetch(`${baseUrl}/coding/${codingSubmission.id}`, {
				method: "POST",
				headers: { Authorization: `Bearer ${candidateToken}` },
			});
			const body = await res.json();

			assert(
				res.status === 200 && body.success === true,
				`Route 1.5: Automated evaluation succeeded with status 200 (msg: ${body.message})`,
			);
			assert(
				body.data?.status === "PASSED" || body.data?.passedTests > 0,
				`Route 1.5: Test cases evaluated: ${body.data?.passedTests}/${body.data?.totalTestCases} passed. Marks: ${body.data?.earnedMarks}/${body.data?.totalMarks}`,
			);
			assert(
				Array.isArray(body.data?.testResults) && body.data.testResults.length === 2,
				"Route 1.5: Detailed testResults returned for both test cases",
			);

			// Check DB persisted evaluation record
			const autoEval = await prisma.evaluation.findFirst({
				where: {
					submissionId: codingSubmission.id,
					type: EvaluationType.AUTOMATIC,
				},
			});
			assert(!!autoEval, "Route 1.5: AUTOMATIC Evaluation record persisted in database");
			if (autoEval) {
				createdAutomaticEvaluationId = autoEval.id;
			}
		}

		// ═══════════════════════════════════════════════════════════════════════
		// ROUTE 2: POST /api/v1/evaluation/manual/:submissionId
		// ═══════════════════════════════════════════════════════════════════════
		console.log(bold(cyan("\n=== Testing ROUTE 2: POST /api/v1/evaluation/manual/:submissionId ===")));

		// Test 2.1: Unauthorized request (no token)
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ marks: 4 }),
			});
			assert(res.status === 401, "Route 2.1: Fails with 401 when no token is provided");
		}

		// Test 2.2: Candidate attempting to manually evaluate
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${candidateToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ marks: 4 }),
			});
			assert(
				res.status === 403,
				"Route 2.2: Candidate forbidden from manual evaluation (403)",
			);
		}

		// Test 2.3: Marks exceeding maximum allowed marks (5 max for this problem)
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${adminToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ marks: 100 }),
			});
			const body = await res.json();
			assert(
				res.status === 400 && body.message?.includes("cannot exceed"),
				"Route 2.3: Fails with 400 when marks exceed problem maximum marks",
			);
		}

		// Test 2.4: Negative marks
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${adminToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ marks: -2 }),
			});
			assert(res.status === 400, "Route 2.4: Fails with 400 when marks are negative");
		}

		// Test 2.5: Successful manual evaluation by Admin
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${adminToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					marks: 4.5,
					feedback: "Well explained concept of B-Tree indexing in databases.",
				}),
			});
			const body = await res.json();
			assert(
				res.status === 200 && body.success === true,
				"Route 2.5: Manual evaluation succeeded with 200",
			);
			assert(
				body.data?.marks === 4.5 && body.data?.type === "MANUAL",
				`Route 2.5: Correct marks (4.5) and type (MANUAL) recorded`,
			);
			assert(
				body.data?.evaluator?.email === adminUser.email,
				"Route 2.5: Evaluator user populated in response",
			);

			createdManualEvaluationId = body.data?.id;

			// Verify Submission record updated
			const subInDb = await prisma.submission.findUnique({
				where: { id: writtenSubmission.id },
			});
			assert(
				subInDb?.marks === 4.5 && subInDb?.status === SubmissionStatus.EVALUATED,
				"Route 2.5: Submission updated to EVALUATED with marks 4.5",
			);
		}

		// Test 2.6: Updating existing manual evaluation
		{
			const res = await fetch(`${baseUrl}/manual/${writtenSubmission.id}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${adminToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					marks: 5,
					feedback: "Updated to full marks upon re-review.",
				}),
			});
			const body = await res.json();
			assert(
				res.status === 200 && body.data?.marks === 5,
				"Route 2.6: Updating manual evaluation returns 200 and updated marks (5)",
			);
		}

		// ═══════════════════════════════════════════════════════════════════════
		// ROUTE 3: GET /api/v1/evaluation
		// ═══════════════════════════════════════════════════════════════════════
		console.log(bold(cyan("\n=== Testing ROUTE 3: GET /api/v1/evaluation ===")));

		// Test 3.1: Unauthorized request (no token)
		{
			const res = await fetch(`${baseUrl}`);
			assert(res.status === 401, "Route 3.1: Fails with 401 when no token is provided");
		}

		// Test 3.2: Admin lists evaluations (sees all evaluations)
		{
			const res = await fetch(`${baseUrl}`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(
				res.status === 200 && body.success === true,
				"Route 3.2: Admin retrieves all evaluations successfully",
			);
			assert(
				body.meta && typeof body.meta.total === "number" && body.meta.total >= 2,
				`Route 3.2: Meta pagination present (total: ${body.meta?.total})`,
			);
			assert(Array.isArray(body.data) && body.data.length >= 2, "Route 3.2: Evaluations data array returned");
		}

		// Test 3.3: Candidate lists evaluations (scoped to candidate's own)
		{
			const res = await fetch(`${baseUrl}`, {
				headers: { Authorization: `Bearer ${candidateToken}` },
			});
			const body = await res.json();
			assert(res.status === 200, "Route 3.3: Candidate retrieves scoped evaluations with 200");
			const allBelongToCandidate = body.data.every(
				(ev: any) => ev.submission?.attempt?.candidateId === candidateUser.id,
			);
			assert(
				allBelongToCandidate,
				"Route 3.3: Data properly scoped: all returned evaluations belong to the candidate",
			);
		}

		// Test 3.4: Filter by type = AUTOMATIC
		{
			const res = await fetch(`${baseUrl}?type=AUTOMATIC`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(res.status === 200, "Route 3.4: Filter by ?type=AUTOMATIC returns 200");
			const allAutomatic = body.data.every((ev: any) => ev.type === "AUTOMATIC");
			assert(allAutomatic && body.data.length > 0, "Route 3.4: Only AUTOMATIC evaluations returned");
		}

		// Test 3.5: Filter by type = MANUAL
		{
			const res = await fetch(`${baseUrl}?type=MANUAL`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(res.status === 200, "Route 3.5: Filter by ?type=MANUAL returns 200");
			const allManual = body.data.every((ev: any) => ev.type === "MANUAL");
			assert(allManual && body.data.length > 0, "Route 3.5: Only MANUAL evaluations returned");
		}

		// Test 3.6: Filter by submissionId
		{
			const res = await fetch(`${baseUrl}?submissionId=${writtenSubmission.id}`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(
				res.status === 200 &&
					body.data.every((ev: any) => ev.submissionId === writtenSubmission.id),
				"Route 3.6: Filter by ?submissionId matches only the targeted submission",
			);
		}

		// ═══════════════════════════════════════════════════════════════════════
		// ROUTE 4: GET /api/v1/evaluation/:id
		// ═══════════════════════════════════════════════════════════════════════
		console.log(bold(cyan("\n=== Testing ROUTE 4: GET /api/v1/evaluation/:id ===")));

		// Test 4.1: Unauthorized request (no token)
		{
			const res = await fetch(`${baseUrl}/${createdManualEvaluationId}`);
			assert(res.status === 401, "Route 4.1: Fails with 401 when no token is provided");
		}

		// Test 4.2: Non-existent evaluation ID
		{
			const res = await fetch(`${baseUrl}/non_existent_eval_999`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			assert(res.status === 404, "Route 4.2: Returns 404 for non-existent evaluation ID");
		}

		// Test 4.3: Forbidden access by unrelated candidate
		{
			const res = await fetch(`${baseUrl}/${createdManualEvaluationId}`, {
				headers: { Authorization: `Bearer ${otherCandidateToken}` },
			});
			assert(
				res.status === 403,
				"Route 4.3: Returns 403 when candidate attempts to view another candidate's evaluation",
			);
		}

		// Test 4.4: Candidate views own evaluation
		{
			const res = await fetch(`${baseUrl}/${createdManualEvaluationId}`, {
				headers: { Authorization: `Bearer ${candidateToken}` },
			});
			const body = await res.json();
			assert(
				res.status === 200 && body.success === true,
				"Route 4.4: Candidate owner successfully views evaluation (200)",
			);
			assert(
				body.data?.id === createdManualEvaluationId && body.data?.submission?.attempt,
				"Route 4.4: Returned evaluation has populated submission, attempt, and problem",
			);
		}

		// Test 4.5: Admin views evaluation
		{
			const res = await fetch(`${baseUrl}/${createdAutomaticEvaluationId}`, {
				headers: { Authorization: `Bearer ${adminToken}` },
			});
			const body = await res.json();
			assert(
				res.status === 200 && body.data?.id === createdAutomaticEvaluationId,
				"Route 4.5: Admin views single automatic evaluation successfully",
			);
			assert(
				body.data?.submission?.problem?.title === codingProblem.title,
				"Route 4.5: Problem details correctly populated in single evaluation response",
			);
		}
	} finally {
		// ─── Cleanup Test Data ───────────────────────────────────────────────
		console.log(cyan("\nCleaning up test records..."));
		try {
			await prisma.evaluation.deleteMany({
				where: {
					submissionId: { in: [codingSubmission.id, writtenSubmission.id] },
				},
			});
			await prisma.submission.deleteMany({
				where: {
					id: { in: [codingSubmission.id, writtenSubmission.id] },
				},
			});
			await prisma.assessmentAttempt.delete({
				where: { id: testAttempt.id },
			});
			await prisma.assessmentProblem.deleteMany({
				where: { assessmentId: testAssessment.id },
			});
			await prisma.assessment.delete({
				where: { id: testAssessment.id },
			});
			await prisma.company.delete({
				where: { id: company.id },
			});
			await prisma.user.deleteMany({
				where: {
					id: { in: [adminUser.id, candidateUser.id, otherCandidateUser.id] },
				},
			});
			console.log(green("✔ Cleanup completed."));
		} catch (cleanupError) {
			console.error("Cleanup error:", cleanupError);
		}

		server.close();
		await prisma.$disconnect();
	}

	// ─── Summary ─────────────────────────────────────────────────────────────
	console.log(bold(cyan("\n=== TEST RESULTS SUMMARY ===")));
	console.log(`Total tests run: ${passedCount + failedCount}`);
	console.log(`Passed: ${green(String(passedCount))}`);
	console.log(`Failed: ${failedCount === 0 ? green("0") : red(String(failedCount))}`);

	if (failedCount > 0) {
		process.exit(1);
	}
}

runTestSuite().catch((err) => {
	console.error(red("Fatal test suite error:"), err);
	process.exit(1);
});
