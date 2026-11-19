import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
	type Application,
	type Request,
	type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config/index.js";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler.js";
import { notFound } from "./app/middleware/notFound.js";
import router from "./app/router/index.js";

const app: Application = express();

const cleanUrl = (url?: string) => url?.trim().replace(/\/+$/, "");

const rawOrigins = (config.frontend_url || "")
	.split(",")
	.map((u) => cleanUrl(u))
	.filter(Boolean) as string[];

const allowedOrigins = [
	...rawOrigins,
	"http://localhost:3000",
	"http://localhost:5173",
];

app.use(
	cors({
		origin: (origin, callback) => {
			const cleanOrigin = cleanUrl(origin);
			if (
				!origin ||
				(cleanOrigin && allowedOrigins.includes(cleanOrigin)) ||
				(cleanOrigin && allowedOrigins.some((allowed) => cleanOrigin.startsWith(allowed))) ||
				config.node_env === "development" ||
				(origin && origin.endsWith(".vercel.app"))
			) {
				callback(null, true);
			} else {
				callback(new Error("Not allowed by CORS"));
			}
		},
		credentials: true,
	}),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/", router);

// Basic route
app.get("/", async (req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Welcome to Developer Assessment & Coding Platform Backend",
	});
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
