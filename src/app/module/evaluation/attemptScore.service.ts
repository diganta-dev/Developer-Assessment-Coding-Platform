import httpStatus from "http-status";
import {
	AttemptStatus,
	ResultStatus,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	IAttemptProblemScoreBreakdown,
	IAttemptScoreResult,
} from "./evaluation.interface";

/**
 * Calculates, aggregates, and updates the total score and results for an assessment attempt.
 *
 * Scoring Pipeline:
 * 1. Fetch attempt with candidate details, assessment problem configs, and all submissions.
 * 2. Validate user access permissions (candidate owner, assessment creator, company member, admin).
 * 3. Map assessment problems to candidate submissions and calculate obtained marks vs allocated marks.
 * 4. Compute overall percentage, evaluate pass/fail threshold, and check completion of all problem evaluations.
 * 5. Atomically persist updated marks, percentage, and attempt status to DB, upserting the Result record.
 * 6. Return a comprehensive evaluation report with granular problem-by-problem breakdown.
 */
const calculateAttemptScore = async (
	attemptId: string,
	user?: RequestUser,
): Promise<IAttemptScoreResult> => {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: {
				include: {
					problems: {
						include: {
							problem: {
								select: {
									id: true,
									title: true,
									type: true,
									difficulty: true,
									marks: true,
								},
							},
						},
						orderBy: {
							questionOrder: "asc",
						},
					},
				},
			},
			candidate: {
				select: {
					id: true,
					name: true,
					email: true,
				},
			},
			submissions: true,
			result: true,
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	// Permission verification (if user context provided)
	if (user) {
		const isCandidateOwner = attempt.candidateId === user.userId;
		const isPlatformAdmin =
			user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
		const isCompanyMember =
			Boolean(user.companyId) &&
			user.companyId === attempt.assessment.companyId;
		const isAssessmentCreator = attempt.assessment.creatorId === user.userId;

		if (
			!isCandidateOwner &&
			!isPlatformAdmin &&
			!isCompanyMember &&
			!isAssessmentCreator
		) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to access or calculate this attempt's score.",
			);
		}
	}

	const assessmentProblems = attempt.assessment.problems;
	const submissions = attempt.submissions;
	const submissionMap = new Map(submissions.map((sub) => [sub.problemId, sub]));

	let totalPossibleMarks = 0;
	let totalObtainedMarks = 0;
	let evaluatedProblems = 0;

	const breakdown: IAttemptProblemScoreBreakdown[] = assessmentProblems.map(
		(ap) => {
			const problemMaxMarks = ap.marks ?? ap.problem.marks;
			totalPossibleMarks += problemMaxMarks;

			const sub = submissionMap.get(ap.problemId);
			const isEvaluated =
				sub &&
				(sub.status === SubmissionStatus.EVALUATED || sub.marks !== null);

			let problemEarnedMarks = 0;
			let problemIsCorrect = false;

			if (sub && sub.marks !== null && sub.marks !== undefined) {
				problemEarnedMarks = Math.max(0, sub.marks);
				problemIsCorrect = Boolean(
					sub.isCorrect ?? problemEarnedMarks === problemMaxMarks,
				);
			}

			if (isEvaluated) {
				evaluatedProblems++;
				totalObtainedMarks += problemEarnedMarks;
			}

			return {
				problemId: ap.problemId,
				questionOrder: ap.questionOrder,
				title: ap.problem.title,
				type: ap.problem.type,
				difficulty: ap.problem.difficulty,
				maxMarks: problemMaxMarks,
				obtainedMarks: problemEarnedMarks,
				isCorrect: problemIsCorrect,
				submissionStatus: sub ? sub.status : "NOT_SUBMITTED",
				submissionId: sub?.id ?? null,
			};
		},
	);

	// Fallback to assessment totalMarks if no problems are configured directly
	if (totalPossibleMarks === 0 && attempt.assessment.totalMarks > 0) {
		totalPossibleMarks = attempt.assessment.totalMarks;
	}

	const totalProblems = assessmentProblems.length;
	const pendingProblems = Math.max(0, totalProblems - evaluatedProblems);
	const isFullyEvaluated =
		totalProblems > 0 && evaluatedProblems >= totalProblems;

	totalObtainedMarks = Math.round(totalObtainedMarks * 100) / 100;
	const percentage =
		totalPossibleMarks > 0
			? Math.round((totalObtainedMarks / totalPossibleMarks) * 10000) / 100
			: 0;

	let isPassed = false;
	if (
		attempt.assessment.passingScore !== null &&
		attempt.assessment.passingScore !== undefined
	) {
		isPassed = totalObtainedMarks >= attempt.assessment.passingScore;
	} else {
		isPassed = percentage >= 50;
	}

	const resultStatus = isPassed ? ResultStatus.PASSED : ResultStatus.FAILED;

	// Progress attempt status to EVALUATED once all questions are graded
	let nextAttemptStatus = attempt.status;
	if (
		isFullyEvaluated &&
		(attempt.status === AttemptStatus.SUBMITTED ||
			attempt.status === AttemptStatus.EXPIRED)
	) {
		nextAttemptStatus = AttemptStatus.EVALUATED;
	}

	// Atomically persist attempt and result records
	const [updatedAttempt, updatedResult] = await prisma.$transaction(
		async (tx) => {
			const att = await tx.assessmentAttempt.update({
				where: { id: attempt.id },
				data: {
					totalMarks: totalPossibleMarks,
					obtainedMarks: totalObtainedMarks,
					percentage,
					status: nextAttemptStatus,
				},
			});

			const res = await tx.result.upsert({
				where: { attemptId: attempt.id },
				update: {
					totalMarks: totalPossibleMarks,
					obtainedMarks: totalObtainedMarks,
					percentage,
					passingScore: attempt.assessment.passingScore,
					status: resultStatus,
				},
				create: {
					attemptId: attempt.id,
					totalMarks: totalPossibleMarks,
					obtainedMarks: totalObtainedMarks,
					percentage,
					passingScore: attempt.assessment.passingScore,
					status: resultStatus,
				},
			});

			return [att, res];
		},
	);

	return {
		attemptId: updatedAttempt.id,
		assessmentId: attempt.assessmentId,
		candidateId: attempt.candidateId,
		candidate: attempt.candidate,
		totalMarks: totalPossibleMarks,
		obtainedMarks: totalObtainedMarks,
		percentage,
		passingScore: attempt.assessment.passingScore,
		isPassed,
		resultStatus,
		attemptStatus: updatedAttempt.status,
		isFullyEvaluated,
		totalProblems,
		evaluatedProblems,
		pendingProblems,
		breakdown,
		resultId: updatedResult.id,
		calculatedAt: new Date(),
	};
};

export const AttemptScoreService = {
	calculateAttemptScore,
};
