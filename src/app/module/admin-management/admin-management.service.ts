import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/client";
import {
	AssessmentStatus,
	AttemptStatus,
	ResultStatus,
	SubmissionStatus,
	UserRole,
} from "../../../generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import AppError from "../../utils/AppError";
import type {
	IAdminAssessmentListItem,
	IAdminCompanyListItem,
	IAdminDashboardStats,
	IAdminSubmissionListItem,
	IAdminUserDetails,
	IAdminUserListItem,
	IAssessmentFilterQuery,
	ICompanyFilterQuery,
	IPaginationMeta,
	ISubmissionFilterQuery,
	ISystemStatistics,
	IUpdateUserStatusPayload,
	IUserFilterQuery,
} from "./admin-management.interface";

// ============================================================================
// Pagination Helper
// ============================================================================

function calculatePagination(query: { page?: number | string; limit?: number | string }) {
	const page = Math.max(1, Number(query.page) || 1);
	const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
	const skip = (page - 1) * limit;
	return { page, limit, skip };
}

// ============================================================================
// 1. getDashboardStatistics
// ============================================================================

/**
 * Aggregates high-level executive statistics and real-time platform KPIs across
 * users, companies, assessments, submissions, and 30-day activity velocity.
 */
const getDashboardStatistics = async (): Promise<IAdminDashboardStats> => {
	const now = new Date();
	const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Parallel queries for high-performance KPI aggregation
	const [
		totalUsers,
		candidatesCount,
		adminsCount,
		superAdminsCount,
		activeUsersCount,
		inactiveUsersCount,
		totalCompanies,
		verifiedCompanies,
		assessmentsByStatus,
		submissionsByStatus,
		attemptsStats,
		newUsersLast30Days,
		assessmentsCreatedLast30Days,
		submissionsLast30Days,
	] = await Promise.all([
		prisma.user.count(),
		prisma.user.count({ where: { role: UserRole.CANDIDATE } }),
		prisma.user.count({ where: { role: UserRole.ADMIN } }),
		prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } }),
		prisma.user.count({ where: { isActive: true } }),
		prisma.user.count({ where: { isActive: false } }),

		prisma.company.count(),
		prisma.company.count({ where: { isVerified: true } }),

		prisma.assessment.groupBy({
			by: ["status"],
			_count: { id: true },
		}),

		prisma.submission.groupBy({
			by: ["status"],
			_count: { id: true },
		}),

		prisma.assessmentAttempt.count(),

		prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
		prisma.assessment.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
		prisma.submission.count({ where: { submittedAt: { gte: thirtyDaysAgo } } }),
	]);

	// Map assessment counts by status
	const assessmentStatusMap: Record<AssessmentStatus, number> = {
		[AssessmentStatus.DRAFT]: 0,
		[AssessmentStatus.PUBLISHED]: 0,
		[AssessmentStatus.ACTIVE]: 0,
		[AssessmentStatus.COMPLETED]: 0,
		[AssessmentStatus.ARCHIVED]: 0,
	};
	let totalAssessments = 0;
	for (const item of assessmentsByStatus) {
		assessmentStatusMap[item.status] = item._count.id;
		totalAssessments += item._count.id;
	}

	// Map submission counts by status
	let totalSubmissions = 0;
	let passedSubmissions = 0;
	let failedSubmissions = 0;
	let pendingSubmissions = 0;
	let evaluatedSubmissions = 0;

	for (const item of submissionsByStatus) {
		totalSubmissions += item._count.id;
		if (item.status === SubmissionStatus.PASSED) passedSubmissions += item._count.id;
		else if (item.status === SubmissionStatus.FAILED) failedSubmissions += item._count.id;
		else if (item.status === SubmissionStatus.PENDING || item.status === SubmissionStatus.RUNNING) {
			pendingSubmissions += item._count.id;
		} else if (item.status === SubmissionStatus.EVALUATED) {
			evaluatedSubmissions += item._count.id;
		}
	}

	// Completed attempts & pass rate
	const [completedAttemptsCount, inProgressAttemptsCount, passedResultsCount] =
		await Promise.all([
			prisma.assessmentAttempt.count({
				where: {
					status: {
						in: [
							AttemptStatus.EVALUATED,
							AttemptStatus.SUBMITTED,
							AttemptStatus.EXPIRED,
						],
					},
				},
			}),
			prisma.assessmentAttempt.count({
				where: { status: AttemptStatus.IN_PROGRESS },
			}),
			prisma.result.count({
				where: { status: ResultStatus.PASSED },
			}),
		]);

	const overallPassRate =
		completedAttemptsCount > 0
			? Math.round((passedResultsCount / completedAttemptsCount) * 100 * 100) / 100
			: 0;

	return {
		users: {
			total: totalUsers,
			candidates: candidatesCount,
			admins: adminsCount,
			superAdmins: superAdminsCount,
			active: activeUsersCount,
			inactive: inactiveUsersCount,
		},
		companies: {
			total: totalCompanies,
			verified: verifiedCompanies,
			unverified: totalCompanies - verifiedCompanies,
		},
		assessments: {
			total: totalAssessments,
			draft: assessmentStatusMap[AssessmentStatus.DRAFT],
			published: assessmentStatusMap[AssessmentStatus.PUBLISHED],
			active: assessmentStatusMap[AssessmentStatus.ACTIVE],
			completed: assessmentStatusMap[AssessmentStatus.COMPLETED],
			archived: assessmentStatusMap[AssessmentStatus.ARCHIVED],
		},
		submissions: {
			total: totalSubmissions,
			passed: passedSubmissions,
			failed: failedSubmissions,
			pending: pendingSubmissions,
			evaluated: evaluatedSubmissions,
		},
		attempts: {
			total: attemptsStats,
			completed: completedAttemptsCount,
			inProgress: inProgressAttemptsCount,
			overallPassRate,
		},
		recentActivity: {
			newUsersLast30Days,
			assessmentsCreatedLast30Days,
			submissionsLast30Days,
		},
	};
};

