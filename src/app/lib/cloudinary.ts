import { v2 as cloudinary, type UploadApiResponse, type UploadApiErrorResponse } from "cloudinary";
import config from "../config";

// Initialize Cloudinary with project configuration
cloudinary.config({
	cloud_name: config.cloudinary.cloud_name,
	api_key: config.cloudinary.api_key,
	api_secret: config.cloudinary.api_secret,
	secure: true,
});

export interface ICloudinaryUploadResult {
	url: string;
	publicId: string;
	originalName?: string;
	bytes?: number;
	format?: string;
}

/**
 * Uploads a profile avatar image to Cloudinary with face-focused crop and optimization.
 */
export const uploadProfilePictureToCloudinary = async (
	buffer: Buffer,
	originalname = "avatar.jpg",
): Promise<ICloudinaryUploadResult> => {
	return new Promise((resolve, reject) => {
		const cleanName = originalname
			.replace(/\.[^/.]+$/, "")
			.replace(/[^a-zA-Z0-9_-]/g, "_")
			.slice(0, 30);
		const uniquePublicId = `${cleanName}_${Date.now()}`;

		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: "developer-assessment/profile-pictures",
				public_id: uniquePublicId,
				resource_type: "image",
				transformation: [
					{ width: 500, height: 500, crop: "fill", gravity: "face" },
					{ quality: "auto", fetch_format: "auto" },
				],
			},
			(error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
				if (error || !result) {
					return reject(
						new Error(error?.message || "Failed to upload image to Cloudinary"),
					);
				}
				resolve({
					url: result.secure_url,
					publicId: result.public_id,
					originalName: originalname,
					bytes: result.bytes,
					format: result.format,
				});
			},
		);

		uploadStream.end(buffer);
	});
};

/**
 * Uploads a raw document (PDF resume) to Cloudinary, ensuring proper raw resource type and delivery.
 */

/**
 * Uploads a company logo / branding picture to Cloudinary with fit/pad transformation.
 */
export const uploadCompanyLogoToCloudinary = async (
	buffer: Buffer,
	originalname = "company_logo.png",
): Promise<ICloudinaryUploadResult> => {
	return new Promise((resolve, reject) => {
		const cleanName = originalname
			.replace(/\.[^/.]+$/, "")
			.replace(/[^a-zA-Z0-9_-]/g, "_")
			.slice(0, 30);
		const uniquePublicId = `${cleanName}_${Date.now()}`;

		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: "developer-assessment/company-logos",
				public_id: uniquePublicId,
				resource_type: "image",
				transformation: [
					{ width: 500, height: 500, crop: "fit" },
					{ quality: "auto", fetch_format: "auto" },
				],
			},
			(error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
				if (error || !result) {
					return reject(
						new Error(error?.message || "Failed to upload company logo to Cloudinary"),
					);
				}
				resolve({
					url: result.secure_url,
					publicId: result.public_id,
					originalName: originalname,
					bytes: result.bytes,
					format: result.format,
				});
			},
		);

		uploadStream.end(buffer);
	});
};

export const uploadResumeToCloudinary = async (
	buffer: Buffer,
	originalname = "resume.pdf",
): Promise<ICloudinaryUploadResult> => {
	return new Promise((resolve, reject) => {
		// Clean and preserve readable filename with timestamp suffix
		const cleanBase = originalname
			.replace(/\.pdf$/i, "")
			.replace(/[^a-zA-Z0-9_-]/g, "_")
			.slice(0, 40);
		const publicId = `${cleanBase}_${Date.now()}.pdf`;

		const uploadStream = cloudinary.uploader.upload_stream(
			{
				folder: "developer-assessment/resumes",
				public_id: publicId,
				resource_type: "raw",
				format: "pdf",
			},
			(error?: UploadApiErrorResponse, result?: UploadApiResponse) => {
				if (error || !result) {
					return reject(
						new Error(error?.message || "Failed to upload resume to Cloudinary"),
					);
				}
				resolve({
					url: result.secure_url,
					publicId: result.public_id,
					originalName: originalname,
					bytes: result.bytes,
					format: result.format || "pdf",
				});
			},
		);

		uploadStream.end(buffer);
	});
};

/**
 * Safely removes a file asset from Cloudinary.
 * Never throws an unhandled error so cleanup failures do not report false database failures.
 */
export const deleteFromCloudinary = async (
	publicId?: string | null,
	resourceType: "image" | "raw" = "image",
): Promise<boolean> => {
	if (!publicId) return true;

	try {
		const result = await cloudinary.uploader.destroy(publicId, {
			resource_type: resourceType,
			invalidate: true,
		});
		return result?.result === "ok" || result?.result === "not found";
	} catch (error) {
		console.warn(`[Cloudinary Cleanup Warning] Failed to delete asset '${publicId}':`, error);
		return false;
	}
};

export { cloudinary };
