import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	app_name: process.env.APP_NAME || "Developer Assessment & Coding Platform",
	node_env: process.env.NODE_ENV || "development",
	port: process.env.PORT || 5000,
	database_url: process.env.DATABASE_URL,
	backend_url: process.env.BACKEND_URL,
	frontend_url: process.env.FRONTEND_URL,
	bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS),
	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN,
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN,
	application_name: process.env.APPLICATION_NAME,

	// Google OAuth
	google_client_id: process.env.GOOGLE_CLIENT_ID,

	// Admin Seed
	super_admin: {
		name: process.env.SUPER_ADMIN_NAME,
		email: process.env.SUPER_ADMIN_EMAIL,
		password: process.env.SUPER_ADMIN_PASSWORD,
	},
	tester_admin: {
		name: process.env.TESTER_ADMIN_NAME,
		email: process.env.TESTER_ADMIN_EMAIL,
		password: process.env.TESTER_ADMIN_PASSWORD,
	},

	// Seed variables (Flat properties)
	super_admin_name:
		process.env.SUPER_ADMIN_NAME ||
		process.env.TESTED_PLATFORM_SUPERADMIN_NAME ||
		"Tester-Super-Admin",
	super_admin_email:
		process.env.SUPER_ADMIN_EMAIL ||
		process.env.TESTED_PLATFORM_SUPERADMIN_EMAIL ||
		"superadmin@gmail.com",
	super_admin_password:
		process.env.SUPER_ADMIN_PASSWORD ||
		process.env.TESTED_PLATFORM_SUPERADMIN_PASSWORD ||
		"superAdmin33#",

	tester_admin_name:
		process.env.TESTER_ADMIN_NAME ||
		process.env.TESTED_PLATFORM_ADMIN_NAME ||
		"Tester-Admin",
	tester_admin_email:
		process.env.TESTER_ADMIN_EMAIL ||
		process.env.TESTED_PLATFORM_ADMIN_EMAIL ||
		"testadmin@gmail.com",
	tester_admin_password:
		process.env.TESTER_ADMIN_PASSWORD ||
		process.env.TESTED_PLATFORM_ADMIN_PASSWORD ||
		"TestAdmin33#",

	company_admin_name:
		process.env.TESTED_COMPANY_ADMIN_NAME || "Tested Company Admin",
	company_admin_email:
		process.env.TESTED_COMPANY_ADMIN_EMAIL ||
		"tested.companyadmin@devassess.com",
	company_admin_password:
		process.env.TESTED_COMPANY_ADMIN_PASSWORD || "CompanyAdmin123!#",

	company_recruiter_name:
		process.env.TESTED_COMPANY_RECRUITER_NAME || "Tested Company Recruiter",
	company_recruiter_email:
		process.env.TESTED_COMPANY_RECRUITER_EMAIL ||
		"tested.recruiter@devassess.com",
	company_recruiter_password:
		process.env.TESTED_COMPANY_RECRUITER_PASSWORD || "CompanyRecruiter123!#",

	assessment_creator_name:
		process.env.TESTED_ASSESSMENT_CREATOR_NAME || "Tested Assessment Creator",
	assessment_creator_email:
		process.env.TESTED_ASSESSMENT_CREATOR_EMAIL ||
		"tested.creator@devassess.com",
	assessment_creator_password:
		process.env.TESTED_ASSESSMENT_CREATOR_PASSWORD || "Creator123!#",

	evaluator_name: process.env.TESTED_EVALUATOR_NAME || "Tested Evaluator",
	evaluator_email:
		process.env.TESTED_EVALUATOR_EMAIL || "tested.evaluator@devassess.com",
	evaluator_password: process.env.TESTED_EVALUATOR_PASSWORD || "Evaluator123!#",

	candidate_name: process.env.TESTED_CANDIDATE_NAME || "Tested Candidate",
	candidate_email:
		process.env.TESTED_CANDIDATE_EMAIL || "tested.candidate@devassess.com",
	candidate_password: process.env.TESTED_CANDIDATE_PASSWORD || "Candidate123!#",

	test_company_name: process.env.TEST_COMPANY_NAME || "DevAssess Global Tech",
	test_company_slug: process.env.TEST_COMPANY_SLUG || "devassess-global-tech",
	test_company_email: process.env.TEST_COMPANY_EMAIL || "contact@devassess.com",

	// Redis
	redis: {
		host: process.env.REDIS_HOST,
		port: Number(process.env.REDIS_PORT) || 6379,
		username: process.env.REDIS_USERNAME || "default",
		password: process.env.REDIS_PASSWORD,
	},

	// SMTP / Email
	SENDER_EMAIL_USER: process.env.SENDER_EMAIL_USER || process.env.SMTP_USER,
	smtp: {
		user: process.env.SMTP_USER,
		password: process.env.SMTP_PASSWORD,
		sender_email: process.env.SENDER_EMAIL_USER,
	},

	// Cloudinary
	cloudinary: {
		cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
	},

	// Judge0 CE Code Execution
	judge0: {
		api_key: process.env.JUDGE0_API_KEY || "",
		api_host: process.env.JUDGE0_API_HOST || "judge0-ce.p.rapidapi.com",
		api_url:
			process.env.REQUEST_URL ||
			process.env.JUDGE0_API_URL ||
			"https://judge0-ce.p.rapidapi.com",
	},
};