// ============================================================================
// 2. getUsers
// ============================================================================

/**
 * Retrieves a paginated, filterable, and searchable directory of platform users
 * with credential sanitization and activity indicators.
 */
const getUsers = async (
	query: IUserFilterQuery,
): Promise<{ users: IAdminUserListItem[]; meta: IPaginationMeta }> => {
	const { page, limit, skip } = calculatePagination(query);

	const where: Prisma.UserWhereInput = {};

	// Search by name or email
	if (query.searchTerm && query.searchTerm.trim() !== "") {
		const term = query.searchTerm.trim();
		where.OR = [
			{ name: { contains: term, mode: "insensitive" } },
			{ email: { contains: term, mode: "insensitive" } },
		];
	}

	if (query.role) {
		where.role = query.role;
	}

	if (query.isActive !== undefined) {
		where.isActive = query.isActive === "true" || query.isActive === true;
	}

	if (query.isVerified !== undefined) {
		where.isVerified = query.isVerified === "true" || query.isVerified === true;
	}

	const validSortFields = [
		"createdAt",
		"updatedAt",
		"name",
		"email",
		"role",
		"isActive",
		"isVerified",
	];
	const sortBy = validSortFields.includes(query.sortBy || "")
		? query.sortBy!
		: "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const [total, userRecords] = await Promise.all([
		prisma.user.count({ where }),
		prisma.user.findMany({
			where,
			skip,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			select: {
				id: true,
				name: true,
				email: true,
				role: true,
				isActive: true,
				isVerified: true,
				profilePictureUrl: true,
				createdAt: true,
				updatedAt: true,
				companyMembers: {
					take: 1,
					include: {
						company: {
							select: { name: true },
						},
					},
				},
				_count: {
					select: {
						attempts: true,
						createdAssessments: true,
					},
				},
			},
		}),
	]);

	const users: IAdminUserListItem[] = userRecords.map((u) => ({
		id: u.id,
		name: u.name,
		email: u.email,
		role: u.role,
		isActive: u.isActive,
		isVerified: u.isVerified,
		profilePictureUrl: u.profilePictureUrl,
		createdAt: u.createdAt,
		updatedAt: u.updatedAt,
		companyName: u.companyMembers[0]?.company?.name ?? null,
		totalAttempts: u._count.attempts,
		totalCreatedAssessments: u._count.createdAssessments,
	}));

	return {
		users,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// ============================================================================
// 3. getUserDetails
// ============================================================================

/**
 * Retrieves a deep-dive user profile dossier with linked candidate metadata,
 * company memberships, and historical attempt trajectory.
 */
const getUserDetails = async (userId: string): Promise<IAdminUserDetails> => {
	if (!userId || userId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "User ID is required.");
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			candidateProfile: true,
			companyMembers: {
				include: {
					company: {
						select: { id: true, name: true },
					},
				},
			},
			attempts: {
				take: 10,
				orderBy: { createdAt: "desc" },
				include: {
					assessment: {
						select: { id: true, title: true },
					},
					result: {
						select: { status: true },
					},
				},
			},
			_count: {
				select: {
					attempts: true,
					createdAssessments: true,
				},
			},
		},
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	return {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
		isActive: user.isActive,
		isVerified: user.isVerified,
		profilePictureUrl: user.profilePictureUrl,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		companyName: user.companyMembers[0]?.company?.name ?? null,
		totalAttempts: user._count.attempts,
		totalCreatedAssessments: user._count.createdAssessments,
		phone: user.candidateProfile?.phone ?? null,
		bio: user.candidateProfile?.bio ?? null,
		location: user.candidateProfile?.location ?? null,
		resumeUrl: user.candidateProfile?.resumeUrl ?? null,
		githubUrl: user.candidateProfile?.githubUrl ?? null,
		linkedinUrl: user.candidateProfile?.linkedinUrl ?? null,
		companyMemberships: user.companyMembers.map((cm) => ({
			companyId: cm.companyId,
			companyName: cm.company.name,
			role: cm.role,
			joinedAt: cm.joinedAt,
		})),
		recentAttempts: user.attempts.map((att) => ({
			id: att.id,
			assessmentId: att.assessmentId,
			assessmentTitle: att.assessment.title,
			status: att.status,
			obtainedMarks: att.obtainedMarks,
			totalMarks: att.totalMarks,
			percentage: att.percentage,
			resultStatus: att.result?.status ?? null,
			createdAt: att.createdAt,
		})),
	};
};

