import { z } from "zod";

const updateProfileZodSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
	phone: z.string().max(25).optional().nullable(),
	bio: z.string().max(1000).optional().nullable(),
	location: z.string().max(150).optional().nullable(),
	githubUrl: z
		.string()
		.url("Invalid GitHub URL format")
		.optional()
		.nullable()
		.or(z.literal("")),
	linkedinUrl: z
		.string()
		.url("Invalid LinkedIn URL format")
		.optional()
		.nullable()
		.or(z.literal("")),
});

export const UserValidation = {
	updateProfileZodSchema,
};
