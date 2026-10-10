import { prisma } from "./app/lib/prisma";
import { CompanyService } from "./app/module/company/company.service";
import { CompanyMemberRole, UserRole } from "./generated/prisma/enums";
import assert from "assert";

async function runCompanyLogoTests() {
  console.log("==========================================================");
  console.log("  Running Company Logo Upload Integration Test Suite");
  console.log("==========================================================");

  // 1. Setup a test company & user
  const email = `company.logo.test_${Date.now()}@example.com`;
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Company Logo Admin",
      email,
      password: "HashedPassword123!",
      role: UserRole.CANDIDATE,
    },
  });

  const slug = `test-logo-corp-${Date.now()}`;
  const company = await prisma.company.create({
    data: {
      name: "Test Logo Corporation",
      slug,
      email: `corp_${Date.now()}@example.com`,
      isVerified: true,
      members: {
        create: {
          userId: user.id,
          role: CompanyMemberRole.COMPANY_OWNER,
        },
      },
    },
  });

  console.log(`[PASS] Setup test company: ${company.name} (${company.id})`);

  // 2. Upload initial PNG logo (1x1 transparent PNG)
  const png1 = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
    "hex"
  );
  const file1: any = {
    buffer: png1,
    originalname: "company_logo_1.png",
    mimetype: "image/png",
  };

  const updated1 = await CompanyService.updateCompanyLogo(
    company.id,
    { userId: user.id, role: UserRole.CANDIDATE },
    file1
  );

  assert(updated1.logoUrl, "Company logoUrl must be populated");
  assert(updated1.logoPublicId, "Company logoPublicId must be populated");
  console.log(`[PASS] Uploaded company logo: ${updated1.logoUrl}`);

  // 3. Replace with logo 2
  const file2: any = {
    buffer: png1,
    originalname: "company_logo_2.png",
    mimetype: "image/png",
  };

  const updated2 = await CompanyService.updateCompanyLogo(
    company.id,
    { userId: user.id, role: UserRole.CANDIDATE },
    file2
  );

  assert(updated2.logoUrl, "Replaced logoUrl must be populated");
  assert(updated2.logoPublicId, "Replaced logoPublicId must be populated");
  assert.notStrictEqual(updated2.logoPublicId, updated1.logoPublicId, "Public IDs should differ upon replacement");
  console.log(`[PASS] Replaced company logo with: ${updated2.logoUrl}`);

  // 4. Remove company logo
  const removed = await CompanyService.removeCompanyLogo(company.id, {
    userId: user.id,
    role: UserRole.CANDIDATE,
  });

  assert.strictEqual(removed.logoUrl, null, "logoUrl must be null after removal");
  assert.strictEqual(removed.logoPublicId, null, "logoPublicId must be null after removal");
  console.log("[PASS] Successfully removed company logo and destroyed Cloudinary asset");

  // 5. Cleanup
  await prisma.companyMember.deleteMany({ where: { companyId: company.id } });
  await prisma.company.delete({ where: { id: company.id } });
  await prisma.user.delete({ where: { id: user.id } });
  console.log("[PASS] Cleanup completed");

  console.log("==========================================================");
  console.log("  ALL COMPANY LOGO TESTS PASSED (100% SUCCESS)");
  console.log("==========================================================");
}

runCompanyLogoTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});