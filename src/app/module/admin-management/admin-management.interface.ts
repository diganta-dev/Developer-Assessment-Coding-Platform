import {
	AssessmentStatus,
	AttemptStatus,
	Difficulty,
	ProblemType,
	ResultStatus,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";

// ============================================================================
// Pagination & Common Query Types
// ============================================================================

export interface IPaginationQuery {
	page?: number | string;
	limit?: number | string;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	searchTerm?: string;
}

export interface IPaginationMeta {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
}

// ============================================================================
// 1. Dashboard Statistics Interfaces
// ============================================================================

export interface IAdminDashboardStats {
	users: {
		total: number;
		candidates: number;
		admins: number;
		superAdmins: number;
		active: number;
		inactive: number;
	};
	companies: {
		total: number;
		verified: number;
		unverified: number;
	};
	assessments: {
		total: number;
		draft: number;
		published: number;
		active: number;
		completed: number;
		archived: number;
	};
	submissions: {
		total: number;
		passed: number;
		failed: number;
		pending: number;
		evaluated: number;
	};
	attempts: {
		total: number;
		completed: number;
		inProgress: number;
		overallPassRate: number; // percentage
	};
	recentActivity: {
		newUsersLast30Days: number;
		assessmentsCreatedLast30Days: number;
		submissionsLast30Days: number;
	};
}

// ============================================================================
// 2. User Management Interfaces
// ============================================================================

export interface IUserFilterQuery extends IPaginationQuery {
	role?: UserRole;
	isActive?: boolean | string;
	isVerified?: boolean | string;
}

export interface IAdminUserListItem {
	id: string;
	name: string;
	email: string;
	role: UserRole;
	isActive: boolean;
	isVerified: boolean;
	profilePictureUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
	companyName?: string | null;
	totalAttempts: number;
	totalCreatedAssessments: number;
}

export interface IAdminUserDetails extends IAdminUserListItem {
	phone: string | null;
	bio: string | null;
	location: string | null;
	resumeUrl: string | null;
	githubUrl: string | null;
	linkedinUrl: string | null;
	companyMemberships: Array<{
		companyId: string;
		companyName: string;
		role: string;
		joinedAt: Date;
	}>;
	recentAttempts: Array<{
		id: string;
		assessmentId: string;
		assessmentTitle: string;
		status: AttemptStatus;
		obtainedMarks: number;
		totalMarks: number;
		percentage: number;
		resultStatus: ResultStatus | null;
		createdAt: Date;
	}>;
}

export interface IUpdateUserStatusPayload {
	isActive?: boolean;
	role?: UserRole;
	isVerified?: boolean;
}

// ============================================================================
// 3. Company Management Interfaces
// ============================================================================

export interface ICompanyFilterQuery extends IPaginationQuery {
	isVerified?: boolean | string;
}

export interface IAdminCompanyListItem {
	id: string;
	name: string;
	slug: string;
	email: string;
	logoUrl: string | null;
	website: string | null;
	isVerified: boolean;
	totalMembers: number;
	totalAssessments: number;
	createdAt: Date;
	updatedAt: Date;
}

// ============================================================================
// 4. Assessment Management Interfaces
// ============================================================================

export interface IAssessmentFilterQuery extends IPaginationQuery {
	status?: AssessmentStatus;
	companyId?: string;
	creatorId?: string;
}

export interface IAdminAssessmentListItem {
	id: string;
	title: string;
	description: string | null;
	companyId: string;
	companyName: string;
	creatorId: string;
	creatorName: string;
	durationMinutes: number;
	totalMarks: number;
	passingScore: number | null;
	status: AssessmentStatus;
	totalProblems: number;
	totalAttempts: number;
	completedAttempts: number;
	startDate: Date | null;
	endDate: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

// ============================================================================
// 5. Submission Management Interfaces
// ============================================================================

export interface ISubmissionFilterQuery extends IPaginationQuery {
	status?: SubmissionStatus;
	problemType?: ProblemType;
	attemptId?: string;
	candidateId?: string;
	problemId?: string;
}

export interface IAdminSubmissionListItem {
	id: string;
	attemptId: string;
	candidateId: string;
	candidateName: string;
	candidateEmail: string;
	problemId: string;
	problemTitle: string;
	problemType: ProblemType;
	problemDifficulty: Difficulty;
	status: SubmissionStatus;
	marks: number | null;
	maxMarks: number;
	isCorrect: boolean | null;
	executionTimeMs: number | null;
	memoryUsedMb: number | null;
	submittedAt: Date;
}

// ============================================================================
// 6. System Statistics Interfaces
// ============================================================================

export interface ISystemStatistics {
	environment: string;
	nodeVersion: string;
	uptimeSeconds: number;
	processMemory: {
		heapUsedMb: number;
		heapTotalMb: number;
		rssMb: number;
		externalMb: number;
	};
	databaseCounts: {
		users: number;
		companies: number;
		companyMembers: number;
		assessments: number;
		problems: number;
		assessmentAttempts: number;
		submissions: number;
		evaluations: number;
		results: number;
		antiCheatEvents: number;
	};
	security: {
		totalAntiCheatIncidents: number;
		incidentsByType: Record<string, number>;
		inactiveAccountsCount: number;
	};
	timestamp: Date;
}