// ============================================================================
// 4. updateUserStatus
// ============================================================================

/**
 * Modifies user lifecycle status (active/deactive, role, email verification).
 * Automatically revokes active JWT sessions by incrementing tokenVersion upon deactivation.
 */
const updateUserStatus = async (
	userId: string,
	payload: IUpdateUserStatusPayload,
	adminUser: RequestUser,
): Promise<IAdminUserListItem> => {
	if (!userId || userId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "User ID is required.");
	}

	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	// Hierarchy protection: ADMIN cannot modify SUPER_ADMIN
	if (
		existingUser.role === UserRole.SUPER_ADMIN &&
		adminUser.role !== UserRole.SUPER_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only Super Admins can modify other Super Admin accounts.",
		);
	}

	// Cannot assign SUPER_ADMIN role unless requester is SUPER_ADMIN
	if (
		payload.role === UserRole.SUPER_ADMIN &&
		adminUser.role !== UserRole.SUPER_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only Super Admins can promote users to Super Admin.",
		);
	}

	// Self-lockout prevention: cannot deactivate or demote own account
	if (userId === adminUser.userId) {
		if (payload.isActive === false) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You cannot deactivate your own administrative account.",
			);
		}
		if (payload.role !== undefined && payload.role !== adminUser.role) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You cannot change your own administrative role.",
			);
		}
	}

	const updateData: Prisma.UserUpdateInput = {};

	if (payload.role !== undefined) {
		updateData.role = payload.role;
	}

	if (payload.isVerified !== undefined) {
		updateData.isVerified = payload.isVerified;
	}

	if (payload.isActive !== undefined) {
		updateData.isActive = payload.isActive;
		// If account is deactivated, evict all active sessions immediately
		if (!payload.isActive) {
			updateData.tokenVersion = { increment: 1 };
		}
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: updateData,
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			isActive: true,
			isVerified: true,
			profilePictureUrl: true,
			createdAt: true,
			updatedAt: true,
			companyMembers: {
				take: 1,
				include: {
					company: {
						select: { name: true },
					},
				},
			},
			_count: {
				select: {
					attempts: true,
					createdAssessments: true,
				},
			},
		},
	});

	return {
		id: updated.id,
		name: updated.name,
		email: updated.email,
		role: updated.role,
		isActive: updated.isActive,
		isVerified: updated.isVerified,
		profilePictureUrl: updated.profilePictureUrl,
		createdAt: updated.createdAt,
		updatedAt: updated.updatedAt,
		companyName: updated.companyMembers[0]?.company?.name ?? null,
		totalAttempts: updated._count.attempts,
		totalCreatedAssessments: updated._count.createdAssessments,
	};
};

