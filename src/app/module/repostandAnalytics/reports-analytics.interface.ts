import {
	AssessmentStatus,
	AttemptStatus,
	Difficulty,
	ProblemType,
	ResultStatus,
} from "../../../generated/prisma/enums";

// ============================================================================
// 1. Assessment Report Interfaces
// ============================================================================

export interface IQuestionPerformanceStat {
	problemId: string;
	title: string;
	type: ProblemType;
	difficulty: Difficulty;
	maxMarks: number;
	totalSubmissions: number;
	correctSubmissions: number;
	averageScore: number;
	accuracyRate: number; // percentage (0-100)
}

export interface IScoreDistributionBucket {
	range: string; // e.g. "0-19%", "20-39%", "40-59%", "60-79%", "80-100%"
	minPercent: number;
	maxPercent: number;
	count: number;
	percentageOfTotal: number;
}

export interface IAntiCheatSummary {
	totalEvents: number;
	flaggedCandidatesCount: number;
	eventBreakdown: Record<string, number>;
}

export interface IAssessmentReportResponse {
	reportId: string;
	assessmentId: string;
	assessmentTitle: string;
	companyId: string;
	companyName: string;
	status: AssessmentStatus;
	durationMinutes: number;
	totalMarks: number;
	passingScore: number | null;

	// Participation Funnel
	totalCandidates: number;
	invitedCandidates: number;
	startedCandidates: number;
	completedCandidates: number;
	completionRate: number; // percentage (0-100)

	// Outcome Metrics
	passedCandidates: number;
	failedCandidates: number;
	passRate: number; // percentage (0-100)
	failRate: number; // percentage (0-100)

	// Score Metrics
	averageScore: number;
	highestScore: number;
	lowestScore: number;
	medianScore: number;

	// Detailed Breakdowns
	scoreDistribution: IScoreDistributionBucket[];
	questionPerformance: IQuestionPerformanceStat[];
	antiCheatStatistics: IAntiCheatSummary;

	generatedAt: Date;
	updatedAt: Date;
}

// ============================================================================
// 2. Candidate Report Interfaces
// ============================================================================

export interface ICandidateAttemptSummary {
	attemptId: string;
	assessmentId: string;
	assessmentTitle: string;
	companyName: string;
	totalMarks: number;
	obtainedMarks: number;
	percentage: number;
	rank: number | null;
	status: ResultStatus;
	attemptStatus: AttemptStatus;
	timeTakenSeconds: number | null;
	submittedAt: Date | null;
	isPublished: boolean;
}

export interface ISkillMasteryBreakdown {
	problemType: ProblemType;
	totalProblemsEncountered: number;
	attemptedCount: number;
	averageScorePercentage: number;
	accuracyRate: number;
}

export interface ICandidateReportResponse {
	candidateId: string;
	name: string;
	email: string;
	profilePictureUrl: string | null;
	phone: string | null;
	bio: string | null;
	location: string | null;
	resumeUrl: string | null;
	githubUrl: string | null;
	linkedinUrl: string | null;

	// Aggregate metrics
	totalAssessmentsAttempted: number;
	totalCompleted: number;
	totalPassed: number;
	totalFailed: number;
	averagePercentage: number;
	highestPercentage: number;
	overallPassRate: number; // percentage

	// Skill Category Mastery
	skillMastery: ISkillMasteryBreakdown[];

	// Assessment History
	assessmentHistory: ICandidateAttemptSummary[];

	// Compliance
	totalAntiCheatViolations: number;
}

// ============================================================================
// 3. Company Report Interfaces
// ============================================================================

export interface ICompanyAssessmentMetric {
	assessmentId: string;
	title: string;
	status: AssessmentStatus;
	createdAt: Date;
	totalCandidates: number;
	completedCandidates: number;
	averageScore: number;
	passRate: number;
}

export interface ICompanyReportResponse {
	companyId: string;
	companyName: string;
	slug: string;
	email: string;
	logoUrl: string | null;
	website: string | null;

	// Executive Talent Metrics
	totalAssessmentsCreated: number;
	totalCandidatesInvited: number;
	totalCandidatesStarted: number;
	totalCandidatesCompleted: number;
	totalCandidatesPassed: number;

