import bcrypt from "bcryptjs";
import { CompanyMemberRole, UserRole } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";

/**
 * Helper to ensure a verified test company exists before linking company members
 */
const getOrCreateTestCompany = async () => {
	const existingCompany = await prisma.company.findFirst({
		where: {
			slug: config.test_company_slug,
		},
	});

	if (existingCompany) {
		return existingCompany;
	}

	return await prisma.company.create({
		data: {
			name: config.test_company_name,
			slug: config.test_company_slug,
			email: config.test_company_email,
			isVerified: true,
			description:
				"Official benchmark company for automated developer assessment and technical coding evaluations.",
			website: "https://devassess-tech.example.com",
		},
	});
};

// ============================================================================
// 1. Seed Super Admin (Platform Super Admin)
// ============================================================================
export const seedSuperAdmin = async () => {
	try {
		const isSuperAdminExists = await prisma.user.findFirst({
			where: {
				role: UserRole.SUPER_ADMIN,
			},
		});

		if (isSuperAdminExists) {
			console.log("Super Admin already exists");
			return;
		}

		const name = config.super_admin_name;
		const email = config.super_admin_email;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new Error(
				"Super Admin credentials are not set in the environment variables",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.SUPER_ADMIN,
				isVerified: true,
				isActive: true,
			},
		});

		console.log("Super Admin Created : ", superAdmin);
	} catch (error) {
		console.log("Error Seeding Super Admin : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.super_admin_email,
			},
		});
	}
};

// Alias matching testedPlatpromSuperadmin
export const seedPlatpromSuperadmin = seedSuperAdmin;

// ============================================================================
// 2. Seed Tester Admin (Platform Admin)
// ============================================================================
export const seedTesterAdmin = async () => {
	try {
		const isTesterAdminExist = await prisma.user.findUnique({
			where: {
				email: config.tester_admin_email,
			},
		});

		if (isTesterAdminExist) {
			console.log("Tester Admin Already Exists!");
			return;
		}

		const name = config.tester_admin_name;
		const email = config.tester_admin_email;
		const password = config.tester_admin_password;

		if (!name || !email || !password) {
			throw new Error(
				"Tester Admin Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const testerAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.ADMIN,
				isVerified: true,
				isActive: true,
			},
		});

		console.log("Tester Admin Created : ", testerAdmin);
	} catch (error) {
		console.log("Error Seeding Tester Admin : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.tester_admin_email,
			},
		});
	}
};

// Alias matching testedplatpromAdmin
export const seedPlatpromAdmin = seedTesterAdmin;

// ============================================================================
// 3. Seed Tested Company Admin
// ============================================================================
export const seedCompanyAdmin = async () => {
	try {
		const isCompanyAdminExist = await prisma.user.findUnique({
			where: {
				email: config.company_admin_email,
			},
		});

		if (isCompanyAdminExist) {
			console.log("Company Admin Already Exists!");
			return;
		}

		const name = config.company_admin_name;
		const email = config.company_admin_email;
		const password = config.company_admin_password;

		if (!name || !email || !password) {
			throw new Error(
				"Company Admin Name , Email, Password Missing In Env File!!!",
			);
		}

		const company = await getOrCreateTestCompany();

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const companyAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.COMPANY_ADMIN,
					},
				},
			},
		});

		console.log("Company Admin Created : ", companyAdmin);
	} catch (error) {
		console.log("Error Seeding Company Admin : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.company_admin_email,
			},
		});
	}
};

// ============================================================================
// 4. Seed Tested Company Recruiter
// ============================================================================
export const seedCompanyRecruiter = async () => {
	try {
		const isRecruiterExist = await prisma.user.findUnique({
			where: {
				email: config.company_recruiter_email,
			},
		});

		if (isRecruiterExist) {
			console.log("Company Recruiter Already Exists!");
			return;
		}

		const name = config.company_recruiter_name;
		const email = config.company_recruiter_email;
		const password = config.company_recruiter_password;

		if (!name || !email || !password) {
			throw new Error(
				"Company Recruiter Name , Email, Password Missing In Env File!!!",
			);
		}

		const company = await getOrCreateTestCompany();

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const companyRecruiter = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.COMPANY_OWNER,
					},
				},
			},
		});

		console.log("Company Recruiter Created : ", companyRecruiter);
	} catch (error) {
		console.log("Error Seeding Company Recruiter : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.company_recruiter_email,
			},
		});
	}
};

// ============================================================================
// 5. Seed Tested Assessment Creator
// ============================================================================
export const seedAssessmentCreator = async () => {
	try {
		const isCreatorExist = await prisma.user.findUnique({
			where: {
				email: config.assessment_creator_email,
			},
		});

		if (isCreatorExist) {
			console.log("Assessment Creator Already Exists!");
			return;
		}

		const name = config.assessment_creator_name;
		const email = config.assessment_creator_email;
		const password = config.assessment_creator_password;

		if (!name || !email || !password) {
			throw new Error(
				"Assessment Creator Name , Email, Password Missing In Env File!!!",
			);
		}

		const company = await getOrCreateTestCompany();

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const assessmentCreator = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.ASSESSMENT_CREATOR,
					},
				},
			},
		});

		console.log("Assessment Creator Created : ", assessmentCreator);
	} catch (error) {
		console.log("Error Seeding Assessment Creator : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.assessment_creator_email,
			},
		});
	}
};

// ============================================================================
// 6. Seed Tested Evaluator
// ============================================================================
export const seedEvaluator = async () => {
	try {
		const isEvaluatorExist = await prisma.user.findUnique({
			where: {
				email: config.evaluator_email,
			},
		});

		if (isEvaluatorExist) {
			console.log("Evaluator Already Exists!");
			return;
		}

		const name = config.evaluator_name;
		const email = config.evaluator_email;
		const password = config.evaluator_password;

		if (!name || !email || !password) {
			throw new Error(
				"Evaluator Name , Email, Password Missing In Env File!!!",
			);
		}

		const company = await getOrCreateTestCompany();

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const evaluator = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				companyMembers: {
					create: {
						companyId: company.id,
						role: CompanyMemberRole.EVALUATOR,
					},
				},
			},
		});

		console.log("Evaluator Created : ", evaluator);
	} catch (error) {
		console.log("Error Seeding Evaluator : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.evaluator_email,
			},
		});
	}
};

// ============================================================================
// 7. Seed Tested Candidate
// ============================================================================
export const seedCandidate = async () => {
	try {
		const isCandidateExist = await prisma.user.findUnique({
			where: {
				email: config.candidate_email,
			},
		});

		if (isCandidateExist) {
			console.log("Candidate Already Exists!");
			return;
		}

		const name = config.candidate_name;
		const email = config.candidate_email;
		const password = config.candidate_password;

		if (!name || !email || !password) {
			throw new Error(
				"Candidate Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			Number(config.bcrypt_salt_rounds),
		);

		const candidate = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.CANDIDATE,
				isVerified: true,
				isActive: true,
				candidateProfile: {
					create: {
						phone: "+1-555-0199",
						bio: "Full Stack Engineer specializing in TypeScript, Node.js and distributed systems.",
						location: "San Francisco, CA",
						githubUrl: "https://github.com/tested-candidate",
						linkedinUrl: "https://linkedin.com/in/tested-candidate",
					},
				},
			},
		});

		console.log("Candidate Created : ", candidate);
	} catch (error) {
		console.log("Error Seeding Candidate : ", error);

		await prisma.user.deleteMany({
			where: {
				email: config.candidate_email,
			},
		});
	}
};
