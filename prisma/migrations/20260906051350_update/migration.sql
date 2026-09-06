/*
  Warnings:

  - Made the column `email` on table `Company` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "email" SET NOT NULL;
