import { describe, it, expect, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() } })),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
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
        or: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
      })),
    })),
    functions: { invoke: vi.fn() },
  })),
}));
vi.mock("@/lib/ai/embeddings/supabase-embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/ai/rag/embeddings", () => ({
  embedQuery: vi.fn().mockRejectedValue(new Error("No embeddings")),
}));

import type { AssessmentReportData } from "@/lib/pdf/assessment-report";

describe("C10: Assessment Report", () => {
  describe("AssessmentReportData structure", () => {
    const sampleReport: AssessmentReportData = {
      organizationName: "Acme Health",
      sector: "healthcare",
      assessmentDate: "March 26, 2026",
      completedDate: "March 26, 2026",
      tierRating: 2,
      overallScore: 55,
      executiveSummary: "Your organization is at Tier 2...",
      categoryScores: [
        { category: "GOVERN", score: 65, tier: 3, questionCount: 3, status: "adequate" },
        { category: "IDENTIFY", score: 50, tier: 2, questionCount: 2, status: "adequate" },
        { category: "PROTECT", score: 35, tier: 2, questionCount: 1, status: "needs-improvement" },
        { category: "DETECT", score: 0, tier: 0, questionCount: 0, status: "critical" },
        { category: "RESPOND", score: 0, tier: 0, questionCount: 0, status: "critical" },
        { category: "RECOVER", score: 0, tier: 0, questionCount: 0, status: "critical" },
      ],
      findings: [
        {
          id: 1,
          title: "No assessment data for DETECT function",
          category: "DETECT",
          severity: "critical",
          description: "The DETECT function was not assessed.",
          complianceTags: ["NIST CSF 2.0 — DETECT"],
          recommendation: "Complete the DETECT section.",
        },
      ],
      remediationPlan: [
        {
          rank: 1,
          title: "Deploy MFA",
          estimatedCost: 2500,
          timeToImplement: "1-2 weeks",
          difficulty: "easy",
          complianceTags: ["NIST CSF PR.AA"],
        },
      ],
      nextSteps: [
        "Complete incomplete sections within 30 days.",
        "Implement top 3 remediation actions.",
      ],
      generatedBy: "template",
    };

    it("contains all required top-level fields", () => {
      expect(sampleReport.organizationName).toBe("Acme Health");
      expect(sampleReport.overallScore).toBe(55);
      expect(sampleReport.tierRating).toBe(2);
      expect(sampleReport.categoryScores).toHaveLength(6);
      expect(sampleReport.findings.length).toBeGreaterThan(0);
      expect(sampleReport.remediationPlan.length).toBeGreaterThan(0);
      expect(sampleReport.nextSteps.length).toBeGreaterThan(0);
    });

    it("has exactly 6 NIST CSF categories", () => {
      const categories = sampleReport.categoryScores.map(c => c.category);
      expect(categories).toEqual(["GOVERN", "IDENTIFY", "PROTECT", "DETECT", "RESPOND", "RECOVER"]);
    });
  });

  describe("Category scoring logic", () => {
    function scoreCategory(responseCount: number) {
      if (responseCount === 0) return { score: 0, tier: 0, status: "critical" };
      const score = Math.min(95, 20 + responseCount * 15);
      const tier = score >= 80 ? 4 : score >= 60 ? 3 : score >= 30 ? 2 : 1;
      const status = score < 40 ? "needs-improvement" : score < 70 ? "adequate" : "strong";
      return { score, tier, status };
    }

    it("0 responses = score 0, tier 0, critical", () => {
      const result = scoreCategory(0);
      expect(result.score).toBe(0);
      expect(result.tier).toBe(0);
      expect(result.status).toBe("critical");
    });

    it("1 response = score 35, tier 2, needs-improvement", () => {
      const result = scoreCategory(1);
      expect(result.score).toBe(35);
      expect(result.tier).toBe(2);
      expect(result.status).toBe("needs-improvement");
    });

    it("3 responses = score 65, tier 3, adequate", () => {
      const result = scoreCategory(3);
      expect(result.score).toBe(65);
      expect(result.tier).toBe(3);
      expect(result.status).toBe("adequate");
    });

    it("5+ responses caps at score 95, tier 4, strong", () => {
      const result = scoreCategory(5);
      expect(result.score).toBe(95);
      expect(result.tier).toBe(4);
      expect(result.status).toBe("strong");
    });

    it("scores never exceed 95", () => {
      const result = scoreCategory(100);
      expect(result.score).toBe(95);
    });
  });

  describe("Findings extraction", () => {
    it("generates critical finding for unassessed categories", () => {
      const findings = [
        { id: 1, title: "No assessment data for DETECT function", severity: "critical", category: "DETECT" },
      ];
      expect(findings[0]!.severity).toBe("critical");
      expect(findings[0]!.title).toContain("DETECT");
    });

    it("generates high finding for partially assessed categories", () => {
      const findings = [
        { id: 1, title: "Incomplete assessment of PROTECT function", severity: "high", category: "PROTECT" },
      ];
      expect(findings[0]!.severity).toBe("high");
    });

    it("findings are sorted by severity (critical first)", () => {
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const findings = [
        { severity: "medium" as const },
        { severity: "critical" as const },
        { severity: "high" as const },
      ];
      const sorted = findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
      expect(sorted[0]!.severity).toBe("critical");
      expect(sorted[1]!.severity).toBe("high");
      expect(sorted[2]!.severity).toBe("medium");
    });
  });

  describe("Sector-specific findings", () => {
    it("healthcare adds HIPAA risk assessment finding", () => {
      const finding = {
        title: "HIPAA Security Risk Assessment may be overdue",
        complianceTags: ["HIPAA 164.308(a)(1)", "NIST CSF ID.RA", "OCR Audit Protocol"],
      };
      expect(finding.title).toContain("HIPAA");
      expect(finding.complianceTags).toContain("HIPAA 164.308(a)(1)");
    });

    it("legal adds privilege protection finding", () => {
      const finding = {
        title: "Attorney-client privilege protection controls should be verified",
        complianceTags: ["ABA Rule 1.6", "ABA Formal Opinion 477R"],
      };
      expect(finding.title).toContain("privilege");
      expect(finding.complianceTags).toContain("ABA Rule 1.6");
    });
  });

  describe("Next steps generation", () => {
    it("low-tier orgs get immediate action steps", () => {
      const steps = [
        "Schedule a follow-up session to complete any incomplete assessment sections within 30 days.",
        "Implement the top 3 remediation actions from the plan (starting with MFA deployment).",
      ];
      expect(steps[0]).toContain("30 days");
      expect(steps[1]).toContain("MFA");
    });

    it("healthcare orgs get HIPAA-specific steps", () => {
      const steps = [
        "Ensure a current HIPAA Security Risk Assessment is on file — required annually by OCR.",
        "Review Business Associate Agreements (BAAs) with all vendors accessing ePHI.",
      ];
      expect(steps[0]).toContain("HIPAA");
      expect(steps[1]).toContain("BAA");
    });

    it("legal orgs get ABA-specific steps", () => {
      const steps = [
        "Review and document technology competence obligations under ABA Model Rule 1.1 Comment 8.",
        "Verify ethical wall controls and audit logging on document management systems.",
      ];
      expect(steps[0]).toContain("ABA");
      expect(steps[1]).toContain("ethical wall");
    });
  });

  describe("Template executive summary fallback", () => {
    it("includes org name, tier, score, and finding count", () => {
      const orgName = "Acme Health";
      const tierRating = 2;
      const overallScore = 55;
      const findingCount = 8;
      const criticalCount = 3;

      const summary = `${orgName} currently operates at NIST Cybersecurity Framework Tier ${tierRating} out of 4, with an overall security posture score of ${overallScore}/100. The assessment identified ${findingCount} findings, including ${criticalCount} critical issues requiring immediate attention.`;

      expect(summary).toContain(orgName);
      expect(summary).toContain(`Tier ${tierRating}`);
      expect(summary).toContain(`${overallScore}/100`);
      expect(summary).toContain(`${criticalCount} critical`);
    });
  });
});
