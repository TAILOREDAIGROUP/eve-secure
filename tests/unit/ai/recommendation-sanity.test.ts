import { describe, it, expect } from "vitest";
import {
  validateRecommendation,
  type RecommendationValidationResult,
} from "@/lib/ai/guardrails/recommendation-validator";
import { getSectorPrompt, formatRevenue, getSizeClass } from "@/lib/ai/prompts/sector-prompts";
import type { OrgProfile } from "@/types";
import { Sector, State } from "@/types";

/**
 * Factory for test OrgProfiles
 */
function makeOrgProfile(overrides: Partial<OrgProfile> = {}): OrgProfile {
  return {
    id: "test-org-1",
    tenantId: "tenant-1",
    legalName: "Test Corp",
    description: "A test organization",
    website: "https://test.com",
    sector: Sector.OTHER,
    employees: 25,
    annualRevenue: 1_000_000,
    headquartersState: State.TX,
    dataHandlingCategory: "pii",
    criticality: "medium",
    industryCompliance: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ====================================================================
// Recommendation Validator Tests
// ====================================================================

describe("validateRecommendation", () => {
  describe("DISPROPORTIONATE cost checks", () => {
    it("flags $500K recommendation for $1M revenue org", () => {
      const org = makeOrgProfile({ annualRevenue: 1_000_000 });
      const result = validateRecommendation(
        "We recommend deploying a $500K SIEM solution for comprehensive monitoring.",
        org
      );

      expect(result.valid).toBe(false);
      expect(result.flags).toHaveLength(1);
      expect(result.flags[0].type).toBe("DISPROPORTIONATE");
      expect(result.disclaimers.length).toBeGreaterThan(0);
      expect(result.validatedText).toContain("COST ADVISORY");
    });

    it("flags $2M recommendation for $5M revenue org (40%)", () => {
      const org = makeOrgProfile({ annualRevenue: 5_000_000 });
      const result = validateRecommendation(
        "Implement an enterprise security platform at $2M annual cost.",
        org
      );

      expect(result.valid).toBe(false);
      expect(result.flags[0].type).toBe("DISPROPORTIONATE");
    });

    it("passes $100K recommendation for $5M revenue org (2%)", () => {
      const org = makeOrgProfile({ annualRevenue: 5_000_000 });
      const result = validateRecommendation(
        "Deploy EDR solution at approximately $100K per year.",
        org
      );

      // $100K is 2% of $5M — well under 15%
      const costFlags = result.flags.filter((f) => f.type === "DISPROPORTIONATE");
      expect(costFlags).toHaveLength(0);
    });
  });

  describe("SECTOR_MISMATCH checks", () => {
    it("flags HIPAA mention for legal org", () => {
      const org = makeOrgProfile({ sector: Sector.OTHER });
      const result = validateRecommendation(
        "You should implement HIPAA-compliant encryption for all client data.",
        org
      );

      expect(result.valid).toBe(false);
      expect(result.flags.some((f) => f.type === "SECTOR_MISMATCH")).toBe(true);
      expect(result.validatedText).toContain("SECTOR ADVISORY");
    });

    it("flags PHI reference for technology org", () => {
      const org = makeOrgProfile({ sector: Sector.TECHNOLOGY });
      const result = validateRecommendation(
        "Ensure all PHI is encrypted at rest and in transit.",
        org
      );

      expect(result.flags.some((f) => f.type === "SECTOR_MISMATCH")).toBe(true);
    });

    it("does NOT flag HIPAA for healthcare org", () => {
      const org = makeOrgProfile({ sector: Sector.HEALTHCARE });
      const result = validateRecommendation(
        "Ensure HIPAA compliance with encryption of PHI at rest.",
        org
      );

      const sectorFlags = result.flags.filter((f) => f.type === "SECTOR_MISMATCH");
      expect(sectorFlags).toHaveLength(0);
    });

    it("does NOT flag HIPAA for org with hipaa in compliance list", () => {
      const org = makeOrgProfile({
        sector: Sector.OTHER,
        industryCompliance: ["hipaa", "pci-dss"],
      });
      const result = validateRecommendation(
        "HIPAA Security Rule requires encryption of PHI.",
        org
      );

      const sectorFlags = result.flags.filter((f) => f.type === "SECTOR_MISMATCH");
      expect(sectorFlags).toHaveLength(0);
    });
  });

  describe("SCALE_MISMATCH checks", () => {
    it("flags enterprise SOC for 10-person firm", () => {
      const org = makeOrgProfile({ employees: 10 });
      const result = validateRecommendation(
        "Deploy an enterprise SOC with 24/7 monitoring and dedicated analysts.",
        org
      );

      expect(result.valid).toBe(false);
      expect(result.flags.some((f) => f.type === "SCALE_MISMATCH")).toBe(true);
      expect(result.validatedText).toContain("SCALE ADVISORY");
    });

    it("flags 24/7 monitoring for 5-person org", () => {
      const org = makeOrgProfile({ employees: 5 });
      const result = validateRecommendation(
        "Implement 24/7 security monitoring with a dedicated security team.",
        org
      );

      expect(result.flags.some((f) => f.type === "SCALE_MISMATCH")).toBe(true);
    });

    it("does NOT flag enterprise SOC for 200-person org", () => {
      const org = makeOrgProfile({ employees: 200 });
      const result = validateRecommendation(
        "Consider an enterprise SOC for continuous monitoring.",
        org
      );

      const scaleFlags = result.flags.filter((f) => f.type === "SCALE_MISMATCH");
      expect(scaleFlags).toHaveLength(0);
    });
  });

  describe("appropriate recommendations pass", () => {
    it("passes well-scaled recommendation", () => {
      const org = makeOrgProfile({
        sector: Sector.TECHNOLOGY,
        employees: 50,
        annualRevenue: 10_000_000,
      });
      const result = validateRecommendation(
        "Deploy a managed EDR solution ($50K/year) with quarterly penetration testing ($30K/year). Implement MFA across all systems.",
        org
      );

      expect(result.valid).toBe(true);
      expect(result.flags).toHaveLength(0);
      expect(result.disclaimers).toHaveLength(0);
      expect(result.validatedText).toBe(result.originalText);
    });
  });
});

// ====================================================================
// Sector Prompt Tests
// ====================================================================

describe("getSectorPrompt", () => {
  it("includes employee count and revenue in every sector prompt", () => {
    const org = makeOrgProfile({ employees: 25, annualRevenue: 2_000_000 });

    const prompt = getSectorPrompt("technology", org);

    expect(prompt).toContain("25 employees");
    expect(prompt).toContain("$2.0M");
    expect(prompt).toContain("15%");
  });

  it("returns healthcare prompt with HIPAA context", () => {
    const org = makeOrgProfile({ sector: Sector.HEALTHCARE, employees: 100 });
    const prompt = getSectorPrompt("healthcare", org);

    expect(prompt).toContain("HIPAA");
    expect(prompt).toContain("PHI");
    expect(prompt).toContain("breach notification");
    expect(prompt).toContain("HHS");
    expect(prompt).toContain("100 employees");
  });

  it("returns legal prompt with ABA ethics context", () => {
    const org = makeOrgProfile({ employees: 15, annualRevenue: 3_000_000 });
    const prompt = getSectorPrompt("legal", org);

    expect(prompt).toContain("ABA");
    expect(prompt).toContain("Attorney-client privilege");
    expect(prompt).toContain("Client Confidentiality");
    expect(prompt).toContain("15 employees");
    expect(prompt).toContain("$3.0M");
  });

  it("returns general prompt with business language for other sectors", () => {
    const org = makeOrgProfile({ sector: Sector.RETAIL, annualRevenue: 5_000_000 });
    const prompt = getSectorPrompt("retail", org);

    expect(prompt).toContain("business continuity");
    expect(prompt).toContain("cost-benefit");
    expect(prompt).toContain("Cyber Insurance");
    expect(prompt).toContain("Retail");
  });

  it("includes scaling directive with max budget", () => {
    const org = makeOrgProfile({ annualRevenue: 10_000_000 });
    const prompt = getSectorPrompt("technology", org);

    // 15% of $10M = $1.5M
    expect(prompt).toContain("$1.5M");
    expect(prompt).toContain("Do not recommend solutions costing more than 15%");
  });

  it("triggers healthcare prompt for non-healthcare org with HIPAA compliance", () => {
    const org = makeOrgProfile({
      sector: Sector.OTHER,
      industryCompliance: ["hipaa"],
    });
    const prompt = getSectorPrompt("other", org);

    expect(prompt).toContain("HIPAA");
    expect(prompt).toContain("Healthcare");
  });
});

// ====================================================================
// Helper Function Tests
// ====================================================================

describe("formatRevenue", () => {
  it("formats millions", () => expect(formatRevenue(1_000_000)).toBe("1.0M"));
  it("formats thousands", () => expect(formatRevenue(500_000)).toBe("500K"));
  it("formats billions", () => expect(formatRevenue(2_500_000_000)).toBe("2.5B"));
  it("formats small amounts", () => expect(formatRevenue(999)).toBe("999"));
});

describe("getSizeClass", () => {
  it("micro", () => expect(getSizeClass(5)).toContain("micro"));
  it("small", () => expect(getSizeClass(25)).toContain("small"));
  it("mid-market", () => expect(getSizeClass(100)).toContain("mid-market"));
  it("enterprise", () => expect(getSizeClass(5000)).toContain("enterprise"));
});
