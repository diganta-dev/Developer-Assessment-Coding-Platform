import httpStatus from "http-status";
import {
	AssessmentStatus,
	AttemptStatus,
	Difficulty,
	ProblemType,
	ResultStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	IAntiCheatAuditLog,
	IAntiCheatSummary,
	IAssessmentReportResponse,
	IAssessmentStatistics,
	IAttemptQuestionDiagnostic,
	ICandidateAttemptSummary,
	ICandidatePerformanceDiagnostic,
	ICandidateReportResponse,
	ICohortBenchmark,
	ICompanyAssessmentMetric,
	ICompanyReportResponse,
	IDifficultyDistribution,
	IPassFailStatistics,
	IQuestionPerformanceStat,
	IScoreDistribution,
	IScoreDistributionBucket,
	ISkillMasteryBreakdown,
} from "./reports-analytics.interface";

// ============================================================================
// Statistical & Math Helpers
// ============================================================================

/**
 * Calculates the median of an array of numbers.
 */
function calculateMedian(numbers: number[]): number {
	if (numbers.length === 0) return 0;
	const sorted = numbers.slice().sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 !== 0) {
		return sorted[mid];
	}
	return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
}

/**
 * Calculates a specific percentile (0-100) from a sorted array of numbers.
 */
function calculatePercentile(sorted: number[], percentile: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const index = (percentile / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	const weight = index - lower;
	return (
		Math.round((sorted[lower] * (1 - weight) + sorted[upper] * weight) * 100) /
		100
	);
}

/**
 * Calculates the sample or population standard deviation.
 */
function calculateStandardDeviation(numbers: number[], mean: number): number {
	if (numbers.length <= 1) return 0;
	const variance =
		numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
		numbers.length;
	return Math.round(Math.sqrt(variance) * 100) / 100;
}

/**
 * Groups percentage scores into standard histogram buckets (0-19%, 20-39%, etc.).
 */
function buildScoreDistributionBuckets(
	percentages: number[],
): IScoreDistributionBucket[] {
	const ranges = [
		{ range: "0-19%", minPercent: 0, maxPercent: 20, isInclusiveMax: false },
		{ range: "20-39%", minPercent: 20, maxPercent: 40, isInclusiveMax: false },
		{ range: "40-59%", minPercent: 40, maxPercent: 60, isInclusiveMax: false },
		{ range: "60-79%", minPercent: 60, maxPercent: 80, isInclusiveMax: false },
		{ range: "80-100%", minPercent: 80, maxPercent: 100, isInclusiveMax: true },
	];

	const total = percentages.length;

	return ranges.map((bucket) => {
		const count = percentages.filter((p) => {
			if (bucket.isInclusiveMax) {
				return p >= bucket.minPercent && p <= bucket.maxPercent;
			}
			return p >= bucket.minPercent && p < bucket.maxPercent;
		}).length;
		const percentageOfTotal =
			total > 0 ? Math.round((count / total) * 100 * 100) / 100 : 0;
		return {
			range: bucket.range,
			minPercent: bucket.minPercent,
			maxPercent: bucket.maxPercent,
			count,
			percentageOfTotal,
		};
	});
}

// ============================================================================
// Authorization & Access Control Helpers
// ============================================================================

async function verifyAssessmentReportAccess(
	user: RequestUser | undefined,
	assessment: { companyId: string; creatorId: string },
	action = "view assessment analytics",
): Promise<void> {
	if (!user) return;

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	if (isPlatformAdmin) return;

	const isCreator = assessment.creatorId === user.userId;
	if (isCreator) return;

	const isDirectCompanyMember =
		Boolean(user.companyId) && user.companyId === assessment.companyId;
	if (isDirectCompanyMember) return;

	const membership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: user.userId,
				companyId: assessment.companyId,
			},
		},
	});

	if (!membership) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to ${action}.`,
		);
	}
}

async function verifyCompanyReportAccess(
	user: RequestUser | undefined,
	companyId: string,
	action = "view company analytics",
): Promise<void> {
	if (!user) return;

	const isPlatformAdmin =
		user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
	if (isPlatformAdmin) return;

	if (user.companyId === companyId) return;

	const membership = await prisma.companyMember.findUnique({
		where: {
			userId_companyId: {
				userId: user.userId,
				companyId,
			},
		},
	});

	if (!membership) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			`You do not have permission to ${action}.`,
		);
	}
}

// ============================================================================
// 1. generateAssessmentReport
// ============================================================================

/**
 * Generates an authoritative, comprehensive analytical report for an assessment,
 * computing participation funnels, score distributions, problem-by-problem performance,
 * anti-cheat statistics, and persists/caches the result in the AssessmentReport table.
 */
const generateAssessmentReport = async (
	assessmentId: string,
	user?: RequestUser,
): Promise<IAssessmentReportResponse> => {
	if (!assessmentId || assessmentId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Assessment ID is required.");
	}

	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			company: {
				select: { id: true, name: true },
			},
			invitations: {
				select: { id: true, status: true },
			},
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
				orderBy: { questionOrder: "asc" },
			},
			attempts: {
				include: {
					result: true,
					submissions: true,
					antiCheatEvents: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	await verifyAssessmentReportAccess(
		user,
		assessment,
		"generate assessment report",
	);

	const totalCandidates = assessment.attempts.length;
	const invitedCandidates = assessment.invitations.length;
	const startedCandidates = assessment.attempts.filter(
		(att) => att.status !== AttemptStatus.NOT_STARTED,
	).length;
	const completedCandidates = assessment.attempts.filter(
		(att) =>
			att.status === AttemptStatus.SUBMITTED ||
			att.status === AttemptStatus.EVALUATED ||
			att.status === AttemptStatus.EXPIRED,
	).length;

	const completionRate =
		startedCandidates > 0
			? Math.round((completedCandidates / startedCandidates) * 100 * 100) / 100
			: 0;

	// Completed / evaluated attempts metrics
	const evaluatedAttempts = assessment.attempts.filter(
		(att) =>
			att.status === AttemptStatus.EVALUATED ||
			att.status === AttemptStatus.SUBMITTED ||
			att.status === AttemptStatus.EXPIRED,
	);

	const scores = evaluatedAttempts.map((att) => att.obtainedMarks);
	const percentages = evaluatedAttempts.map((att) => att.percentage);

	let passedCandidates = 0;
	let failedCandidates = 0;

	for (const att of evaluatedAttempts) {
		const isPass =
			assessment.passingScore !== null && assessment.passingScore !== undefined
				? att.obtainedMarks >= assessment.passingScore
				: att.percentage >= 50;

		if (isPass) passedCandidates++;
		else failedCandidates++;
	}

	const passRate =
		completedCandidates > 0
			? Math.round((passedCandidates / completedCandidates) * 100 * 100) / 100
			: 0;
	const failRate =
		completedCandidates > 0
			? Math.round((failedCandidates / completedCandidates) * 100 * 100) / 100
			: 0;

	const totalScoreSum = scores.reduce((sum, val) => sum + val, 0);
	const averageScore =
		evaluatedAttempts.length > 0
			? Math.round((totalScoreSum / evaluatedAttempts.length) * 100) / 100
			: 0;

	const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
	const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
	const medianScore = calculateMedian(scores);

	// Score distribution histogram
	const scoreDistribution = buildScoreDistributionBuckets(percentages);

	// Question-by-question performance
	const allSubmissions = assessment.attempts.flatMap((att) => att.submissions);
	const questionPerformance: IQuestionPerformanceStat[] =
		assessment.problems.map((ap) => {
			const problemMaxMarks = ap.marks ?? ap.problem.marks;
			const problemSubmissions = allSubmissions.filter(
				(s) => s.problemId === ap.problemId,
			);
			const totalSubmissions = problemSubmissions.length;
			const correctSubmissions = problemSubmissions.filter(
				(s) =>
					Boolean(s.isCorrect) ||
					(problemMaxMarks > 0 && (s.marks ?? 0) === problemMaxMarks),
			).length;
			const marksSum = problemSubmissions.reduce(
				(sum, s) => sum + (s.marks ?? 0),
				0,
			);
			const avgScore =
				totalSubmissions > 0
					? Math.round((marksSum / totalSubmissions) * 100) / 100
					: 0;
			const accuracyRate =
				totalSubmissions > 0
					? Math.round((correctSubmissions / totalSubmissions) * 100 * 100) / 100
					: 0;

			return {
				problemId: ap.problemId,
				title: ap.problem.title,
				type: ap.problem.type,
				difficulty: ap.problem.difficulty,
				maxMarks: problemMaxMarks,
				totalSubmissions,
				correctSubmissions,
				averageScore: avgScore,
				accuracyRate,
			};
		});

	// Anti-cheat summary
	const allAntiCheatEvents = assessment.attempts.flatMap(
		(att) => att.antiCheatEvents,
	);
	const flaggedCandidatesSet = new Set<string>();
	const eventBreakdown: Record<string, number> = {};

	for (const event of allAntiCheatEvents) {
		eventBreakdown[event.type] = (eventBreakdown[event.type] || 0) + 1;
		flaggedCandidatesSet.add(event.attemptId);
	}

	const antiCheatStatistics: IAntiCheatSummary = {
		totalEvents: allAntiCheatEvents.length,
		flaggedCandidatesCount: flaggedCandidatesSet.size,
		eventBreakdown,
	};

	// Atomically persist/upsert into AssessmentReport table
	const savedReport = await prisma.assessmentReport.upsert({
		where: { assessmentId },
		update: {
			totalCandidates,
			invitedCandidates,
			startedCandidates,
			completedCandidates,
			passedCandidates,
			failedCandidates,
			averageScore,
			highestScore,
			lowestScore,
			completionRate,
			passRate,
			questionPerformance: questionPerformance as any,
			scoreDistribution: scoreDistribution as any,
			antiCheatStatistics: antiCheatStatistics as any,
			updatedAt: new Date(),
		},
		create: {
			assessmentId,
			totalCandidates,
			invitedCandidates,
			startedCandidates,
			completedCandidates,
			passedCandidates,
			failedCandidates,
			averageScore,
			highestScore,
			lowestScore,
			completionRate,
			passRate,
			questionPerformance: questionPerformance as any,
			scoreDistribution: scoreDistribution as any,
			antiCheatStatistics: antiCheatStatistics as any,
		},
	});

	return {
		reportId: savedReport.id,
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		companyId: assessment.company.id,
		companyName: assessment.company.name,
		status: assessment.status,
		durationMinutes: assessment.durationMinutes,
		totalMarks: assessment.totalMarks,
		passingScore: assessment.passingScore,
		totalCandidates,
		invitedCandidates,
		startedCandidates,
		completedCandidates,
		completionRate,
		passedCandidates,
		failedCandidates,
		passRate,
		failRate,
		averageScore,
		highestScore,
		lowestScore,
		medianScore,
		scoreDistribution,
		questionPerformance,
		antiCheatStatistics,
		generatedAt: savedReport.generatedAt,
		updatedAt: savedReport.updatedAt,
	};
};

// ============================================================================
// 2. generateCandidateReport
// ============================================================================

/**
 * Generates an individualized performance & career diagnostic report for a candidate,
 * aggregating metrics across all their assessment attempts, skill categories, and compliance history.
 */
const generateCandidateReport = async (
	candidateId: string,
	user?: RequestUser,
): Promise<ICandidateReportResponse> => {
	if (!candidateId || candidateId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Candidate ID is required.");
	}

	const candidate = await prisma.user.findUnique({
		where: { id: candidateId },
		include: {
			candidateProfile: true,
			attempts: {
				include: {
					assessment: {
						include: {
							company: {
								select: { id: true, name: true },
							},
						},
					},
					result: true,
					submissions: {
						include: {
							problem: {
								select: { id: true, type: true, marks: true },
							},
						},
					},
					antiCheatEvents: true,
				},
				orderBy: { createdAt: "desc" },
			},
		},
	});

	if (!candidate) {
		throw new AppError(httpStatus.NOT_FOUND, "Candidate not found.");
	}

	// Permission check: Candidate themselves, assessment creator/recruiter, or platform admin
	if (user) {
		const isSelf = user.userId === candidate.id;
		const isPlatformAdmin =
			user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
		const hasCompanyRelationship =
			Boolean(user.companyId) &&
			candidate.attempts.some(
				(att) => att.assessment.companyId === user.companyId,
			);

		if (!isSelf && !isPlatformAdmin && !hasCompanyRelationship) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this candidate's report.",
			);
		}
	}

	const totalAssessmentsAttempted = candidate.attempts.length;
	const completedAttempts = candidate.attempts.filter(
		(att) =>
			att.status === AttemptStatus.EVALUATED ||
			att.status === AttemptStatus.SUBMITTED ||
			att.status === AttemptStatus.EXPIRED,
	);
	const totalCompleted = completedAttempts.length;

	let totalPassed = 0;
	let totalFailed = 0;
	let percentageSum = 0;
	let highestPercentage = 0;

	const assessmentHistory: ICandidateAttemptSummary[] = candidate.attempts.map(
		(att) => {
			const isPassed =
				att.assessment.passingScore !== null &&
				att.assessment.passingScore !== undefined
					? att.obtainedMarks >= att.assessment.passingScore
					: att.percentage >= 50;

			const status = isPassed ? ResultStatus.PASSED : ResultStatus.FAILED;

			if (
				att.status === AttemptStatus.EVALUATED ||
				att.status === AttemptStatus.SUBMITTED ||
				att.status === AttemptStatus.EXPIRED
			) {
				if (isPassed) totalPassed++;
				else totalFailed++;

				percentageSum += att.percentage;
				if (att.percentage > highestPercentage) {
					highestPercentage = att.percentage;
				}
			}

			const timeTakenSeconds =
				att.submittedAt && att.startedAt
					? Math.round((att.submittedAt.getTime() - att.startedAt.getTime()) / 1000)
					: null;

			return {
				attemptId: att.id,
				assessmentId: att.assessmentId,
				assessmentTitle: att.assessment.title,
				companyName: att.assessment.company.name,
				totalMarks: att.totalMarks || att.assessment.totalMarks,
				obtainedMarks: att.obtainedMarks,
				percentage: att.percentage,
				rank: att.result?.rank ?? null,
				status,
				attemptStatus: att.status,
				timeTakenSeconds,
				submittedAt: att.submittedAt,
				isPublished: Boolean(att.result?.publishedAt),
			};
		},
	);

	const averagePercentage =
		totalCompleted > 0
			? Math.round((percentageSum / totalCompleted) * 100) / 100
			: 0;

	const overallPassRate =
		totalCompleted > 0
			? Math.round((totalPassed / totalCompleted) * 100 * 100) / 100
			: 0;

	// Skill Category Mastery (CODING, MCQ, WRITTEN)
	const problemTypes = [ProblemType.CODING, ProblemType.MCQ, ProblemType.WRITTEN];
	const allSubmissions = candidate.attempts.flatMap((att) => att.submissions);

	const skillMastery: ISkillMasteryBreakdown[] = problemTypes.map((type) => {
		const typeSubmissions = allSubmissions.filter((s) => s.problem.type === type);
		const attemptedCount = typeSubmissions.length;
		const totalMarksSum = typeSubmissions.reduce(
			(sum, s) => sum + s.problem.marks,
			0,
		);
		const earnedMarksSum = typeSubmissions.reduce(
			(sum, s) => sum + (s.marks ?? 0),
			0,
		);
		const correctCount = typeSubmissions.filter(
			(s) =>
				Boolean(s.isCorrect) ||
				(s.problem.marks > 0 && (s.marks ?? 0) === s.problem.marks),
		).length;

		const averageScorePercentage =
			totalMarksSum > 0
				? Math.round((earnedMarksSum / totalMarksSum) * 100 * 100) / 100
				: 0;

		const accuracyRate =
			attemptedCount > 0
				? Math.round((correctCount / attemptedCount) * 100 * 100) / 100
				: 0;

		return {
			problemType: type,
			totalProblemsEncountered: attemptedCount,
			attemptedCount,
			averageScorePercentage,
			accuracyRate,
		};
	});

	const totalAntiCheatViolations = candidate.attempts.reduce(
		(sum, att) => sum + att.antiCheatEvents.length,
		0,
	);

	return {
		candidateId: candidate.id,
		name: candidate.name,
		email: candidate.email,
		profilePictureUrl: candidate.profilePictureUrl,
		phone: candidate.candidateProfile?.phone ?? null,
		bio: candidate.candidateProfile?.bio ?? null,
		location: candidate.candidateProfile?.location ?? null,
		resumeUrl: candidate.candidateProfile?.resumeUrl ?? null,
		githubUrl: candidate.candidateProfile?.githubUrl ?? null,
		linkedinUrl: candidate.candidateProfile?.linkedinUrl ?? null,
		totalAssessmentsAttempted,
		totalCompleted,
		totalPassed,
		totalFailed,
		averagePercentage,
		highestPercentage,
		overallPassRate,
		skillMastery,
		assessmentHistory,
		totalAntiCheatViolations,
	};
};

// ============================================================================
// 3. generateCompanyReport
// ============================================================================

/**
 * Generates an executive-level talent recruitment analytics report for an organization,
 * analyzing hiring funnels, assessment benchmarks, candidate throughput, and hiring pass rates.
 */
const generateCompanyReport = async (
	companyId: string,
	user?: RequestUser,
): Promise<ICompanyReportResponse> => {
	if (!companyId || companyId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Company ID is required.");
	}

	const company = await prisma.company.findUnique({
		where: { id: companyId },
		include: {
			assessments: {
				include: {
					invitations: true,
					attempts: {
						include: {
							result: true,
						},
					},
				},
				orderBy: { createdAt: "desc" },
			},
		},
	});

	if (!company) {
		throw new AppError(httpStatus.NOT_FOUND, "Company not found.");
	}

	await verifyCompanyReportAccess(user, companyId, "generate company report");

	const totalAssessmentsCreated = company.assessments.length;
	let totalCandidatesInvited = 0;
	let totalCandidatesStarted = 0;
	let totalCandidatesCompleted = 0;
	let totalCandidatesPassed = 0;
	let allScoresSum = 0;
	let totalCompletedScoresCount = 0;

	const assessmentBreakdown: ICompanyAssessmentMetric[] = company.assessments.map(
		(assessment) => {
			const invitationsCount = assessment.invitations.length;
			totalCandidatesInvited += invitationsCount;

			const startedAttempts = assessment.attempts.filter(
				(att) => att.status !== AttemptStatus.NOT_STARTED,
			);
			totalCandidatesStarted += startedAttempts.length;

			const completedAttempts = assessment.attempts.filter(
				(att) =>
					att.status === AttemptStatus.EVALUATED ||
					att.status === AttemptStatus.SUBMITTED ||
					att.status === AttemptStatus.EXPIRED,
			);
			const completedCount = completedAttempts.length;
			totalCandidatesCompleted += completedCount;

			let passedCount = 0;
			let marksSum = 0;

			for (const att of completedAttempts) {
				marksSum += att.obtainedMarks;
				allScoresSum += att.obtainedMarks;
				totalCompletedScoresCount++;

				const isPass =
					assessment.passingScore !== null &&
					assessment.passingScore !== undefined
						? att.obtainedMarks >= assessment.passingScore
						: att.percentage >= 50;

				if (isPass) {
					passedCount++;
					totalCandidatesPassed++;
				}
			}

			const avgScore =
				completedCount > 0
					? Math.round((marksSum / completedCount) * 100) / 100
					: 0;

			const passRate =
				completedCount > 0
					? Math.round((passedCount / completedCount) * 100 * 100) / 100
					: 0;

			return {
				assessmentId: assessment.id,
				title: assessment.title,
				status: assessment.status,
				createdAt: assessment.createdAt,
				totalCandidates: assessment.attempts.length,
				completedCandidates: completedCount,
				averageScore: avgScore,
				passRate,
			};
		},
	);

	const companyAverageScore =
		totalCompletedScoresCount > 0
			? Math.round((allScoresSum / totalCompletedScoresCount) * 100) / 100
			: 0;

	const overallHiringPassRate =
		totalCandidatesCompleted > 0
			? Math.round(
					(totalCandidatesPassed / totalCandidatesCompleted) * 100 * 100,
				) / 100
			: 0;

	const dropOffRate =
		totalCandidatesInvited > 0
			? Math.round(
					((totalCandidatesInvited - totalCandidatesCompleted) /
						totalCandidatesInvited) *
						100 *
						100,
				) / 100
			: 0;

	return {
		companyId: company.id,
		companyName: company.name,
		slug: company.slug,
		email: company.email,
		logoUrl: company.logoUrl,
		website: company.website,
		totalAssessmentsCreated,
		totalCandidatesInvited,
		totalCandidatesStarted,
		totalCandidatesCompleted,
		totalCandidatesPassed,
		companyAverageScore,
		overallHiringPassRate,
		talentPipelineFunnel: {
			invited: totalCandidatesInvited,
			started: totalCandidatesStarted,
			completed: totalCandidatesCompleted,
			passed: totalCandidatesPassed,
			dropOffRate: Math.max(0, dropOffRate),
		},
		assessmentBreakdown,
	};
};

// ============================================================================
// 4. getScoreDistribution
// ============================================================================

/**
 * Calculates the score frequency distribution, quartiles, and statistical variance
 * for an assessment to power chart and histogram visual analytics.
 */
const getScoreDistribution = async (
	assessmentId: string,
	user?: RequestUser,
): Promise<IScoreDistribution> => {
	if (!assessmentId || assessmentId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Assessment ID is required.");
	}

	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			title: true,
			companyId: true,
			creatorId: true,
			attempts: {
				where: {
					status: {
						in: [
							AttemptStatus.EVALUATED,
							AttemptStatus.SUBMITTED,
							AttemptStatus.EXPIRED,
						],
					},
				},
				select: {
					obtainedMarks: true,
					percentage: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	await verifyAssessmentReportAccess(
		user,
		assessment,
		"view score distribution",
	);

	const scores = assessment.attempts.map((att) => att.obtainedMarks);
	const percentages = assessment.attempts.map((att) => att.percentage);
	const totalEvaluated = scores.length;

	const sortedScores = scores.slice().sort((a, b) => a - b);
	const totalSum = scores.reduce((sum, v) => sum + v, 0);

	const mean =
		totalEvaluated > 0 ? Math.round((totalSum / totalEvaluated) * 100) / 100 : 0;
	const median = calculateMedian(sortedScores);
	const standardDeviation = calculateStandardDeviation(scores, mean);
	const highestScore = sortedScores.length > 0 ? sortedScores[sortedScores.length - 1] : 0;
	const lowestScore = sortedScores.length > 0 ? sortedScores[0] : 0;

	const quartiles = {
		q1: calculatePercentile(sortedScores, 25),
		q2: median,
		q3: calculatePercentile(sortedScores, 75),
	};

	const buckets = buildScoreDistributionBuckets(percentages);

	return {
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		totalEvaluated,
		mean,
		median,
		standardDeviation,
		highestScore,
		lowestScore,
		quartiles,
		buckets,
	};
};

// ============================================================================
// 5. getPassFailStatistics
// ============================================================================

/**
 * Computes granular pass/fail statistics, threshold comparisons, cohort averages,
 * and identifies near-miss candidates who narrowly missed passing.
 */
const getPassFailStatistics = async (
	assessmentId: string,
	user?: RequestUser,
): Promise<IPassFailStatistics> => {
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
			attempts: {
				where: {
					status: {
						in: [
							AttemptStatus.EVALUATED,
							AttemptStatus.SUBMITTED,
							AttemptStatus.EXPIRED,
						],
					},
				},
				select: {
					obtainedMarks: true,
					percentage: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	await verifyAssessmentReportAccess(
		user,
		assessment,
		"view pass/fail statistics",
	);

	const hasExplicitPassingScore =
		assessment.passingScore !== null && assessment.passingScore !== undefined;

	const passingScoreThreshold = hasExplicitPassingScore
		? assessment.passingScore!
		: Math.round(assessment.totalMarks * 0.5 * 100) / 100;

	const passingScoreType = hasExplicitPassingScore
		? ("CONFIGURED" as const)
		: ("DEFAULT_PERCENTAGE" as const);

	const totalEvaluated = assessment.attempts.length;
	let passedCount = 0;
	let failedCount = 0;
	let passedScoreSum = 0;
	let failedScoreSum = 0;
	let nearMissCandidatesCount = 0;

	// Near miss window: score within 10% of totalMarks below passing threshold
	const nearMissMargin = (assessment.totalMarks || 100) * 0.1;
	const nearMissLowerBound = Math.max(0, passingScoreThreshold - nearMissMargin);

	for (const att of assessment.attempts) {
		const isPass = hasExplicitPassingScore
			? att.obtainedMarks >= assessment.passingScore!
			: att.percentage >= 50;

		if (isPass) {
			passedCount++;
			passedScoreSum += att.obtainedMarks;
		} else {
			failedCount++;
			failedScoreSum += att.obtainedMarks;

			if (
				att.obtainedMarks >= nearMissLowerBound &&
				att.obtainedMarks < passingScoreThreshold
			) {
				nearMissCandidatesCount++;
			}
		}
	}

	const passRate =
		totalEvaluated > 0
			? Math.round((passedCount / totalEvaluated) * 100 * 100) / 100
			: 0;

	const failRate =
		totalEvaluated > 0
			? Math.round((failedCount / totalEvaluated) * 100 * 100) / 100
			: 0;

	const averagePassedScore =
		passedCount > 0 ? Math.round((passedScoreSum / passedCount) * 100) / 100 : 0;

	const averageFailedScore =
		failedCount > 0 ? Math.round((failedScoreSum / failedCount) * 100) / 100 : 0;

	return {
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		passingScoreThreshold,
		passingScoreType,
		totalEvaluated,
		passedCount,
		failedCount,
		passRate,
		failRate,
		averagePassedScore,
		averageFailedScore,
		nearMissCandidatesCount,
	};
};

// ============================================================================
// 6. getAssessmentStatistics
// ============================================================================

/**
 * Calculates operational KPIs for an assessment including attempt status distributions,
 * timing performance (fastest, slowest, average duration), submissions by type, and difficulty metrics.
 */
const getAssessmentStatistics = async (
	assessmentId: string,
	user?: RequestUser,
): Promise<IAssessmentStatistics> => {
	if (!assessmentId || assessmentId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "Assessment ID is required.");
	}

	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			problems: {
				include: {
					problem: {
						select: {
							id: true,
							type: true,
							difficulty: true,
							marks: true,
						},
					},
				},
			},
			attempts: {
				include: {
					submissions: true,
				},
			},
		},
	});

	if (!assessment) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment not found.");
	}

	await verifyAssessmentReportAccess(
		user,
		assessment,
		"view assessment statistics",
	);

	// Operational attempts by status
	const attemptsByStatus: Record<AttemptStatus, number> = {
		[AttemptStatus.NOT_STARTED]: 0,
		[AttemptStatus.IN_PROGRESS]: 0,
		[AttemptStatus.SUBMITTED]: 0,
		[AttemptStatus.EXPIRED]: 0,
		[AttemptStatus.EVALUATED]: 0,
	};

	const completedDurations: number[] = [];

	for (const att of assessment.attempts) {
		attemptsByStatus[att.status] = (attemptsByStatus[att.status] || 0) + 1;

		if (att.submittedAt && att.startedAt) {
			const durationSec = Math.round(
				(att.submittedAt.getTime() - att.startedAt.getTime()) / 1000,
			);
			if (durationSec >= 0) {
				completedDurations.push(durationSec);
			}
		}
	}

	const durationSum = completedDurations.reduce((sum, d) => sum + d, 0);
	const averageTimeTakenSeconds =
		completedDurations.length > 0
			? Math.round((durationSum / completedDurations.length) * 100) / 100
			: 0;

	const fastestTimeTakenSeconds =
		completedDurations.length > 0 ? Math.min(...completedDurations) : null;

	const slowestTimeTakenSeconds =
		completedDurations.length > 0 ? Math.max(...completedDurations) : null;

	// Submissions by problem type
	const allSubmissions = assessment.attempts.flatMap((att) => att.submissions);
	const submissionsByType: Record<ProblemType, number> = {
		[ProblemType.CODING]: 0,
		[ProblemType.MCQ]: 0,
		[ProblemType.WRITTEN]: 0,
	};

	const problemTypeMap = new Map<string, ProblemType>();
	for (const ap of assessment.problems) {
		problemTypeMap.set(ap.problemId, ap.problem.type);
	}

	for (const sub of allSubmissions) {
		const type = problemTypeMap.get(sub.problemId);
		if (type && submissionsByType[type] !== undefined) {
			submissionsByType[type]++;
		}
	}

	// Difficulty breakdown
	const difficultyBuckets: Record<
		Difficulty,
		{ count: number; totalMarks: number; earnedMarksSum: number; totalSubmissions: number; correctSubmissions: number }
	> = {
		[Difficulty.EASY]: { count: 0, totalMarks: 0, earnedMarksSum: 0, totalSubmissions: 0, correctSubmissions: 0 },
		[Difficulty.MEDIUM]: { count: 0, totalMarks: 0, earnedMarksSum: 0, totalSubmissions: 0, correctSubmissions: 0 },
		[Difficulty.HARD]: { count: 0, totalMarks: 0, earnedMarksSum: 0, totalSubmissions: 0, correctSubmissions: 0 },
	};

	for (const ap of assessment.problems) {
		const diff = ap.problem.difficulty;
		const marks = ap.marks ?? ap.problem.marks;
		difficultyBuckets[diff].count++;
		difficultyBuckets[diff].totalMarks += marks;

		const problemSubs = allSubmissions.filter((s) => s.problemId === ap.problemId);
		for (const sub of problemSubs) {
			difficultyBuckets[diff].totalSubmissions++;
			difficultyBuckets[diff].earnedMarksSum += sub.marks ?? 0;
			if (
				Boolean(sub.isCorrect) ||
				(marks > 0 && (sub.marks ?? 0) === marks)
			) {
				difficultyBuckets[diff].correctSubmissions++;
			}
		}
	}

	const difficultyDistribution: IDifficultyDistribution[] = Object.entries(
		difficultyBuckets,
	).map(([diffKey, data]) => {
		const diff = diffKey as Difficulty;
		const averageEarnedMarks =
			data.totalSubmissions > 0
				? Math.round((data.earnedMarksSum / data.totalSubmissions) * 100) / 100
				: 0;

		const averageAccuracyRate =
			data.totalSubmissions > 0
				? Math.round(
						(data.correctSubmissions / data.totalSubmissions) * 100 * 100,
					) / 100
				: 0;

		return {
			difficulty: diff,
			problemCount: data.count,
			totalMarks: data.totalMarks,
			averageEarnedMarks,
			averageAccuracyRate,
		};
	});

	return {
		assessmentId: assessment.id,
		assessmentTitle: assessment.title,
		durationMinutes: assessment.durationMinutes,
		totalMarks: assessment.totalMarks,
		passingScore: assessment.passingScore,
		attemptsByStatus,
		averageTimeTakenSeconds,
		fastestTimeTakenSeconds,
		slowestTimeTakenSeconds,
		totalSubmissions: allSubmissions.length,
		submissionsByType,
		difficultyDistribution,
	};
};

// ============================================================================
// 7. getCandidatePerformance
// ============================================================================

/**
 * Detailed diagnostic performance report for an individual candidate attempt,
 * benchmarking their score and pacing against cohort averages and inspecting anti-cheat events.
 */
const getCandidatePerformance = async (
	attemptId: string,
	user?: RequestUser,
): Promise<ICandidatePerformanceDiagnostic> => {
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
						orderBy: { questionOrder: "asc" },
					},
					attempts: {
						where: {
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
							percentage: true,
						},
					},
				},
			},
			result: true,
			submissions: {
				include: {
					evaluations: {
						orderBy: { createdAt: "desc" },
						take: 1,
					},
				},
			},
			antiCheatEvents: {
				orderBy: { occurredAt: "asc" },
			},
		},
	});

	if (!attempt) {
		throw new AppError(httpStatus.NOT_FOUND, "Assessment attempt not found.");
	}

	// Permission verification: Candidate owner, assessment creator, company recruiter, or platform admin
	if (user) {
		const isSelf = attempt.candidateId === user.userId;
		const isPlatformAdmin =
			user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;
		const isCompanyMember =
			Boolean(user.companyId) &&
			user.companyId === attempt.assessment.companyId;
		const isCreator = attempt.assessment.creatorId === user.userId;

		if (!isSelf && !isPlatformAdmin && !isCompanyMember && !isCreator) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to view this performance report.",
			);
		}
	}

	// Cohort Benchmarks
	const cohortScores = attempt.assessment.attempts.map(
		(att) => att.obtainedMarks,
	);
	const cohortPercentages = attempt.assessment.attempts.map(
		(att) => att.percentage,
	);
	const cohortSize = cohortScores.length;
	const cohortScoreSum = cohortScores.reduce((sum, v) => sum + v, 0);
	const cohortPercentSum = cohortPercentages.reduce((sum, v) => sum + v, 0);

	const cohortAverageScore =
		cohortSize > 0 ? Math.round((cohortScoreSum / cohortSize) * 100) / 100 : 0;
	const cohortAveragePercentage =
		cohortSize > 0
			? Math.round((cohortPercentSum / cohortSize) * 100) / 100
			: 0;
	const cohortHighestScore = cohortScores.length > 0 ? Math.max(...cohortScores) : 0;

	const candidateScoreDiffFromAverage =
		Math.round((attempt.obtainedMarks - cohortAverageScore) * 100) / 100;

	// Calculate percentile within cohort
	const rank = attempt.result?.rank ?? null;
	const betterScoreCount = cohortScores.filter(
		(s) => s > attempt.obtainedMarks,
	).length;
	const effectiveRank = rank ?? (betterScoreCount + 1);

	const percentileRank =
		cohortSize > 1
			? Math.round(
					((cohortSize - effectiveRank) / (cohortSize - 1)) * 100 * 100,
				) / 100
			: 100;

	const cohortBenchmark: ICohortBenchmark = {
		cohortSize,
		cohortAverageScore,
		cohortAveragePercentage,
		cohortHighestScore,
		candidateScoreDiffFromAverage,
		percentileRank,
	};

	// Efficiency Metrics
	const durationMinutesAllocated = attempt.assessment.durationMinutes;
	const timeTakenSeconds =
		attempt.submittedAt && attempt.startedAt
			? Math.round((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000)
			: null;

	const totalAllocatedSeconds = durationMinutesAllocated * 60;
	const timeUtilizationPercentage =
		timeTakenSeconds !== null && totalAllocatedSeconds > 0
			? Math.round((timeTakenSeconds / totalAllocatedSeconds) * 100 * 100) / 100
			: 0;

	// Question Diagnostics
	const submissionMap = new Map(
		attempt.submissions.map((sub) => [sub.problemId, sub]),
	);

	const questionDiagnostics: IAttemptQuestionDiagnostic[] =
		attempt.assessment.problems.map((ap) => {
			const problemMaxMarks = ap.marks ?? ap.problem.marks;
			const sub = submissionMap.get(ap.problemId);

			const earnedMarks = sub?.marks ?? 0;
			const percentage =
				problemMaxMarks > 0
					? Math.round((earnedMarks / problemMaxMarks) * 100 * 100) / 100
					: 0;

			const isCorrect = Boolean(
				sub?.isCorrect ?? (sub && earnedMarks === problemMaxMarks),
			);

			return {
				problemId: ap.problemId,
				title: ap.problem.title,
				type: ap.problem.type,
				difficulty: ap.problem.difficulty,
				maxMarks: problemMaxMarks,
				obtainedMarks: earnedMarks,
				percentage,
				isCorrect,
				submissionStatus: sub ? sub.status : "NOT_SUBMITTED",
				executionTimeMs: sub?.executionTimeMs ?? null,
				memoryUsedMb: sub?.memoryUsedMb ?? null,
				feedback: sub?.evaluations[0]?.feedback ?? null,
			};
		});

	// Anti-cheat Audit Trail
	const antiCheatAuditTrail: IAntiCheatAuditLog[] = attempt.antiCheatEvents.map(
		(event) => ({
			id: event.id,
			type: event.type,
			metadata: event.metadata,
			occurredAt: event.occurredAt,
		}),
	);

	const isPass =
		attempt.assessment.passingScore !== null &&
		attempt.assessment.passingScore !== undefined
			? attempt.obtainedMarks >= attempt.assessment.passingScore
			: attempt.percentage >= 50;

	const status = isPass ? ResultStatus.PASSED : ResultStatus.FAILED;

	return {
		attemptId: attempt.id,
		assessmentId: attempt.assessmentId,
		assessmentTitle: attempt.assessment.title,
		candidateId: attempt.candidateId,
		candidateName: attempt.candidate.name,
		candidateEmail: attempt.candidate.email,
		totalMarks: attempt.totalMarks || attempt.assessment.totalMarks,
		obtainedMarks: attempt.obtainedMarks,
		percentage: attempt.percentage,
		rank,
		status,
		attemptStatus: attempt.status,
		timeTakenSeconds,
		durationMinutesAllocated,
		timeUtilizationPercentage,
		cohortBenchmark,
		questionDiagnostics,
		antiCheatAuditTrail,
		antiCheatFlagged: antiCheatAuditTrail.length > 0,
	};
};

// ============================================================================
// Service Export
// ============================================================================

export const ReportsAnalyticsService = {
	generateAssessmentReport,
	generateCandidateReport,
	generateCompanyReport,
	getScoreDistribution,
	getPassFailStatistics,
	getAssessmentStatistics,
	getCandidatePerformance,
};
