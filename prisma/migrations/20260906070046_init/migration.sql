/*
  Warnings:

  - The values [OWNER,ADMIN] on the enum `CompanyMemberRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CompanyMemberRole_new" AS ENUM ('COMPANY_OWNER', 'COMPANY_ADMIN', 'ASSESSMENT_CREATOR', 'EVALUATOR');
ALTER TABLE "CompanyMember" ALTER COLUMN "role" TYPE "CompanyMemberRole_new" USING ("role"::text::"CompanyMemberRole_new");
ALTER TYPE "CompanyMemberRole" RENAME TO "CompanyMemberRole_old";
ALTER TYPE "CompanyMemberRole_new" RENAME TO "CompanyMemberRole";
DROP TYPE "public"."CompanyMemberRole_old";
COMMIT;
