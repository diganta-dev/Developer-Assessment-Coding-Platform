import httpStatus from "http-status";
import {
	AssessmentStatus,
	AttemptStatus,
	ResultStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import { AttemptScoreService } from "../evaluation/attemptScore.service";
import type {
	IAssessmentLeaderboard,
	IAssessmentResultResponse,
	ICandidateRankResult,
	IPublishResultResponse,
	IRankedParticipant,
	IRankingFilterQuery,
} from "./rankingresult.interface";

// ============================================================================
// Helper: Access Control & Authorization
// ============================================================================

/**
 * Validates that the requesting user has permission to view or manage results for an assessment.
 */
function verifyAssessmentAccess(
	user: RequestUser | undefined,
	assessment: { companyId: string; creatorId: string },
	action = "view results",
): void {
	if (!user) return;

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	const isCompanyMember =
		Boolean(user.companyId) && user.companyId === assessment.companyId;
	const isAssessmentCreator = assessment.creatorId === user.userId;

	if (!isPlatformAdmin && !isCompanyMember && !isAssessmentCreator) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to ${action} for this assessment.`,
		);
	}
}

// ============================================================================
// 1. determineResultStatus
// ============================================================================

/**
 * Determines whether a candidate's score qualifies as PASSED or FAILED
 * based on assessment passingScore threshold or standard 50% cutoff.
 */
export const determineResultStatus = (
	obtainedMarks: number,
	totalMarks: number,
	passingScore?: number | null,
): ResultStatus => {
	if (passingScore !== null && passingScore !== undefined && passingScore > 0) {
		return obtainedMarks >= passingScore
			? ResultStatus.PASSED
			: ResultStatus.FAILED;
	}

	const percentage =
		totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
	return percentage >= 50 ? ResultStatus.PASSED : ResultStatus.FAILED;
};

// ============================================================================
// 2. calculateCandidateRank
// ============================================================================

/**
 * Calculates the competitive rank and percentile of a candidate's attempt within an assessment.
 * Employs standard tie-breaking rules:
 * 1. Higher obtained marks wins
 * 2. Lower time taken (seconds) wins
 * 3. Earlier submitted timestamp wins
 */
export const calculateCandidateRank = async (
	attemptId: string,
): Promise<ICandidateRankResult> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			candidate: {
				select: { id: true, name: true, email: true },
			},
			assessment: {
				select: { id: true, title: true, passingScore: true, totalMarks: true },
			},
			result: true,
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	// Fetch all participant attempts for this assessment that have submitted or been evaluated
	const peerAttempts = await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId: attempt.assessmentId,
			status: {
				in: [
					AttemptStatus.EVALUATED,
					AttemptStatus.SUBMITTED,
					AttemptStatus.EXPIRED,
				],
			},
		},
		select: {
			id: true,
			obtainedMarks: true,
			startedAt: true,
			submittedAt: true,
			createdAt: true,
		},
	});

	// Ensure this attempt is included in the ranking pool
	const allAttempts = peerAttempts.some((p) => p.id === attempt.id)
		? peerAttempts
		: [
				...peerAttempts,
				{
					id: attempt.id,
					obtainedMarks: attempt.obtainedMarks,
					startedAt: attempt.startedAt,
					submittedAt: attempt.submittedAt,
					createdAt: attempt.createdAt,
				},
		  ];

	const totalParticipants = allAttempts.length;

	// Sort peers according to competition rules
	const sorted = allAttempts.slice().sort((a, b) => {
		// 1. Obtained marks (descending)
		if (b.obtainedMarks !== a.obtainedMarks) {
			return b.obtainedMarks - a.obtainedMarks;
		}

		// 2. Time taken in seconds (ascending, faster completion wins)
		const timeA =
			a.submittedAt && a.startedAt
				? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;
		const timeB =
			b.submittedAt && b.startedAt
				? Math.round((b.submittedAt.getTime() - b.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;

		if (timeA !== timeB) {
			return timeA - timeB;
		}

		// 3. Submission date (ascending, earlier submission wins)
		const submitA = a.submittedAt ? a.submittedAt.getTime() : a.createdAt.getTime();
		const submitB = b.submittedAt ? b.submittedAt.getTime() : b.createdAt.getTime();
		return submitA - submitB;
	});

	const rankIndex = sorted.findIndex((att) => att.id === attempt.id);
	const rank = rankIndex !== -1 ? rankIndex + 1 : totalParticipants;

	const percentile =
		totalParticipants > 1
			? Math.round(
					((totalParticipants - rank) / (totalParticipants - 1)) * 100 * 100,
				) / 100
			: 100;

	const timeTakenSeconds =
		attempt.submittedAt && attempt.startedAt
			? Math.round(
					(attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000,
				)
			: null;

	const status = determineResultStatus(
		attempt.obtainedMarks,
		attempt.totalMarks,
		attempt.assessment.passingScore,
	);

	// Cache the computed rank in the Result table if it exists
	if (attempt.result && attempt.result.rank !== rank) {
		await prisma.result.update({
			where: { attemptId: attempt.id },
			data: { rank },
		});
	}

	return {
		attemptId: attempt.id,
		assessmentId: attempt.assessmentId,
		candidateId: attempt.candidateId,
		candidateName: attempt.candidate.name,
		rank,
		totalParticipants,
		obtainedMarks: attempt.obtainedMarks,
		percentage: attempt.percentage,
		timeTakenSeconds,
		status,
		percentile,
	};
};

// ============================================================================
// 3. generateAssessmentResult
// ============================================================================

/**
 * Aggregates candidate attempt scores, calculates pass/fail status and competitive rank,
 * and atomically persists the final Result record in the database.
 */
export const generateAssessmentResult = async (
	attemptId: string,
	user?: RequestUser,
): Promise<IAssessmentResultResponse> => {
	if (!attemptId || attemptId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Attempt ID is required.");
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			candidate: {
				select: { id: true, name: true, email: true },
			},
			assessment: {
				include: {
					problems: {
						include: {
							problem: true,
						},
						orderBy: { questionOrder: "asc" },
					},
				},
			},
			result: true,
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	// Permission Verification
	const isCandidateOwner = user ? attempt.candidateId === user.userId : false;
	if (user && !isCandidateOwner) {
		verifyAssessmentAccess(user, attempt.assessment, "generate or view this result");
	}

	// Ensure attempt score is calculated and aggregated with latest data
	const scoreReport = await AttemptScoreService.calculateAttemptScore(
		attemptId,
		user,
	);

	// Determine pass/fail status
	const status = determineResultStatus(
		scoreReport.obtainedMarks,
		scoreReport.totalMarks,
		attempt.assessment.passingScore,
	);

	// Compute candidate rank
	const rankData = await calculateCandidateRank(attemptId);

	// Persist / update Result record
	const resultRecord = await prisma.result.upsert({
		where: { attemptId: attempt.id },
		update: {
			totalMarks: scoreReport.totalMarks,
			obtainedMarks: scoreReport.obtainedMarks,
			percentage: scoreReport.percentage,
			passingScore: attempt.assessment.passingScore,
			rank: rankData.rank,
			status,
		},
		create: {
			attemptId: attempt.id,
			totalMarks: scoreReport.totalMarks,
			obtainedMarks: scoreReport.obtainedMarks,
			percentage: scoreReport.percentage,
			passingScore: attempt.assessment.passingScore,
			rank: rankData.rank,
			status,
		},
	});

	// Anti-cheating guard: Mask scores and rank for active exam
	const isLiveAssessment =
		isCandidateOwner && attempt.status === AttemptStatus.IN_PROGRESS;

	const timeTakenSeconds =
		attempt.submittedAt && attempt.startedAt
			? Math.round(
					(attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000,
				)
			: null;

	const breakdown = scoreReport.breakdown.map((item) => ({
		problemId: item.problemId,
		title: item.title,
		type: item.type,
		maxMarks: item.maxMarks,
		obtainedMarks: isLiveAssessment ? 0 : item.obtainedMarks,
		isCorrect: isLiveAssessment ? false : item.isCorrect,
		status: item.submissionStatus,
	}));

	return {
		resultId: resultRecord.id,
		attemptId: attempt.id,
		assessmentId: attempt.assessmentId,
		assessmentTitle: attempt.assessment.title,
		candidateId: attempt.candidateId,
		candidateName: attempt.candidate.name,
		candidateEmail: attempt.candidate.email,
		totalMarks: scoreReport.totalMarks,
		obtainedMarks: isLiveAssessment ? 0 : scoreReport.obtainedMarks,
		percentage: isLiveAssessment ? 0 : scoreReport.percentage,
		passingScore: attempt.assessment.passingScore,
		status: isLiveAssessment ? ResultStatus.FAILED : status,
		rank: isLiveAssessment ? null : rankData.rank,
		totalParticipants: rankData.totalParticipants,
		attemptStatus: scoreReport.attemptStatus,
		isFullyEvaluated: scoreReport.isFullyEvaluated,
		timeTakenSeconds,
		startedAt: attempt.startedAt,
		submittedAt: attempt.submittedAt,
		publishedAt: resultRecord.publishedAt,
		isPublished: Boolean(resultRecord.publishedAt),
		breakdown,
	};
};

// ============================================================================
// 4. generateAssessmentRanking (Leaderboard)
// ============================================================================

/**
 * Generates an assessment leaderboard, ranks all participants using tie-breaking rules,
 * updates rank cache on each Result record, and provides analytical summary metrics.
 */
export const generateAssessmentRanking = async (
	assessmentId: string,
	user?: RequestUser,
	query: IRankingFilterQuery = {},
): Promise<IAssessmentLeaderboard> => {
	if (!assessmentId || assessmentId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Assessment ID is required.");
	}

	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			title: true,
			totalMarks: true,
			passingScore: true,
			companyId: true,
			creatorId: true,
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	// Fetch all evaluated / submitted attempts for this assessment
	const attempts = await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId,
			status: {
				in: [
					AttemptStatus.EVALUATED,
					AttemptStatus.SUBMITTED,
					AttemptStatus.EXPIRED,
				],
			},
		},
		include: {
			candidate: {
				select: {
					id: true,
					name: true,
					email: true,
					profilePictureUrl: true,
				},
			},
			result: true,
		},
	});

	// Sort participants with enterprise competition tie-breaking:
	// 1. Marks (descending)
	// 2. Time taken (ascending)
	// 3. Submitted timestamp (ascending)
	const sorted = attempts.slice().sort((a, b) => {
		if (b.obtainedMarks !== a.obtainedMarks) {
			return b.obtainedMarks - a.obtainedMarks;
		}

		const timeA =
			a.submittedAt && a.startedAt
				? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;
		const timeB =
			b.submittedAt && b.startedAt
				? Math.round((b.submittedAt.getTime() - b.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;

		if (timeA !== timeB) {
			return timeA - timeB;
		}

		const submitA = a.submittedAt ? a.submittedAt.getTime() : a.createdAt.getTime();
		const submitB = b.submittedAt ? b.submittedAt.getTime() : b.createdAt.getTime();
		return submitA - submitB;
	});

	const totalParticipants = sorted.length;

	// Build ranked list and sync rank in database
	const rankedParticipants: IRankedParticipant[] = [];
	const rankUpdatePromises: Promise<any>[] = [];

	const highestScore = totalParticipants > 0 ? sorted[0].obtainedMarks : 0;
	const lowestScore =
		totalParticipants > 0 ? sorted[totalParticipants - 1].obtainedMarks : 0;
	let totalMarksSum = 0;
	let passedCount = 0;
	let latestPublishedAt: Date | null = null;

	sorted.forEach((attempt, index) => {
		const currentRank = index + 1;
		const marks = attempt.obtainedMarks;
		const timeTakenSeconds =
			attempt.submittedAt && attempt.startedAt
				? Math.round(
						(attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000,
					)
				: null;

		const status = determineResultStatus(
			marks,
			attempt.totalMarks || assessment.totalMarks,
			assessment.passingScore,
		);

		if (status === ResultStatus.PASSED) passedCount++;
		totalMarksSum += marks;

		if (attempt.result?.publishedAt) {
			latestPublishedAt = attempt.result.publishedAt;
		}

		// Sync rank cache in DB if out of sync
		if (attempt.result && attempt.result.rank !== currentRank) {
			rankUpdatePromises.push(
				prisma.result.update({
					where: { attemptId: attempt.id },
					data: { rank: currentRank },
				}),
			);
		}

		rankedParticipants.push({
			rank: currentRank,
			attemptId: attempt.id,
			candidateId: attempt.candidateId,
			candidateName: attempt.candidate.name,
			candidateEmail: attempt.candidate.email,
			candidateAvatar: attempt.candidate.profilePictureUrl,
			obtainedMarks: marks,
			totalMarks: attempt.totalMarks || assessment.totalMarks,
			percentage: attempt.percentage,
			timeTakenSeconds,
			status,
			submittedAt: attempt.submittedAt,
			attemptStatus: attempt.status,
		});
	});

	// Run rank updates in background non-blocking
	if (rankUpdatePromises.length > 0) {
		Promise.all(rankUpdatePromises).catch((err) =>
			console.error("Rank sync error:", err),
		);
	}

	// Apply filter / search if specified
	let filtered = rankedParticipants;

	if (query.searchTerm && query.searchTerm.trim() !== "") {
		const term = query.searchTerm.trim().toLowerCase();
		filtered = filtered.filter(
			(p) =>
				p.candidateName.toLowerCase().includes(term) ||
				p.candidateEmail.toLowerCase().includes(term),
		);
	}

	if (query.status) {
		filtered = filtered.filter((p) => p.status === query.status);
	}

	// Pagination (supports up to 500 records per page for exports / comprehensive views)
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.max(1, Math.min(500, Number(query.limit) || 20));
	const total = filtered.length;
	const totalPages = Math.ceil(total / limit);
	const startIndex = (page - 1) * limit;
	const paginated = filtered.slice(startIndex, startIndex + limit);

	const averageScore =
		totalParticipants > 0
			? Math.round((totalMarksSum / totalParticipants) * 100) / 100
			: 0;

	const passingRate =
		totalParticipants > 0
			? Math.round((passedCount / totalParticipants) * 100 * 100) / 100
			: 0;

	return {
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		totalParticipants,
		totalMarks: assessment.totalMarks,
		passingScore: assessment.passingScore,
		averageScore,
		highestScore,
		lowestScore,
		passingRate,
		isPublished: Boolean(latestPublishedAt),
		publishedAt: latestPublishedAt,
		rankings: paginated,
		meta: {
			page,
			limit,
			total,
			totalPages,
		},
	};
};

// ============================================================================
// 5. publishAssessmentResult
// ============================================================================

/**
 * Publishes final assessment results for all participants, setting official publish timestamp
 * and marking assessment status as COMPLETED.
 */
export const publishAssessmentResult = async (
	assessmentId: string,
	user: RequestUser,
): Promise<IPublishResultResponse> => {
	if (!assessmentId || assessmentId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Assessment ID is required.");
	}

	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			attempts: {
				include: {
					result: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	// Authorize publisher: Assessment Creator, Company Admin/Owner, Super Admin
	verifyAssessmentAccess(user, assessment, "publish assessment results");

	const publishTime = new Date();

	// Generate and synchronize all candidate rankings first
	const leaderboard = await generateAssessmentRanking(assessmentId, user, {
		limit: 1000,
	});

	// Atomically publish all result records and transition assessment status
	const totalAttempts = assessment.attempts.length;

	// Fetch all evaluated / submitted attempts to guarantee 100% are published regardless of pagination
	const evaluatedAttempts = await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId,
			status: {
				in: [
					AttemptStatus.EVALUATED,
					AttemptStatus.SUBMITTED,
					AttemptStatus.EXPIRED,
				],
			},
		},
		select: {
			id: true,
			obtainedMarks: true,
			totalMarks: true,
			percentage: true,
			startedAt: true,
			submittedAt: true,
			createdAt: true,
		},
	});

	// Sort with canonical tie-breaking rules
	const sorted = evaluatedAttempts.slice().sort((a, b) => {
		if (b.obtainedMarks !== a.obtainedMarks) {
			return b.obtainedMarks - a.obtainedMarks;
		}

		const timeA =
			a.submittedAt && a.startedAt
				? Math.round((a.submittedAt.getTime() - a.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;
		const timeB =
			b.submittedAt && b.startedAt
				? Math.round((b.submittedAt.getTime() - b.startedAt.getTime()) / 1000)
				: Number.MAX_SAFE_INTEGER;

		if (timeA !== timeB) return timeA - timeB;

		const submitA = a.submittedAt ? a.submittedAt.getTime() : a.createdAt.getTime();
		const submitB = b.submittedAt ? b.submittedAt.getTime() : b.createdAt.getTime();
		return submitA - submitB;
	});

	let totalEvaluated = 0;
	let passedCount = 0;
	let failedCount = 0;
	let totalScoreSum = 0;

	await prisma.$transaction(async (tx) => {
		// Upsert and publish results for ALL evaluated participants
		for (let index = 0; index < sorted.length; index++) {
			const attemptItem = sorted[index];
			const currentRank = index + 1;
			totalEvaluated++;
			totalScoreSum += attemptItem.obtainedMarks;

			const status = determineResultStatus(
				attemptItem.obtainedMarks,
				attemptItem.totalMarks || assessment.totalMarks,
				assessment.passingScore,
			);

			if (status === ResultStatus.PASSED) {
				passedCount++;
			} else {
				failedCount++;
			}

			await tx.result.upsert({
				where: { attemptId: attemptItem.id },
				update: {
					totalMarks: attemptItem.totalMarks || assessment.totalMarks,
					obtainedMarks: attemptItem.obtainedMarks,
					percentage: attemptItem.percentage,
					passingScore: assessment.passingScore,
					rank: currentRank,
					status,
					publishedAt: publishTime,
				},
				create: {
					attemptId: attemptItem.id,
					totalMarks: attemptItem.totalMarks || assessment.totalMarks,
					obtainedMarks: attemptItem.obtainedMarks,
					percentage: attemptItem.percentage,
					passingScore: assessment.passingScore,
					rank: currentRank,
					status,
					publishedAt: publishTime,
				},
			});
		}

		// Update Assessment Status to COMPLETED if not already ARCHIVED
		await tx.assessment.update({
			where: { id: assessment.id },
			data: {
				status: AssessmentStatus.COMPLETED,
			},
		});
	});

	const averageScore =
		totalEvaluated > 0
			? Math.round((totalScoreSum / totalEvaluated) * 100) / 100
			: 0;

	const passingRate =
		totalEvaluated > 0
			? Math.round((passedCount / totalEvaluated) * 100 * 100) / 100
			: 0;

	return {
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		publishedAt: publishTime,
		totalAttempts,
		totalEvaluated,
		passedCount,
		failedCount,
		averageScore,
		passingRate,
	};
};

// ============================================================================
// 6. Supporting Methods: getCandidateResult & getMyResults
// ============================================================================

/**
 * Retrieves a candidate's specific assessment attempt result.
 */
export const getCandidateResult = async (
	attemptId: string,
	user: RequestUser,
): Promise<IAssessmentResultResponse> => {
	return await generateAssessmentResult(attemptId, user);
};

/**
 * Retrieves all assessment results for the currently logged-in candidate.
 */
export const getMyResults = async (
	user: RequestUser,
): Promise<IAssessmentResultResponse[]> => {
	if (!user?.userId) {
		throw new AppError(httpStatus.UNAUTHORIZED, "You must be logged in.");
	}

	const attempts = await prisma.assessmentAttempt.findMany({
		where: {
			candidateId: user.userId,
			status: {
				in: [
					AttemptStatus.EVALUATED,
					AttemptStatus.SUBMITTED,
					AttemptStatus.EXPIRED,
				],
			},
		},
		select: { id: true },
		orderBy: { createdAt: "desc" },
	});

	const results: IAssessmentResultResponse[] = [];
	for (const att of attempts) {
		try {
			const res = await generateAssessmentResult(att.id, user);
			results.push(res);
		} catch {
			// Skip attempts that cannot be processed
		}
	}

	return results;
};

// ============================================================================
// Export Service Object
// ============================================================================

export const RankingResultService = {
	determineResultStatus,
	calculateCandidateRank,
	generateAssessmentResult,
	generateAssessmentRanking,
	publishAssessmentResult,
	getCandidateResult,
	getMyResults,
};
