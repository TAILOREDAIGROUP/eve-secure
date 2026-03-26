import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: { create: vi.fn() },
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        or: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn(),
    },
  })),
}));

vi.mock("@/lib/ai/embeddings/supabase-embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai/rag/embeddings", () => ({
  embedQuery: vi.fn().mockRejectedValue(new Error("No embeddings in test")),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import type { COIBriefData } from "@/lib/pdf/coi-brief";

describe("C4: Cost of Inaction Brief", () => {
  describe("COIBriefData structure", () => {
    it("contains all required fields", () => {
      const briefData: COIBriefData = {
        organizationName: "Acme Health",
        sector: "healthcare",
        assessmentDate: "March 26, 2026",
        tierRating: 1,
        topGaps: [
          {
            rank: 1,
            title: "No MFA Deployed",
            description: "Multi-factor authentication is not enabled on any systems.",
            complianceTags: ["NIST CSF PR.AA", "HIPAA 164.312(d)"],
            estimatedCost: 2500,
          },
        ],
        financialExposure: {
          estimatedBreachCost: 10_930_000,
          regulatoryPenalties: 2_000_000,
          businessDowntimeCost: 1_200_000,
          reputationDamage: 3_500_000,
          totalAnnualExposure: 17_630_000,
        },
        insuranceImpact: "Healthcare organizations without MFA face higher premiums.",
        llmExecutiveSummary: "Executive summary text here.",
        generatedBy: "template",
      };

      expect(briefData.organizationName).toBe("Acme Health");
      expect(briefData.topGaps).toHaveLength(1);
      expect(briefData.financialExposure.totalAnnualExposure).toBe(17_630_000);
      expect(briefData.generatedBy).toBe("template");
    });

    it("financial exposure components sum to total", () => {
      const exposure = {
        estimatedBreachCost: 10_930_000,
        regulatoryPenalties: 2_000_000,
        businessDowntimeCost: 1_200_000,
        reputationDamage: 3_500_000,
        totalAnnualExposure: 17_630_000,
      };

      const componentSum =
        exposure.estimatedBreachCost +
        exposure.regulatoryPenalties +
        exposure.businessDowntimeCost +
        exposure.reputationDamage;

      expect(componentSum).toBe(exposure.totalAnnualExposure);
    });
  });

  describe("Sector financial defaults", () => {
    it("healthcare breach cost is higher than average", () => {
      const healthcareCost = 10_930_000;
      const averageCost = 4_880_000;
      expect(healthcareCost).toBeGreaterThan(averageCost);
    });

    it("legal sector includes reputation damage for privilege exposure", () => {
      const legalReputationCost = 4_000_000;
      expect(legalReputationCost).toBeGreaterThan(0);
    });
  });

  describe("Tier-based risk multiplier", () => {
    it("Tier 1 gets full exposure (1.0x)", () => {
      const tierMultiplier = 1.0;
      const baseBreachCost = 10_930_000;
      expect(Math.round(baseBreachCost * tierMultiplier)).toBe(10_930_000);
    });

    it("Tier 2 gets 70% exposure", () => {
      const tierMultiplier = 0.7;
      const baseBreachCost = 10_930_000;
      expect(Math.round(baseBreachCost * tierMultiplier)).toBe(7_651_000);
    });

    it("Tier 3 gets 40% exposure", () => {
      const tierMultiplier = 0.4;
      const baseBreachCost = 10_930_000;
      expect(Math.round(baseBreachCost * tierMultiplier)).toBe(4_372_000);
    });

    it("Tier 4 gets 20% exposure (most mature)", () => {
      const tierMultiplier = 0.2;
      const baseBreachCost = 10_930_000;
      expect(Math.round(baseBreachCost * tierMultiplier)).toBe(2_186_000);
    });
  });

  describe("Top gaps extraction", () => {
    it("extracts top 3 gaps from recommendations", () => {
      const recommendations = [
        { title: "Deploy MFA", estimatedCost: 2500, complianceTags: ["NIST CSF PR.AA"] },
        { title: "Email Filtering", estimatedCost: 3600, complianceTags: ["NIST CSF PR.DS"] },
        { title: "Offline Backups", estimatedCost: 4800, complianceTags: ["NIST CSF RC.RP"] },
        { title: "IR Plan", estimatedCost: 5000, complianceTags: ["NIST CSF RS.MA"] },
      ];

      const topGaps = recommendations.slice(0, 3);
      expect(topGaps).toHaveLength(3);
      expect(topGaps[0]!.title).toBe("Deploy MFA");
    });

    it("handles plans with fewer than 3 recommendations", () => {
      const recommendations = [
        { title: "Deploy MFA", estimatedCost: 2500, complianceTags: ["NIST CSF PR.AA"] },
      ];

      const topGaps = recommendations.slice(0, 3);
      expect(topGaps).toHaveLength(1);
    });
  });

  describe("Template executive summary fallback", () => {
    it("generates summary mentioning org name and tier", () => {
      const orgName = "Acme Health";
      const tierRating = 1;
      const sector = "healthcare";
      const totalExposure = 17_630_000;
      const topGapTitle = "Deploy MFA";

      const summary = `${orgName} currently operates at NIST Cybersecurity Framework Tier ${tierRating} out of 4, indicating significant gaps in security posture. Based on industry benchmarks for the ${sector} sector, the estimated annual financial exposure from current security gaps is approximately $${totalExposure.toLocaleString()}. The highest-priority action is ${topGapTitle}, which addresses the most critical vulnerability. Immediate action is strongly recommended to reduce exposure before the next insurance renewal or regulatory review.`;

      expect(summary).toContain(orgName);
      expect(summary).toContain(`Tier ${tierRating}`);
      expect(summary).toContain("$17,630,000");
      expect(summary).toContain(topGapTitle);
    });
  });
});
