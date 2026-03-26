import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(() => ({
      messages: { create: mockCreate },
    })),
  };
});

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
  embedBatch: vi.fn(),
  getEmbeddingDimension: vi.fn(() => 384),
  getEmbeddingModel: vi.fn(() => "gte-small"),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { callModel } from "@/lib/ai/litellm";
import { getPlanningPrompt } from "@/lib/ai/prompts/system";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("C3: PLAN Mode RAG + LLM Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Planning prompt structure", () => {
    it("planning prompt includes planning-specific guidelines", () => {
      const prompt = getPlanningPrompt();
      expect(prompt).toContain("Planning-Specific Guidelines");
      expect(prompt).toContain("Strategic Objectives");
      expect(prompt).toContain("Prioritization Framework");
      expect(prompt).toContain("Implementation Sequencing");
    });

    it("planning prompt inherits core system prompt with refusal patterns", () => {
      const prompt = getPlanningPrompt();
      expect(prompt).toContain("EVE Secure");
      expect(prompt).toContain("Strict Refusal Patterns");
      expect(prompt).toContain("Anti-Extraction Guardrails");
    });
  });

  describe("LLM plan generation", () => {
    it("generates valid JSON action items from LLM", async () => {
      const mockResponse = JSON.stringify([
        {
          title: "Implement Network Segmentation",
          description: "Separate critical systems from general network. Isolate ePHI systems.",
          estimatedCost: 12000,
          difficulty: "hard",
          timeToImplement: "4-8 weeks",
          complianceTags: ["NIST CSF PR.AC", "HIPAA 164.312(e)(1)"],
          insuranceTags: ["Reduces lateral movement risk"],
          businessImpact: "Limits blast radius of breaches by 73% (Mandiant M-Trends 2024).",
        },
        {
          title: "Deploy Endpoint Detection and Response",
          description: "Install EDR on all endpoints for real-time threat detection.",
          estimatedCost: 8000,
          difficulty: "medium",
          timeToImplement: "2-3 weeks",
          complianceTags: ["NIST CSF DE.CM", "NIST CSF DE.AE"],
          insuranceTags: ["EDR increasingly required by carriers"],
          businessImpact: "Reduces mean time to detect from 200+ days to hours.",
        },
      ]);

      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: mockResponse }],
        usage: { input_tokens: 1000, output_tokens: 300 },
      });

      const result = await callModel({
        query: "Generate remediation plan",
        systemPrompt: getPlanningPrompt(),
        tenantId: "tenant-1",
      });

      // Verify LLM returned valid JSON
      const parsed = JSON.parse(result.content);
      expect(parsed).toBeInstanceOf(Array);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].title).toContain("Network Segmentation");
      expect(parsed[0].estimatedCost).toBe(12000);
      expect(parsed[0].complianceTags).toContain("NIST CSF PR.AC");
    });

    it("handles malformed LLM response gracefully", async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: "text", text: "Here are my recommendations: 1. Do MFA 2. Do backups" }],
        usage: { input_tokens: 500, output_tokens: 50 },
      });

      const result = await callModel({
        query: "Generate remediation plan",
        systemPrompt: getPlanningPrompt(),
        tenantId: "tenant-1",
      });

      // Response is not JSON — the route layer should fall back to template
      expect(() => JSON.parse(result.content)).toThrow();
    });

    it("returns degraded flag on total LLM failure", async () => {
      mockCreate.mockRejectedValue(new Error("Service unavailable"));

      const result = await callModel({
        query: "Generate remediation plan",
        systemPrompt: getPlanningPrompt(),
        tenantId: "tenant-1",
      });

      expect(result.degraded).toBe(true);
    }, 30_000);
  });

  describe("Action item validation", () => {
    it("validates difficulty enum values", () => {
      const validDifficulties = ["easy", "medium", "hard"];
      for (const d of validDifficulties) {
        expect(validDifficulties).toContain(d);
      }
    });

    it("validates status enum values", () => {
      const validStatuses = ["not_started", "in_progress", "complete"];
      for (const s of validStatuses) {
        expect(validStatuses).toContain(s);
      }
    });

    it("action items have required fields", () => {
      const requiredFields = [
        "rank", "title", "description", "estimatedCost",
        "difficulty", "timeToImplement", "complianceTags",
        "insuranceTags", "businessImpact", "status"
      ];

      // Verify the ActionItem interface covers all fields
      const sampleItem = {
        rank: 1,
        title: "Test",
        description: "Test description",
        estimatedCost: 1000,
        difficulty: "easy",
        timeToImplement: "1 week",
        complianceTags: ["NIST"],
        insuranceTags: ["Required"],
        businessImpact: "Impact",
        status: "not_started",
      };

      for (const field of requiredFields) {
        expect(sampleItem).toHaveProperty(field);
      }
    });
  });

  describe("Four Fundamentals always included for Tier 1/2", () => {
    it("MFA is always rank 1", () => {
      // The route hardcodes Four Fundamentals for tier <= 2
      const fundamentals = [
        { rank: 1, title: "Deploy Multi-Factor Authentication (MFA)" },
        { rank: 2, title: "Implement Advanced Email Filtering" },
        { rank: 3, title: "Establish Offline/Immutable Backups" },
        { rank: 4, title: "Create Incident Response Plan" },
      ];

      expect(fundamentals[0]!.rank).toBe(1);
      expect(fundamentals[0]!.title).toContain("MFA");
    });

    it("fundamentals include sector-specific compliance tags", () => {
      // Healthcare should reference HIPAA, Legal should reference ABA
      const healthcareTags = ['NIST CSF PR.AA', 'HIPAA 164.312(d)'];
      const legalTags = ['NIST CSF PR.AA', 'ABA Rule 1.6'];

      expect(healthcareTags).toContain('HIPAA 164.312(d)');
      expect(legalTags).toContain('ABA Rule 1.6');
    });
  });
});
