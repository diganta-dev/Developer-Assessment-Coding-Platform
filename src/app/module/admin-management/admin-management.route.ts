import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminManagementController } from "./admin-management.controller";
import { AdminManagementValidation } from "./admin-management.validation";

const router = Router();

// ============================================================================
// Guard all routes with Admin / Super Admin Authorization
// ============================================================================

const adminAuth = auth(UserRole.SUPER_ADMIN, UserRole.ADMIN);

// 1. Dashboard Overview Statistics
router.get(
	"/dashboard-statistics",
	adminAuth,
	AdminManagementController.getDashboardStatistics,
);

// 2. System and Infrastructure Telemetry
router.get(
	"/system-statistics",
	adminAuth,
	AdminManagementController.getSystemStatistics,
);

// 3. User Management
router.get("/users", adminAuth, AdminManagementController.getUsers);
router.get("/users/:id", adminAuth, AdminManagementController.getUserDetails);
router.patch(
	"/users/:id/status",
	adminAuth,
	validateRequest(AdminManagementValidation.updateUserStatusValidation),
	AdminManagementController.updateUserStatus,
);
router.delete("/users/:id", adminAuth, AdminManagementController.deleteUser);

// 4. Company Management
router.get("/companies", adminAuth, AdminManagementController.getCompanies);

// 5. Assessment Management
router.get("/assessments", adminAuth, AdminManagementController.getAssessments);

// 6. Submissions Monitoring
router.get("/submissions", adminAuth, AdminManagementController.getSubmissions);

export const AdminManagementRoutes = router;
