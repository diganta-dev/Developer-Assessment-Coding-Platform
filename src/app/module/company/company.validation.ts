import { z } from "zod";

export const CreateCompanyZodSchema = z.object({
  name: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name must be at most 100 characters"),

  email: z
    .string()
    .email("Follow the email format"),

  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
    .nullable(),

  website: z
    .string()
    .url("Invalid website URL")
    .optional()
    .or(z.literal(""))
    .nullable(),

  logoUrl: z
    .string()
    .url("Invalid logo URL")
    .optional()
    .or(z.literal(""))
    .nullable(),
});

export const UpdateCompanyZodSchema = z.object({
  name: z
    .string()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name must be at most 100 characters")
    .optional(),

  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional()
    .nullable(),

  website: z
    .string()
    .url("Invalid website URL")
    .optional()
    .or(z.literal(""))
    .nullable(),

  logoUrl: z
    .string()
    .url("Invalid logo URL")
    .optional()
    .or(z.literal(""))
    .nullable(),
});

export const VerifyCompanyZodSchema = z.object({
  email: z.string().email("Follow the email format"),
  otp: z.string().min(6, "OTP must be at least 6 characters"),
});

export const AddCompanyMemberZodSchema = z.object({
  email: z.string().email("Follow the email format"),
  role: z.enum([
    "COMPANY_ADMIN",
    "ASSESSMENT_CREATOR",
    "EVALUATOR",
  ] as const),
});

export const UpdateMemberRoleZodSchema = z.object({
  role: z.enum([
    "COMPANY_ADMIN",
    "ASSESSMENT_CREATOR",
    "EVALUATOR",
  ] as const),
});

export const CompanyValidation = {
  CreateCompanyZodSchema,
  UpdateCompanyZodSchema,
  VerifyCompanyZodSchema,
  AddCompanyMemberZodSchema,
  UpdateMemberRoleZodSchema,
};
