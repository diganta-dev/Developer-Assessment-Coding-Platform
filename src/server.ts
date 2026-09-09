import app from "./app";
import config from "./app/config";

import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import redisClient from "./app/lib/redis";
import {
	seedAssessmentCreator,
	seedCandidate,
	seedCompanyAdmin,
	seedCompanyRecruiter,
	seedEvaluator,
	seedSuperAdmin,
	seedTesterAdmin,
} from "./app/utils/seed";

const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");
		if (!redisClient.isOpen) {
			await redisClient.connect();
		}
		console.log("Connected to Redis successfully.");
		await transporter.verify();
		console.log("Node Mailer connected successfully");
		await seedSuperAdmin(); // Seed the super admin user
		await seedTesterAdmin(); // Seed the tester admin user
		await seedCompanyAdmin(); // Seed the company admin user
		await seedCompanyRecruiter(); // Seed the company recruiter user
		await seedAssessmentCreator(); // Seed the assessment creator user
		await seedEvaluator(); // Seed the evaluator user
		await seedCandidate(); // Seed the candidate user
		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
