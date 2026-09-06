import { z } from "zod";

export const CreateCompanyZodSchema = z.object({
  name: z
    .string(  "Company name is required" )
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name must be at most 100 characters"),

  email: z
    .string( "Email is required" )
    .email("Follow the email format"),

  description: z
    .string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),

  website: z
    .string()
    .url("Invalid website URL")
    .optional(), 
});

export const UpdateCompanyZodSchema = CreateCompanyZodSchema.partial();

export const CompanyValidation = {
  CreateCompanyZodSchema,
  UpdateCompanyZodSchema,
};
