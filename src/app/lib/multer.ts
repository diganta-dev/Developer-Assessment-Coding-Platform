import multer from "multer";
import httpStatus from "http-status";
import AppError from "../utils/AppError";

const storage = multer.memoryStorage();

// Profile picture upload middleware (Max 5MB, JPEG/PNG/WebP)
export const uploadProfilePicture = multer({
	storage,
	limits: {
		fileSize: 5 * 1024 * 1024, // 5MB
		files: 1,
	},
	fileFilter: (_req, file, cb) => {
		const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
		if (allowedMimes.includes(file.mimetype.toLowerCase())) {
			cb(null, true);
		} else {
			cb(
				new AppError(
					httpStatus.BAD_REQUEST,
					"Invalid image format. Allowed formats: JPEG, PNG, WebP.",
				),
			);
		}
	},
});

// Resume document upload middleware (Max 10MB, PDF)
export const uploadResume = multer({
	storage,
	limits: {
		fileSize: 10 * 1024 * 1024, // 10MB
		files: 1,
	},
	fileFilter: (_req, file, cb) => {
		const isPdfMime = file.mimetype.toLowerCase() === "application/pdf";
		const isPdfExt = file.originalname.toLowerCase().endsWith(".pdf");
		if (isPdfMime || isPdfExt) {
			cb(null, true);
		} else {
			cb(
				new AppError(
					httpStatus.BAD_REQUEST,
					"Invalid resume format. Only PDF documents are allowed.",
				),
			);
		}
	},
});

// Generic default export for backward compatibility
export const upload = multer({ storage });

/**
 * Validates actual binary content using magic bytes.
 * Prevents disguised files (e.g., .exe renamed to .png or .pdf).
 */
export const validateImageBuffer = (buffer: Buffer): void => {
	if (!buffer || buffer.length < 12) {
		throw new AppError(httpStatus.BAD_REQUEST, "Uploaded image file is empty or corrupted.");
	}

	const isJpeg =
		buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	const isPng =
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a;
	const isWebp =
		buffer.toString("ascii", 0, 4) === "RIFF" &&
		buffer.toString("ascii", 8, 12) === "WEBP";

	if (!isJpeg && !isPng && !isWebp) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Invalid image content. File signature does not match JPEG, PNG, or WebP.",
		);
	}
};

/**
 * Validates that binary content begins with PDF magic header '%PDF-'.
 */
export const validatePdfBuffer = (buffer: Buffer): void => {
	if (!buffer || buffer.length < 5) {
		throw new AppError(httpStatus.BAD_REQUEST, "Uploaded resume document is empty or corrupted.");
	}

	const header = buffer.toString("ascii", 0, 5);
	if (header !== "%PDF-") {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Invalid document content. File signature does not match PDF.",
		);
	}
};
