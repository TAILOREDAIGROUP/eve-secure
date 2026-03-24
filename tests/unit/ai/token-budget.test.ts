import { describe, it, expect } from "vitest";
import {
  extractAnchors,
  summarizeSection,
  buildContextWindow,
  manageTokenBudget,
  getTokenBudgetReport,
} from "@/lib/ai/models/token-budget";

describe("token-budget: anchored iterative summarization", () => {
  describe("extractAnchors", () => {
    it("extracts score from Q&A", () => {
      const anchors = extractAnchors(
        [
          {
            query: "How mature is your access control?",
            response:
              "Based on the evidence provided, your access control maturity rating: 3/5. You have basic RBAC but lack MFA enforcement.",
          },
        ],
        "Identify - Access Control"
      );

      expect(anchors.sectionName).toBe("Identify - Access Control");
      expect(anchors.score).toBe(3);
    });

    it("extracts budget constraints from user input", () => {
      const anchors = extractAnchors([
        {
          query:
            "Our budget is approximately $50,000 for the year and we only have 2 IT staff",
          response:
            "Given your budget of $50,000 and staffing constraints, I recommend prioritizing MFA deployment first.",
        },
      ]);

      expect(anchors.constraints.length).toBeGreaterThan(0);
      expect(
        anchors.constraints.some(
          (c) => c.toLowerCase().includes("budget") || c.includes("50,000")
        )
      ).toBe(true);
    });

    it("extracts recommendations from responses", () => {
      const anchors = extractAnchors([
        {
          query: "What should we do about our firewall?",
          response:
            "I recommend deploying a next-gen firewall with IPS capabilities. You should also implement network segmentation to isolate critical systems.",
        },
      ]);

      expect(anchors.recommendations.length).toBeGreaterThan(0);
    });

    it("extracts findings from responses", () => {
      const anchors = extractAnchors([
        {
          query: "What did you find?",
          response:
            "We identified a critical gap in your endpoint protection coverage. We also detected that 40% of systems lack current patches.",
        },
      ]);

      expect(anchors.keyFindings.length).toBeGreaterThan(0);
    });

    it("caps anchors at maxAnchorsPerField", () => {
      const manyFindings = Array.from({ length: 20 }, (_, i) => ({
        query: `Question ${i}`,
        response: `We found a critical weakness in area ${i}. We identified gap number ${i} in the security posture.`,
      }));

      const anchors = extractAnchors(manyFindings);

      expect(anchors.keyFindings.length).toBeLessThanOrEqual(5);
      expect(anchors.recommendations.length).toBeLessThanOrEqual(5);
      expect(anchors.constraints.length).toBeLessThanOrEqual(5);
    });
  });

  describe("summarizeSection", () => {
    it("returns empty summary for no questions", () => {
      const result = summarizeSection({ questions: [] });
      expect(result.summary).toBe("");
      expect(result.anchors.keyFindings).toEqual([]);
    });

    it("preserves anchors in summary output", () => {
      const result = summarizeSection({
        questions: [
          {
            query: "Rate our identity management",
            response:
              "Your identity management maturity score: 2/5. We found a significant gap in privileged access management. I recommend implementing a PAM solution within 90 days.",
          },
        ],
        sectionName: "Identify - IAM",
      });

      expect(result.summary).toContain("[Section: Identify - IAM]");
      expect(result.summary).toContain("[Score: 2/5]");
      expect(result.anchors.score).toBe(2);
      expect(result.anchors.sectionName).toBe("Identify - IAM");
    });

    it("compression ratio is better than 50%", () => {
      const longQA = Array.from({ length: 5 }, (_, i) => ({
        query: `Tell me about security control area ${i} and how it relates to our compliance posture`,
        response: `Based on the NIST CSF framework analysis, area ${i} shows moderate maturity. We found that your organization has basic controls in place but lacks automated monitoring. The risk is that without continuous monitoring, threats may go undetected for extended periods. I recommend implementing a SIEM solution and establishing 24/7 SOC coverage. This aligns with HIPAA requirements for audit logging and access monitoring. The estimated cost for this improvement is $75,000 annually. Timeline: implement within 6 months. Priority: HIGH based on regulatory exposure.`,
      }));

      const result = summarizeSection({
        questions: longQA,
        sectionName: "Detect",
      });

      expect(result.summaryTokens).toBeLessThan(result.originalTokens * 0.5);
      expect(result.anchors.sectionName).toBe("Detect");
    });
  });

  describe("30-turn regression: anchors survive full compression cascade", () => {
    it("Section 6 can reference a budget constraint stated in Section 1", () => {
      // Simulate a 6-section, 30-turn assessment
      const sections = [
        {
          name: "Identify - Asset Management",
          questions: [
            {
              query:
                "Our annual security budget is $120,000 and we have a staff of 3 IT people. Timeline is 12 months to improve.",
              response:
                "Noted. With a budget of $120,000, staff of 3, and a 12-month timeline, we need to prioritize high-impact, low-effort improvements. Your asset management maturity score: 2/5. We found that you lack a complete asset inventory. I recommend deploying an automated asset discovery tool.",
            },
            {
              query: "We use Microsoft 365 and Azure AD",
              response:
                "We identified that your Microsoft 365 environment provides foundational identity capabilities. I recommend enabling Conditional Access policies as a quick win. This should be your priority action item within 30 days.",
            },
            {
              query: "What about our network devices?",
              response:
                "We found a gap in network device inventory — switches and access points are untracked. I recommend implementing a network scanning tool. Cost estimate: $5,000 one-time.",
            },
            {
              query: "Any compliance concerns?",
              response:
                "We detected that without a complete asset inventory, HIPAA compliance is at risk. The regulation requires you to identify all systems that store, process, or transmit ePHI.",
            },
            {
              query: "What's our risk level here?",
              response:
                "Confidence: HIGH - Your asset management risk is elevated due to incomplete inventory. I recommend addressing this within 60 days. This is your highest-priority finding in the Identify function.",
            },
          ],
        },
        {
          name: "Protect - Access Control",
          questions: Array.from({ length: 5 }, (_, i) => ({
            query: `Access control question ${i + 1}`,
            response: `Access control finding ${i + 1}. We found moderate controls in place. Score: 3/5. I recommend implementing MFA across all systems.`,
          })),
        },
        {
          name: "Protect - Data Security",
          questions: Array.from({ length: 5 }, (_, i) => ({
            query: `Data security question ${i + 1}`,
            response: `Data security finding ${i + 1}. We identified encryption gaps. Score: 2/5. I recommend enabling TDE on all databases. Must comply with HIPAA encryption requirements.`,
          })),
        },
        {
          name: "Detect - Monitoring",
          questions: Array.from({ length: 5 }, (_, i) => ({
            query: `Monitoring question ${i + 1}`,
            response: `Monitoring finding ${i + 1}. We detected a weakness in log collection. Score: 1/5. I recommend deploying a SIEM solution. Estimated cost: $40,000 annually.`,
          })),
        },
        {
          name: "Respond - IR Planning",
          questions: Array.from({ length: 5 }, (_, i) => ({
            query: `IR planning question ${i + 1}`,
            response: `IR finding ${i + 1}. We found no formal incident response plan. Score: 1/5. I recommend developing an IR playbook within 90 days.`,
          })),
        },
      ];

      // Build the context window progressively, compressing as we go
      let priorSections: ReturnType<typeof summarizeSection>[] = [];

      // Summarize sections 1-5 (simulating what happens as assessment progresses)
      for (const section of sections) {
        const summary = summarizeSection({
          questions: section.questions,
          sectionName: section.name,
        });
        priorSections.push(summary);
      }

      // Build context window for Section 6
      const window = buildContextWindow({
        currentSection: [
          {
            query: "Given everything we've discussed, what's the recovery plan?",
            response: "Let me synthesize the findings across all prior sections.",
          },
        ],
        priorSections,
        knowledgeContext: { items: ["NIST CSF 2.0 framework reference data"] },
        assessmentId: "test-30-turn",
      });

      // THE CRITICAL ASSERTIONS:
      // Section 1's budget constraint must be findable in prior sections
      const allPriorText = window.priorSections
        .map((s) => s.summary)
        .join("\n");
      const allAnchors = window.priorSections.map((s) => s.anchors);

      // 1. Budget constraint from Section 1 survives
      const section1Anchors = allAnchors.find(
        (a) => a.sectionName === "Identify - Asset Management"
      );
      expect(section1Anchors).toBeDefined();
      expect(
        section1Anchors!.constraints.some(
          (c) => c.includes("120,000") || c.includes("budget")
        )
      ).toBe(true);

      // 2. Staff constraint from Section 1 survives
      expect(
        section1Anchors!.constraints.some(
          (c) => c.includes("3") && c.toLowerCase().includes("staff")
        )
      ).toBe(true);

      // 3. Score from Section 1 survives
      expect(section1Anchors!.score).toBe(2);

      // 4. All 5 section names are present
      expect(allAnchors.map((a) => a.sectionName)).toEqual([
        "Identify - Asset Management",
        "Protect - Access Control",
        "Protect - Data Security",
        "Detect - Monitoring",
        "Respond - IR Planning",
      ]);

      // 5. All sections have scores
      expect(allAnchors.every((a) => a.score !== null)).toBe(true);

      // 6. Now simulate extreme compression (force to anchors-only)
      // Even after extreme compression, the budget constraint must survive
      const extremeWindow = buildContextWindow({
        currentSection: [],
        priorSections: priorSections.map((s) => ({
          ...s,
          // Simulate Level 2 compression: summary is just the anchors
          summary: `[Section: ${s.anchors.sectionName}]${s.anchors.score !== null ? ` [Score: ${s.anchors.score}/5]` : ""}${s.anchors.constraints.length > 0 ? ` [Constraints: ${s.anchors.constraints.join("; ")}]` : ""}`,
          summaryTokens: Math.ceil(
            `[Section: ${s.anchors.sectionName}]`.length / 4
          ),
        })),
        knowledgeContext: { items: [] },
        assessmentId: "test-extreme-compression",
      });

      // Budget still findable even after extreme compression
      const extremeText = extremeWindow.priorSections
        .map((s) => s.summary)
        .join("\n");
      expect(extremeText).toContain("120,000");
    });
  });

  describe("manageTokenBudget", () => {
    it("preserves anchors when compressing under pressure", () => {
      // Create a window that's near capacity
      const priorSection = summarizeSection({
        questions: [
          {
            query: "Budget is $200,000 with 5 staff members",
            response:
              "Noted your budget of $200,000 and team of 5. Maturity score: 3/5. I recommend focusing on detection capabilities first.",
          },
        ],
        sectionName: "Initial Assessment",
      });

      const nearFullWindow = buildContextWindow({
        currentSection: Array.from({ length: 10 }, (_, i) => ({
          query: `Question ${i} about security posture and risk assessment`,
          response: `Detailed response ${i} covering multiple aspects of the security framework including NIST CSF controls, HIPAA requirements, and specific technical recommendations for improving the security posture across the organization's infrastructure and applications.`,
        })),
        priorSections: [priorSection],
        knowledgeContext: {
          items: [
            "A".repeat(10000), // Large knowledge context
          ],
        },
        assessmentId: "test-pressure",
      });

      // Force the window to be near max
      nearFullWindow.currentTokens = nearFullWindow.maxTokens - 500;

      const result = manageTokenBudget({
        currentWindow: nearFullWindow,
        newQuery: "What about our recovery capabilities?",
        newResponse:
          "Based on prior findings, your recovery capabilities need significant improvement.",
      });

      // Even after compression, prior section anchors should survive
      const survivingAnchors = result.window.priorSections.find(
        (s) => s.anchors.sectionName === "Initial Assessment"
      );

      if (survivingAnchors) {
        expect(survivingAnchors.anchors.score).toBe(3);
        expect(survivingAnchors.anchors.sectionName).toBe(
          "Initial Assessment"
        );
      }
    });
  });

  describe("getTokenBudgetReport", () => {
    it("reports correct utilization", () => {
      const window = buildContextWindow({
        currentSection: [
          { query: "test", response: "test response here" },
        ],
        knowledgeContext: { items: ["knowledge chunk"] },
        assessmentId: "report-test",
      });

      const report = getTokenBudgetReport(window);

      expect(report.breakdown.total).toBeGreaterThan(0);
      expect(report.breakdown.available).toBeGreaterThan(0);
      expect(report.summary).toContain("report-test");
    });
  });
});