// ============================================================================
// 5. deleteUser
// ============================================================================

/**
 * Safely deletes a user account with strict authorization, cascade awareness,
 * and a guard preventing self-deletion by the requesting administrator.
 */
const deleteUser = async (
	userId: string,
	adminUser: RequestUser,
): Promise<{ success: boolean; message: string }> => {
	if (!userId || userId.trim() === "") {
		throw new AppError(httpStatus.BAD_REQUEST, "User ID is required.");
	}

	// Self-deletion guard
	if (userId === adminUser.userId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot delete your own administrative account.",
		);
	}

	const targetUser = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!targetUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	// Protection: Only SUPER_ADMIN can delete another SUPER_ADMIN
	if (
		targetUser.role === UserRole.SUPER_ADMIN &&
		adminUser.role !== UserRole.SUPER_ADMIN
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only Super Admins can delete Super Admin accounts.",
		);
	}

	// Foreign-key integrity check: user cannot be hard-deleted if they created live assessments or problems
	const [createdAssessmentsCount, createdProblemsCount] = await Promise.all([
		prisma.assessment.count({ where: { creatorId: userId } }),
		prisma.problem.count({ where: { createdById: userId } }),
	]);

	if (createdAssessmentsCount > 0 || createdProblemsCount > 0) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Cannot delete user '${targetUser.email}' because they are the creator of ${createdAssessmentsCount} assessment(s) and ${createdProblemsCount} problem(s). Please deactivate the account instead or remove the created assets first.`,
		);
	}

	await prisma.user.delete({
		where: { id: userId },
	});

	return {
		success: true,
		message: `User ${targetUser.email} has been deleted successfully.`,
	};
};

// ============================================================================
// 6. getCompanies
// ============================================================================

/**
 * Retrieves a paginated organization directory with member and assessment counts.
 */
const getCompanies = async (
	query: ICompanyFilterQuery,
): Promise<{ companies: IAdminCompanyListItem[]; meta: IPaginationMeta }> => {
	const { page, limit, skip } = calculatePagination(query);

	const where: Prisma.CompanyWhereInput = {};

	if (query.searchTerm && query.searchTerm.trim() !== "") {
		const term = query.searchTerm.trim();
		where.OR = [
			{ name: { contains: term, mode: "insensitive" } },
			{ slug: { contains: term, mode: "insensitive" } },
			{ email: { contains: term, mode: "insensitive" } },
		];
	}

	if (query.isVerified !== undefined) {
		where.isVerified = query.isVerified === "true" || query.isVerified === true;
	}

	const validSortFields = [
		"createdAt",
		"updatedAt",
		"name",
		"slug",
		"email",
		"isVerified",
	];
	const sortBy = validSortFields.includes(query.sortBy || "")
		? query.sortBy!
		: "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const [total, companyRecords] = await Promise.all([
		prisma.company.count({ where }),
		prisma.company.findMany({
			where,
			skip,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			select: {
				id: true,
				name: true,
				slug: true,
				email: true,
				logoUrl: true,
				website: true,
				isVerified: true,
				createdAt: true,
				updatedAt: true,
				_count: {
					select: {
						members: true,
						assessments: true,
					},
				},
			},
		}),
	]);

	const companies: IAdminCompanyListItem[] = companyRecords.map((c) => ({
		id: c.id,
		name: c.name,
		slug: c.slug,
		email: c.email,
		logoUrl: c.logoUrl,
		website: c.website,
		isVerified: c.isVerified,
		totalMembers: c._count.members,
		totalAssessments: c._count.assessments,
		createdAt: c.createdAt,
		updatedAt: c.updatedAt,
	}));

	return {
		companies,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// ============================================================================
// 7. getAssessments
// ============================================================================

/**
 * Global assessment observatory allowing administrators to monitor assessments,
 * lifecycle states, question counts, and candidate participation volumes.
 */
const getAssessments = async (
	query: IAssessmentFilterQuery,
): Promise<{ assessments: IAdminAssessmentListItem[]; meta: IPaginationMeta }> => {
	const { page, limit, skip } = calculatePagination(query);

	const where: Prisma.AssessmentWhereInput = {};

	if (query.searchTerm && query.searchTerm.trim() !== "") {
		const term = query.searchTerm.trim();
		where.OR = [
			{ title: { contains: term, mode: "insensitive" } },
			{ description: { contains: term, mode: "insensitive" } },
		];
	}

	if (query.status) {
		where.status = query.status;
	}

	if (query.companyId) {
		where.companyId = query.companyId;
	}

	if (query.creatorId) {
		where.creatorId = query.creatorId;
	}

	const validSortFields = [
		"createdAt",
		"updatedAt",
		"title",
		"status",
		"totalMarks",
		"durationMinutes",
		"startDate",
		"endDate",
	];
	const sortBy = validSortFields.includes(query.sortBy || "")
		? query.sortBy!
		: "createdAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const [total, records] = await Promise.all([
		prisma.assessment.count({ where }),
		prisma.assessment.findMany({
			where,
			skip,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
			include: {
				company: {
					select: { id: true, name: true },
				},
				creator: {
					select: { id: true, name: true },
				},
				_count: {
					select: {
						problems: true,
						attempts: true,
					},
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
					select: { id: true },
				},
			},
		}),
	]);

	const assessments: IAdminAssessmentListItem[] = records.map((a) => ({
		id: a.id,
		title: a.title,
		description: a.description,
		companyId: a.company.id,
		companyName: a.company.name,
		creatorId: a.creator.id,
		creatorName: a.creator.name,
		durationMinutes: a.durationMinutes,
		totalMarks: a.totalMarks,
		passingScore: a.passingScore,
		status: a.status,
		totalProblems: a._count.problems,
		totalAttempts: a._count.attempts,
		completedAttempts: a.attempts.length,
		startDate: a.startDate,
		endDate: a.endDate,
		createdAt: a.createdAt,
		updatedAt: a.updatedAt,
	}));

	return {
		assessments,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// ============================================================================
// 8. getSubmissions
// ============================================================================

/**
 * Cross-platform submission audit log providing granular inspection of candidate
 * code executions, runtime efficiency, and grading status.
 */
const getSubmissions = async (
	query: ISubmissionFilterQuery,
): Promise<{ submissions: IAdminSubmissionListItem[]; meta: IPaginationMeta }> => {
	const { page, limit, skip } = calculatePagination(query);

	const where: Prisma.SubmissionWhereInput = {};

	if (query.status) {
		where.status = query.status;
	}

	if (query.problemType) {
		where.problem = { type: query.problemType };
	}

	if (query.attemptId) {
		where.attemptId = query.attemptId;
	}

	if (query.problemId) {
		where.problemId = query.problemId;
	}

	if (query.candidateId) {
		where.attempt = { candidateId: query.candidateId };
	}

	if (query.searchTerm && query.searchTerm.trim() !== "") {
		const term = query.searchTerm.trim();
		where.OR = [
			{ problem: { title: { contains: term, mode: "insensitive" } } },
			{ attempt: { candidate: { name: { contains: term, mode: "insensitive" } } } },
			{ attempt: { candidate: { email: { contains: term, mode: "insensitive" } } } },
		];
	}

	const validSortFields = [
		"submittedAt",
		"status",
		"marks",
		"executionTimeMs",
		"memoryUsedMb",
	];
	const sortBy = validSortFields.includes(query.sortBy || "")
		? query.sortBy!
		: "submittedAt";
	const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

	const [total, submissionRecords] = await Promise.all([
		prisma.submission.count({ where }),
		prisma.submission.findMany({
			where,
			skip,
			take: limit,
			orderBy: { [sortBy]: sortOrder },
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
				attempt: {
					select: {
						id: true,
						candidate: {
							select: { id: true, name: true, email: true },
						},
					},
				},
			},
		}),
	]);

	const submissions: IAdminSubmissionListItem[] = submissionRecords.map((s) => ({
		id: s.id,
		attemptId: s.attemptId,
		candidateId: s.attempt.candidate.id,
		candidateName: s.attempt.candidate.name,
		candidateEmail: s.attempt.candidate.email,
		problemId: s.problem.id,
		problemTitle: s.problem.title,
		problemType: s.problem.type,
		problemDifficulty: s.problem.difficulty,
		status: s.status,
		marks: s.marks,
		maxMarks: s.problem.marks,
		isCorrect: s.isCorrect,
		executionTimeMs: s.executionTimeMs,
		memoryUsedMb: s.memoryUsedMb,
		submittedAt: s.submittedAt,
	}));

	return {
		submissions,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// ============================================================================
// 9. getSystemStatistics
// ============================================================================

/**
 * System and infrastructure telemetry including Node.js process memory metrics,
 * uptime, database record cardinality, and security incident totals.
 */
const getSystemStatistics = async (): Promise<ISystemStatistics> => {
	const mem = process.memoryUsage();
	const uptimeSeconds = Math.round(process.uptime());

	const [
		usersCount,
		companiesCount,
		companyMembersCount,
		assessmentsCount,
		problemsCount,
		attemptsCount,
		submissionsCount,
		evaluationsCount,
		resultsCount,
		antiCheatCount,
		antiCheatGroups,
		inactiveCount,
	] = await Promise.all([
		prisma.user.count(),
		prisma.company.count(),
		prisma.companyMember.count(),
		prisma.assessment.count(),
		prisma.problem.count(),
		prisma.assessmentAttempt.count(),
		prisma.submission.count(),
		prisma.evaluation.count(),
		prisma.result.count(),
		prisma.antiCheatEvent.count(),
		prisma.antiCheatEvent.groupBy({
			by: ["type"],
			_count: { id: true },
		}),
		prisma.user.count({ where: { isActive: false } }),
	]);

	const incidentsByType: Record<string, number> = {};
	for (const group of antiCheatGroups) {
		incidentsByType[group.type] = group._count.id;
	}

	return {
		environment: process.env.NODE_ENV || "development",
		nodeVersion: process.version,
		uptimeSeconds,
		processMemory: {
			heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
			heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
			rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
			externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
		},
		databaseCounts: {
			users: usersCount,
			companies: companiesCount,
			companyMembers: companyMembersCount,
			assessments: assessmentsCount,
			problems: problemsCount,
			assessmentAttempts: attemptsCount,
			submissions: submissionsCount,
			evaluations: evaluationsCount,
			results: resultsCount,
			antiCheatEvents: antiCheatCount,
		},
		security: {
			totalAntiCheatIncidents: antiCheatCount,
			incidentsByType,
			inactiveAccountsCount: inactiveCount,
		},
		timestamp: new Date(),
	};
};

// ============================================================================
// Service Export
// ============================================================================

export const AdminManagementService = {
	getDashboardStatistics,
	getUsers,
	getUserDetails,
	updateUserStatus,
	deleteUser,
	getCompanies,
	getAssessments,
	getSubmissions,
	getSystemStatistics,
};
