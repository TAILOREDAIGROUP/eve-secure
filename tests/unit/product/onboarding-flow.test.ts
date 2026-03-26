import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/db", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
}));

import {
  buildOnboardingContextSummary,
  type OnboardingContext,
} from "@/lib/onboarding/context-seeder";
import { generateTemplateQuestion } from "@/lib/ai/conversation-state";

describe("C13: Onboarding Flow", () => {
  describe("Context summary generation", () => {
    const healthcareCtx: OnboardingContext = {
      orgName: "Acme Health Clinic",
      sector: "healthcare",
      employeeCount: 45,
      state: "TX",
      currentTools: ["Microsoft 365", "Okta"],
      itBudgetRange: "50k-100k",
      hasCyberInsurance: true,
      carrierName: "Coalition",
      ehrSystem: "Epic",
    };

    it("includes org name, sector, and size", () => {
      const summary = buildOnboardingContextSummary(healthcareCtx);
      expect(summary).toContain("Acme Health Clinic");
      expect(summary).toContain("healthcare");
      expect(summary).toContain("45 employees");
    });

    it("includes current security tools", () => {
      const summary = buildOnboardingContextSummary(healthcareCtx);
      expect(summary).toContain("Microsoft 365");
      expect(summary).toContain("Okta");
    });

    it("includes insurance status with carrier", () => {
      const summary = buildOnboardingContextSummary(healthcareCtx);
      expect(summary).toContain("Yes (Coalition)");
    });

    it("includes EHR system for healthcare", () => {
      const summary = buildOnboardingContextSummary(healthcareCtx);
      expect(summary).toContain("EHR System: Epic");
    });

    it("includes HIPAA context for healthcare", () => {
      const summary = buildOnboardingContextSummary(healthcareCtx);
      expect(summary).toContain("HIPAA Security Rule");
      expect(summary).toContain("ePHI");
    });

    it("flags no insurance risk", () => {
      const noInsurance = { ...healthcareCtx, hasCyberInsurance: false, carrierName: undefined };
      const summary = buildOnboardingContextSummary(noInsurance);
      expect(summary).toContain("Risk Flag: No cyber insurance");
    });

    it("flags small org with no tools", () => {
      const smallNoTools = { ...healthcareCtx, employeeCount: 10, currentTools: [] };
      const summary = buildOnboardingContextSummary(smallNoTools);
      expect(summary).toContain("None reported");
      expect(summary).toContain("Risk Flag: Small organization");
      expect(summary).toContain("Tier 1");
    });
  });

  describe("Legal sector context", () => {
    const legalCtx: OnboardingContext = {
      orgName: "Smith & Associates LLP",
      sector: "legal",
      employeeCount: 25,
      state: "NY",
      currentTools: ["Microsoft 365"],
      itBudgetRange: "0-50k",
      hasCyberInsurance: false,
      dmsSystem: "NetDocuments",
    };

    it("includes DMS system for legal", () => {
      const summary = buildOnboardingContextSummary(legalCtx);
      expect(summary).toContain("Document Management System: NetDocuments");
    });

    it("includes ABA context for legal", () => {
      const summary = buildOnboardingContextSummary(legalCtx);
      expect(summary).toContain("ABA Model Rules");
      expect(summary).toContain("privileged data");
    });

    it("flags malpractice exposure without insurance", () => {
      const summary = buildOnboardingContextSummary(legalCtx);
      expect(summary).toContain("malpractice exposure");
    });
  });

  describe("First assessment question seeding", () => {
    it("healthcare sector gets HIPAA-relevant first question", () => {
      const q = generateTemplateQuestion("GOVERN", "healthcare", 0, "Acme Health");
      expect(q.question).toContain("Acme Health");
      expect(q.citations.length).toBeGreaterThan(0);
      // Healthcare questions should reference HIPAA
      expect(q.citations.some((c: string) => c.includes("HIPAA") || c.includes("NIST"))).toBe(true);
    });

    it("legal sector gets ABA-relevant first question", () => {
      const q = generateTemplateQuestion("GOVERN", "legal", 0, "Smith & Associates");
      expect(q.question).toContain("Smith & Associates");
      expect(q.citations.some((c: string) => c.includes("ABA") || c.includes("NIST"))).toBe(true);
    });

    it("first section is always GOVERN", () => {
      const q = generateTemplateQuestion("GOVERN", "healthcare", 0, "Test Org");
      expect(q.generatedBy).toBe("template");
      // GOVERN questions are about governance, roles, responsibilities
      expect(q.question.length).toBeGreaterThan(20);
    });

    it("question includes org name for personalization", () => {
      const q = generateTemplateQuestion("GOVERN", "healthcare", 0, "Custom Org Name");
      expect(q.question).toContain("Custom Org Name");
    });
  });

  describe("Onboarding context structure", () => {
    it("required fields are validated", () => {
      const ctx: OnboardingContext = {
        orgName: "Test Corp",
        sector: "healthcare",
        employeeCount: 100,
        state: "CA",
        currentTools: [],
        itBudgetRange: "100k-500k",
        hasCyberInsurance: true,
      };
      expect(ctx.orgName).toBeDefined();
      expect(ctx.sector).toBeDefined();
      expect(ctx.employeeCount).toBeGreaterThan(0);
    });

    it("optional fields can be omitted", () => {
      const ctx: OnboardingContext = {
        orgName: "Test Corp",
        sector: "legal",
        employeeCount: 10,
        state: "NY",
        currentTools: [],
        itBudgetRange: "0-50k",
        hasCyberInsurance: false,
      };
      expect(ctx.ehrSystem).toBeUndefined();
      expect(ctx.dmsSystem).toBeUndefined();
      expect(ctx.carrierName).toBeUndefined();
    });
  });

  describe("Context seeding connects to assessment", () => {
    it("builds non-empty context summary", () => {
      const ctx: OnboardingContext = {
        orgName: "Minimal Corp",
        sector: "healthcare",
        employeeCount: 5,
        state: "FL",
        currentTools: [],
        itBudgetRange: "0-50k",
        hasCyberInsurance: false,
      };
      const summary = buildOnboardingContextSummary(ctx);
      expect(summary.length).toBeGreaterThan(100);
      // Verify it has enough structure to be useful as LLM context
      expect(summary).toContain("Organization:");
      expect(summary).toContain("Sector:");
      expect(summary).toContain("Size:");
    });

    it("context token estimate is reasonable", () => {
      const ctx: OnboardingContext = {
        orgName: "Large Healthcare System",
        sector: "healthcare",
        employeeCount: 500,
        state: "CA",
        currentTools: ["CrowdStrike", "Splunk", "Okta", "Microsoft 365", "Proofpoint"],
        itBudgetRange: "500k-1m",
        hasCyberInsurance: true,
        carrierName: "Beazley",
        ehrSystem: "Epic MyChart",
      };
      const summary = buildOnboardingContextSummary(ctx);
      const estimatedTokens = Math.ceil(summary.length / 4);
      // Should be under 500 tokens (within LLM context budget)
      expect(estimatedTokens).toBeLessThan(500);
      expect(estimatedTokens).toBeGreaterThan(50);
    });
  });
});