	companyAverageScore: number;
	overallHiringPassRate: number; // percentage
	talentPipelineFunnel: {
		invited: number;
		started: number;
		completed: number;
		passed: number;
		dropOffRate: number; // percentage of invited who did not complete
	};

	assessmentBreakdown: ICompanyAssessmentMetric[];
}

// ============================================================================
// 4. Score Distribution Interfaces
// ============================================================================

export interface IScoreDistribution {
	assessmentId: string;
	assessmentTitle: string;
	totalEvaluated: number;
	mean: number;
	median: number;
	standardDeviation: number;
	highestScore: number;
	lowestScore: number;
	quartiles: {
		q1: number; // 25th percentile
		q2: number; // 50th percentile (median)
		q3: number; // 75th percentile
	};
	buckets: IScoreDistributionBucket[];
}

// ============================================================================
// 5. Pass/Fail Statistics Interfaces
// ============================================================================

export interface IPassFailStatistics {
	assessmentId: string;
	assessmentTitle: string;
	passingScoreThreshold: number;
	passingScoreType: "CONFIGURED" | "DEFAULT_PERCENTAGE";
	totalEvaluated: number;
	passedCount: number;
	failedCount: number;
	passRate: number;
	failRate: number;
	averagePassedScore: number;
	averageFailedScore: number;
	nearMissCandidatesCount: number; // within 10% below passing score
}

// ============================================================================
// 6. Assessment Statistics Interfaces
// ============================================================================

export interface IDifficultyDistribution {
	difficulty: Difficulty;
	problemCount: number;
	totalMarks: number;
	averageEarnedMarks: number;
	averageAccuracyRate: number;
}

export interface IAssessmentStatistics {
	assessmentId: string;
	assessmentTitle: string;
	durationMinutes: number;
	totalMarks: number;
	passingScore: number | null;

	// Operational Attempt Breakdown
	attemptsByStatus: Record<AttemptStatus, number>;

	// Timing KPIs
	averageTimeTakenSeconds: number;
	fastestTimeTakenSeconds: number | null;
	slowestTimeTakenSeconds: number | null;

	// Submissions Breakdown
	totalSubmissions: number;
	submissionsByType: Record<ProblemType, number>;

	// Difficulty Breakdown
	difficultyDistribution: IDifficultyDistribution[];
}

// ============================================================================
// 7. Candidate Performance Diagnostic Interfaces
// ============================================================================

export interface ICohortBenchmark {
	cohortSize: number;
	cohortAverageScore: number;
	cohortAveragePercentage: number;
	cohortHighestScore: number;
	candidateScoreDiffFromAverage: number; // positive = above average
	percentileRank: number;
}

export interface IAttemptQuestionDiagnostic {
	problemId: string;
	title: string;
	type: ProblemType;
	difficulty: Difficulty;
	maxMarks: number;
	obtainedMarks: number;
	percentage: number;
	isCorrect: boolean;
	submissionStatus: string;
	executionTimeMs?: number | null;
	memoryUsedMb?: number | null;
	feedback?: string | null;
}

export interface IAntiCheatAuditLog {
	id: string;
	type: string;
	metadata: any;
	occurredAt: Date;
}

export interface ICandidatePerformanceDiagnostic {
	attemptId: string;
	assessmentId: string;
	assessmentTitle: string;
	candidateId: string;
	candidateName: string;
	candidateEmail: string;

	// Result summary
	totalMarks: number;
	obtainedMarks: number;
	percentage: number;
	rank: number | null;
	status: ResultStatus;
	attemptStatus: AttemptStatus;

	// Efficiency metrics
	timeTakenSeconds: number | null;
	durationMinutesAllocated: number;
	timeUtilizationPercentage: number; // (timeTaken / totalDuration) * 100

	// Cohort Comparison
	cohortBenchmark: ICohortBenchmark;

	// Detailed Breakdown
	questionDiagnostics: IAttemptQuestionDiagnostic[];

	// Integrity Audit
	antiCheatAuditTrail: IAntiCheatAuditLog[];
	antiCheatFlagged: boolean;
}
