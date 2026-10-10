import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import {
	uploadProfilePictureToCloudinary,
	uploadResumeToCloudinary,
	deleteFromCloudinary,
} from "../../lib/cloudinary";
import { validateImageBuffer, validatePdfBuffer } from "../../lib/multer";
import AppError from "../../utils/AppError";
import type { IUpdateProfilePayload } from "./user.interface";

/**
 * Standard user inclusion query
 */
const userProfileInclude = {
	candidateProfile: true,
	companyMembers: {
		include: {
			company: true,
		},
	},
};

/**
 * Retrieves full user profile including candidate and company affiliations.
 */
const getProfile = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: userProfileInclude,
		omit: { password: true },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User profile not found");
	}

	return user;
};

/**
 * Updates basic profile attributes and candidate metadata.
 */
const updateProfile = async (userId: string, payload: IUpdateProfilePayload) => {
	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User profile not found");
	}

	// 1. Update User entity name if provided
	if (payload.name && payload.name.trim() !== existingUser.name) {
		await prisma.user.update({
			where: { id: userId },
			data: { name: payload.name.trim() },
		});
	}

	// 2. Upsert candidate profile details
	await prisma.candidateProfile.upsert({
		where: { userId },
		create: {
			userId,
			phone: payload.phone?.trim() || null,
			bio: payload.bio?.trim() || null,
			location: payload.location?.trim() || null,
			githubUrl: payload.githubUrl?.trim() || null,
			linkedinUrl: payload.linkedinUrl?.trim() || null,
		},
		update: {
			...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
			...(payload.bio !== undefined ? { bio: payload.bio?.trim() || null } : {}),
			...(payload.location !== undefined ? { location: payload.location?.trim() || null } : {}),
			...(payload.githubUrl !== undefined ? { githubUrl: payload.githubUrl?.trim() || null } : {}),
			...(payload.linkedinUrl !== undefined ? { linkedinUrl: payload.linkedinUrl?.trim() || null } : {}),
		},
	});

	return getProfile(userId);
};

/**
 * Uploads and updates the user's profile picture.
 * Ensures binary magic-byte validation, atomic updates, and Cloudinary cleanup.
 */
const updateProfilePicture = async (userId: string, file?: Express.Multer.File) => {
	if (!file || !file.buffer) {
		throw new AppError(httpStatus.BAD_REQUEST, "Profile picture file is required.");
	}

	// 1. Validate real binary signature
	validateImageBuffer(file.buffer);

	// 2. Retrieve existing public ID for cleanup
	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
		include: { candidateProfile: true },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	const oldPublicId =
		existingUser.profilePicturePublicId ||
		existingUser.candidateProfile?.profileImagePublicId;

	// 3. Upload to Cloudinary with face crop
	const uploadRes = await uploadProfilePictureToCloudinary(
		file.buffer,
		file.originalname || "profile-picture.jpg",
	);

	try {
		// 4. Update User and CandidateProfile records
		await prisma.$transaction(async (tx) => {
			await tx.user.update({
				where: { id: userId },
				data: {
					profilePictureUrl: uploadRes.url,
					profilePicturePublicId: uploadRes.publicId,
				},
			});

			await tx.candidateProfile.upsert({
				where: { userId },
				create: {
					userId,
					profileImage: uploadRes.url,
					profileImagePublicId: uploadRes.publicId,
				},
				update: {
					profileImage: uploadRes.url,
					profileImagePublicId: uploadRes.publicId,
				},
			});
		});

		// 5. Cleanup old Cloudinary asset safely
		if (oldPublicId && oldPublicId !== uploadRes.publicId) {
			await deleteFromCloudinary(oldPublicId, "image");
		}

		return getProfile(userId);
	} catch (dbError) {
		// Cleanup newly uploaded asset if database transaction fails
		await deleteFromCloudinary(uploadRes.publicId, "image");
		throw dbError;
	}
};

/**
 * Removes the profile picture and cleans up Cloudinary.
 */
const removeProfilePicture = async (userId: string) => {
	const existingUser = await prisma.user.findUnique({
		where: { id: userId },
		include: { candidateProfile: true },
	});

	if (!existingUser) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	const oldPublicId =
		existingUser.profilePicturePublicId ||
		existingUser.candidateProfile?.profileImagePublicId;

	await prisma.$transaction(async (tx) => {
		await tx.user.update({
			where: { id: userId },
			data: {
				profilePictureUrl: null,
				profilePicturePublicId: null,
			},
		});

		if (existingUser.candidateProfile) {
			await tx.candidateProfile.update({
				where: { userId },
				data: {
					profileImage: null,
					profileImagePublicId: null,
				},
			});
		}
	});

	if (oldPublicId) {
		await deleteFromCloudinary(oldPublicId, "image");
	}

	return getProfile(userId);
};

/**
 * Uploads and updates the user's PDF resume.
 * Ensures binary magic-byte validation, raw resource delivery, and Cloudinary cleanup.
 */
const updateResume = async (userId: string, file?: Express.Multer.File) => {
	if (!file || !file.buffer) {
		throw new AppError(httpStatus.BAD_REQUEST, "Resume file is required.");
	}

	// 1. Validate real binary PDF header
	validatePdfBuffer(file.buffer);

	// 2. Retrieve existing resume metadata
	const existingProfile = await prisma.candidateProfile.findUnique({
		where: { userId },
	});

	const oldResumePublicId = existingProfile?.resumePublicId;

	// 3. Upload raw document to Cloudinary
	const originalFilename = file.originalname || "resume.pdf";
	const uploadRes = await uploadResumeToCloudinary(file.buffer, originalFilename);

	try {
		// 4. Upsert candidate profile with resume URL and metadata
		await prisma.candidateProfile.upsert({
			where: { userId },
			create: {
				userId,
				resumeUrl: uploadRes.url,
				resumePublicId: uploadRes.publicId,
				resumeFileName: originalFilename,
			},
			update: {
				resumeUrl: uploadRes.url,
				resumePublicId: uploadRes.publicId,
				resumeFileName: originalFilename,
			},
		});

		// 5. Cleanup old raw resume safely
		if (oldResumePublicId && oldResumePublicId !== uploadRes.publicId) {
			await deleteFromCloudinary(oldResumePublicId, "raw");
		}

		return getProfile(userId);
	} catch (dbError) {
		// Cleanup newly uploaded raw asset if database update fails
		await deleteFromCloudinary(uploadRes.publicId, "raw");
		throw dbError;
	}
};

/**
 * Removes the resume and cleans up Cloudinary.
 */
const removeResume = async (userId: string) => {
	const existingProfile = await prisma.candidateProfile.findUnique({
		where: { userId },
	});

	if (!existingProfile || !existingProfile.resumeUrl) {
		return getProfile(userId);
	}

	const oldResumePublicId = existingProfile.resumePublicId;

	await prisma.candidateProfile.update({
		where: { userId },
		data: {
			resumeUrl: null,
			resumePublicId: null,
			resumeFileName: null,
		},
	});

	if (oldResumePublicId) {
		await deleteFromCloudinary(oldResumePublicId, "raw");
	}

	return getProfile(userId);
};

export const UserService = {
	getProfile,
	updateProfile,
	updateProfilePicture,
	removeProfilePicture,
	updateResume,
	removeResume,
};
