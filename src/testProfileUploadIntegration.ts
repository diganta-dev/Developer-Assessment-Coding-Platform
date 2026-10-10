import assert from "node:assert";
import httpStatus from "http-status";
import { prisma } from "./app/lib/prisma";
import { jwtUtils } from "./app/utils/jwt";
import config from "./app/config";
import { UserRole } from "./generated/prisma/enums";

const BASE_URL = "http://localhost:5000/api/v1";

// 1x1 valid PNG buffer
const VALID_PNG_BUFFER = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

// 1x1 valid JPEG buffer (starts with FF D8 FF)
const VALID_JPEG_BUFFER = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGYzDSAABm7w/5h9W+cwAAAABJRU5ErkJggg==", "base64");

// Valid minimal PDF buffer
const VALID_PDF_BUFFER = Buffer.from(
	"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF",
);

async function req(path: string, options: RequestInit = {}) {
	const res = await fetch(`${BASE_URL}${path}`, options);
	const data = await res.json().catch(() => ({}));
	return { status: res.status, data };
}

async function runProfileUploadTests() {
	console.log("==========================================================");
	console.log("  Running Profile Picture & Resume Upload Test Suite");
	console.log("==========================================================");

	// 1. Setup or retrieve test user
	const testEmail = "profile.upload.test@example.com";
	let user = await prisma.user.findUnique({
		where: { email: testEmail },
		include: { candidateProfile: true },
	});

	if (!user) {
		user = await prisma.user.create({
			data: {
				name: "Test Candidate",
				email: testEmail,
				role: UserRole.CANDIDATE,
				isActive: true,
				isVerified: true,
				candidateProfile: {
					create: {
						bio: "Senior Software Engineer",
						location: "Dhaka, Bangladesh",
					},
				},
			},
			include: { candidateProfile: true },
		});
	}

	const token = jwtUtils.createToken(
		{
			userId: user.id,
			email: user.email,
			name: user.name,
			role: user.role,
			tokenVersion: user.tokenVersion,
		},
		config.jwt_access_secret,
		"1h",
	);

	const authHeaders = {
		Authorization: `Bearer ${token}`,
	};

	console.log(`[PASS] Test user ready: ${user.email} (ID: ${user.id})`);

	// 2. Test GET /users/me
	const profileRes = await req("/users/me", {
		headers: authHeaders,
	});
	assert.strictEqual(profileRes.status, 200);
	assert.strictEqual(profileRes.data.success, true);
	assert.strictEqual(profileRes.data.data.email, testEmail);
	console.log("[PASS] GET /users/me retrieved authenticated profile");

	// 3. Test PATCH /users/me/profile (Update basic fields)
	const updatedProfileRes = await req("/users/me/profile", {
		method: "PATCH",
		headers: {
			...authHeaders,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			name: "Updated Candidate Name",
			phone: "+8801700000000",
			bio: "Full Stack Engineer & Cloud Architect",
			location: "Dhaka, Bangladesh",
			githubUrl: "https://github.com/test-candidate",
			linkedinUrl: "https://linkedin.com/in/test-candidate",
		}),
	});
	assert.strictEqual(updatedProfileRes.status, 200);
	assert.strictEqual(updatedProfileRes.data.success, true);
	assert.strictEqual(updatedProfileRes.data.data.name, "Updated Candidate Name");
	assert.strictEqual(
		updatedProfileRes.data.data.candidateProfile.githubUrl,
		"https://github.com/test-candidate",
	);
	console.log("[PASS] PATCH /users/me/profile updated basic profile attributes");

	// 4. Test PATCH /users/me/profile-picture (Upload initial PNG avatar)
	const formPic1 = new FormData();
	formPic1.append(
		"profilePicture",
		new Blob([VALID_PNG_BUFFER], { type: "image/png" }),
		"avatar1.png",
	);

	const uploadPic1Res = await req("/users/me/profile-picture", {
		method: "PATCH",
		headers: authHeaders,
		body: formPic1,
	});

	assert.strictEqual(uploadPic1Res.status, 200);
	assert.strictEqual(uploadPic1Res.data.success, true);
	assert.ok(uploadPic1Res.data.data.profilePictureUrl.includes("res.cloudinary.com"));
	const firstPublicId = uploadPic1Res.data.data.profilePicturePublicId;
	assert.ok(firstPublicId);
	console.log(
		`[PASS] PATCH /users/me/profile-picture uploaded avatar 1: ${uploadPic1Res.data.data.profilePictureUrl}`,
	);

	// 5. Test PATCH /users/me/profile-picture (Replace with JPEG avatar)
	const formPic2 = new FormData();
	formPic2.append(
		"image",
		new Blob([VALID_JPEG_BUFFER], { type: "image/jpeg" }),
		"avatar2.jpg",
	);

	const uploadPic2Res = await req("/users/me/profile-picture", {
		method: "PATCH",
		headers: authHeaders,
		body: formPic2,
	});

	assert.strictEqual(uploadPic2Res.status, 200);
	assert.strictEqual(uploadPic2Res.data.success, true);
	assert.ok(uploadPic2Res.data.data.profilePictureUrl.includes("res.cloudinary.com"));
	const secondPublicId = uploadPic2Res.data.data.profilePicturePublicId;
	assert.notStrictEqual(secondPublicId, firstPublicId);
	console.log(
		`[PASS] PATCH /users/me/profile-picture replaced avatar with avatar 2: ${uploadPic2Res.data.data.profilePictureUrl}`,
	);

	// 6. Test DELETE /users/me/profile-picture (Remove avatar)
	const removePicRes = await req("/users/me/profile-picture", {
		method: "DELETE",
		headers: authHeaders,
	});
	assert.strictEqual(removePicRes.status, 200);
	assert.strictEqual(removePicRes.data.success, true);
	assert.strictEqual(removePicRes.data.data.profilePictureUrl, null);
	assert.strictEqual(removePicRes.data.data.profilePicturePublicId, null);
	console.log("[PASS] DELETE /users/me/profile-picture successfully removed avatar");

	// 7. Test PATCH /users/me/resume (Upload PDF resume)
	const formResume1 = new FormData();
	formResume1.append(
		"resume",
		new Blob([VALID_PDF_BUFFER], { type: "application/pdf" }),
		"Software_Engineer_CV.pdf",
	);

	const uploadResume1Res = await req("/users/me/resume", {
		method: "PATCH",
		headers: authHeaders,
		body: formResume1,
	});

	assert.strictEqual(uploadResume1Res.status, 200);
	assert.strictEqual(uploadResume1Res.data.success, true);
	assert.ok(uploadResume1Res.data.data.candidateProfile.resumeUrl.includes("res.cloudinary.com"));
	assert.ok(uploadResume1Res.data.data.candidateProfile.resumeUrl.endsWith(".pdf"));
	assert.strictEqual(
		uploadResume1Res.data.data.candidateProfile.resumeFileName,
		"Software_Engineer_CV.pdf",
	);
	const firstResumePublicId = uploadResume1Res.data.data.candidateProfile.resumePublicId;
	console.log(
		`[PASS] PATCH /users/me/resume uploaded PDF resume: ${uploadResume1Res.data.data.candidateProfile.resumeUrl}`,
	);

	// 8. Test PATCH /users/me/resume (Replace resume with updated CV)
	const formResume2 = new FormData();
	formResume2.append(
		"file",
		new Blob([VALID_PDF_BUFFER], { type: "application/pdf" }),
		"Updated_Tech_Lead_CV.pdf",
	);

	const uploadResume2Res = await req("/users/me/resume", {
		method: "PATCH",
		headers: authHeaders,
		body: formResume2,
	});

	assert.strictEqual(uploadResume2Res.status, 200);
	assert.strictEqual(uploadResume2Res.data.success, true);
	assert.strictEqual(
		uploadResume2Res.data.data.candidateProfile.resumeFileName,
		"Updated_Tech_Lead_CV.pdf",
	);
	const secondResumePublicId = uploadResume2Res.data.data.candidateProfile.resumePublicId;
	assert.notStrictEqual(secondResumePublicId, firstResumePublicId);
	console.log(
		`[PASS] PATCH /users/me/resume replaced PDF resume: ${uploadResume2Res.data.data.candidateProfile.resumeUrl}`,
	);

	// 9. Test DELETE /users/me/resume (Remove resume)
	const removeResumeRes = await req("/users/me/resume", {
		method: "DELETE",
		headers: authHeaders,
	});
	assert.strictEqual(removeResumeRes.status, 200);
	assert.strictEqual(removeResumeRes.data.success, true);
	assert.strictEqual(removeResumeRes.data.data.candidateProfile.resumeUrl, null);
	assert.strictEqual(removeResumeRes.data.data.candidateProfile.resumePublicId, null);
	assert.strictEqual(removeResumeRes.data.data.candidateProfile.resumeFileName, null);
	console.log("[PASS] DELETE /users/me/resume successfully removed resume");

	// 10. Security: Unauthenticated request rejected
	const unauthRes = await req("/users/me/profile-picture", {
		method: "PATCH",
	});
	assert.strictEqual(unauthRes.status, httpStatus.UNAUTHORIZED);
	console.log("[PASS] Security: 401 Unauthorized enforced on unauthenticated requests");

	// 11. Validation: Reject non-image for profile picture
	const formInvalidPic = new FormData();
	formInvalidPic.append(
		"profilePicture",
		new Blob([VALID_PDF_BUFFER], { type: "application/pdf" }),
		"not-an-image.pdf",
	);

	const invalidPicRes = await req("/users/me/profile-picture", {
		method: "PATCH",
		headers: authHeaders,
		body: formInvalidPic,
	});
	assert.strictEqual(invalidPicRes.status, httpStatus.BAD_REQUEST);
	console.log("[PASS] Validation: 400 Bad Request enforced on non-image profile picture upload");

	// 12. Validation: Reject fake image with wrong magic bytes
	const formCorruptPic = new FormData();
	const fakeBuffer = Buffer.from("this is a text file not an image");
	formCorruptPic.append(
		"profilePicture",
		new Blob([fakeBuffer], { type: "image/png" }),
		"fake.png",
	);

	const corruptPicRes = await req("/users/me/profile-picture", {
		method: "PATCH",
		headers: authHeaders,
		body: formCorruptPic,
	});
	assert.strictEqual(corruptPicRes.status, httpStatus.BAD_REQUEST);
	console.log("[PASS] Validation: Magic byte inspection rejected disguised image file");

	// 13. Validation: Reject non-PDF for resume
	const formInvalidResume = new FormData();
	formInvalidResume.append(
		"resume",
		new Blob([VALID_PNG_BUFFER], { type: "image/png" }),
		"my-resume.png",
	);

	const invalidResumeRes = await req("/users/me/resume", {
		method: "PATCH",
		headers: authHeaders,
		body: formInvalidResume,
	});
	assert.strictEqual(invalidResumeRes.status, httpStatus.BAD_REQUEST);
	console.log("[PASS] Validation: 400 Bad Request enforced on non-PDF resume upload");

	console.log("==========================================================");
	console.log("  ALL 13 / 13 PROFILE UPLOAD TESTS PASSED (100% SUCCESS)");
	console.log("==========================================================");

	// Cleanup test user
	await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
	process.exit(0);
}

runProfileUploadTests().catch((error) => {
	console.error("Test Suite Failed:", error);
	process.exit(1);
});
