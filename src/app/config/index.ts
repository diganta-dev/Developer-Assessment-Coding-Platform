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
