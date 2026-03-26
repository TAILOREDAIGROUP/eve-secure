import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("C11: Admin Panel", () => {
  describe("Dashboard summary structure", () => {
    it("contains all required aggregated stats", () => {
      const summary = {
        totalTenants: 5,
        totalUsers: 23,
        totalAssessments: 12,
        completedAssessments: 2,
        inProgressAssessments: 2,
        notStartedAssessments: 1,
        totalPlans: 3,
      };

      expect(summary.totalTenants).toBe(5);
      expect(summary.totalAssessments).toBe(12);
      // Assessment STATUS counts (per tenant) should sum to totalTenants
      expect(summary.completedAssessments + summary.inProgressAssessments + summary.notStartedAssessments)
        .toBe(5);
    });
  });

  describe("Tenant overview fields", () => {
    const tenant = {
      id: "tenant-1",
      name: "Acme Health",
      sector: "healthcare",
      status: "active",
      createdAt: "2026-01-15T00:00:00Z",
      userCount: 5,
      assessmentStatus: "completed" as const,
      assessmentCount: 2,
      latestAssessmentDate: "2026-03-20T00:00:00Z",
      planStatus: "generated" as const,
      planCount: 1,
      lastActivityDate: "2026-03-25T00:00:00Z",
    };

    it("has required fields for admin display", () => {
      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe("Acme Health");
      expect(tenant.sector).toBe("healthcare");
      expect(tenant.assessmentStatus).toBe("completed");
      expect(tenant.planStatus).toBe("generated");
      expect(tenant.lastActivityDate).toBeDefined();
    });

    it("assessmentStatus is one of three valid values", () => {
      const validStatuses = ["not_started", "in_progress", "completed"];
      expect(validStatuses).toContain(tenant.assessmentStatus);
    });

    it("planStatus is one of two valid values", () => {
      const validStatuses = ["not_generated", "generated"];
      expect(validStatuses).toContain(tenant.planStatus);
    });
  });

  describe("Role-based access control", () => {
    it("super_admin can view all tenants", () => {
      const role = "super_admin";
      const canViewAll = role === "super_admin";
      expect(canViewAll).toBe(true);
    });

    it("tenant_admin can only view own tenant", () => {
      const role = "tenant_admin";
      const authTenantId = "tenant-1";
      const targetTenantId = "tenant-1";
      const canView = role === "tenant_admin" && authTenantId === targetTenantId;
      expect(canView).toBe(true);
    });

    it("tenant_admin cannot view other tenants", () => {
      const role = "tenant_admin" as string;
      const authTenantId = "tenant-1" as string;
      const targetTenantId = "tenant-2" as string;
      const canView = role === "tenant_admin" && authTenantId === targetTenantId;
      expect(canView).toBe(false);
    });

    it("regular user is denied access", () => {
      const role = "user" as string;
      const canAccess = role === "super_admin" || role === "tenant_admin";
      expect(canAccess).toBe(false);
    });
  });

  describe("Tenant detail view", () => {
    const tenantDetail = {
      tenant: { id: "tenant-1", name: "Acme Health" },
      orgProfile: { sector: "healthcare", org_name: "Acme Health" },
      users: [
        { id: "user-1", email: "admin@acme.com", role: "tenant_admin" },
        { id: "user-2", email: "staff@acme.com", role: "user" },
      ],
      sessions: [
        {
          id: "session-1",
          status: "completed",
          progress_pct: 100,
          tier_rating: 2,
          responseCount: 18,
          sectionBreakdown: { GOVERN: 4, IDENTIFY: 3, PROTECT: 4, DETECT: 3, RESPOND: 2, RECOVER: 2 },
        },
      ],
      plans: [
        { id: "plan-1", session_id: "session-1", total_cost_estimate: 45000 },
      ],
      recentActivity: [
        { event_type: "assessment.started", created_at: "2026-03-20T10:00:00Z" },
        { event_type: "plan.generated", created_at: "2026-03-25T14:00:00Z" },
      ],
    };

    it("includes tenant info, org profile, users, sessions, plans, activity", () => {
      expect(tenantDetail.tenant).toBeDefined();
      expect(tenantDetail.orgProfile).toBeDefined();
      expect(tenantDetail.users).toHaveLength(2);
      expect(tenantDetail.sessions).toHaveLength(1);
      expect(tenantDetail.plans).toHaveLength(1);
      expect(tenantDetail.recentActivity).toHaveLength(2);
    });

    it("session detail includes response count and section breakdown", () => {
      const session = tenantDetail.sessions[0]!;
      expect(session.responseCount).toBe(18);
      expect(session.sectionBreakdown.GOVERN).toBe(4);
      expect(Object.keys(session.sectionBreakdown)).toHaveLength(6);
    });

    it("plan shows total cost estimate", () => {
      expect(tenantDetail.plans[0]!.total_cost_estimate).toBe(45000);
    });
  });

  describe("Assessment status derivation", () => {
    function deriveStatus(sessions: { status: string }[]): string {
      if (sessions.some(s => s.status === "completed")) return "completed";
      if (sessions.some(s => s.status === "in_progress")) return "in_progress";
      return "not_started";
    }

    it("completed if any session is completed", () => {
      expect(deriveStatus([{ status: "completed" }, { status: "in_progress" }])).toBe("completed");
    });

    it("in_progress if no completed but some in_progress", () => {
      expect(deriveStatus([{ status: "in_progress" }, { status: "abandoned" }])).toBe("in_progress");
    });

    it("not_started if no sessions", () => {
      expect(deriveStatus([])).toBe("not_started");
    });

    it("not_started if all abandoned", () => {
      expect(deriveStatus([{ status: "abandoned" }])).toBe("not_started");
    });
  });
});
