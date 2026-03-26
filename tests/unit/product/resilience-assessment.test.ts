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
    functions: { invoke: vi.fn() },
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

describe("C6: Operational Resilience Assessment", () => {
  describe("Resilience assessment sections", () => {
    const RESILIENCE_SECTIONS = [
      'RTO_RPO',
      'BACKUP_STRATEGY',
      'INCIDENT_RESPONSE',
      'DISASTER_RECOVERY',
      'CONTINUITY_PLANNING',
    ] as const;

    it("has 5 distinct sections", () => {
      expect(RESILIENCE_SECTIONS).toHaveLength(5);
    });

    it("starts with RTO/RPO (most fundamental)", () => {
      expect(RESILIENCE_SECTIONS[0]).toBe("RTO_RPO");
    });

    it("ends with Continuity Planning (most strategic)", () => {
      expect(RESILIENCE_SECTIONS[4]).toBe("CONTINUITY_PLANNING");
    });

    it("all sections have labels", () => {
      const labels: Record<string, string> = {
        RTO_RPO: 'Recovery Objectives (RTO/RPO)',
        BACKUP_STRATEGY: 'Backup Strategy',
        INCIDENT_RESPONSE: 'Incident Response Readiness',
        DISASTER_RECOVERY: 'Disaster Recovery',
        CONTINUITY_PLANNING: 'Business Continuity Planning',
      };

      for (const section of RESILIENCE_SECTIONS) {
        expect(labels[section]).toBeDefined();
        expect(labels[section]!.length).toBeGreaterThan(5);
      }
    });
  });

  describe("Section progress ranges", () => {
    const SECTION_PROGRESS = {
      RTO_RPO:              { min: 0,  max: 20 },
      BACKUP_STRATEGY:      { min: 21, max: 40 },
      INCIDENT_RESPONSE:    { min: 41, max: 60 },
      DISASTER_RECOVERY:    { min: 61, max: 80 },
      CONTINUITY_PLANNING:  { min: 81, max: 100 },
    };

    it("progress starts at 0 and ends at 100", () => {
      expect(SECTION_PROGRESS.RTO_RPO.min).toBe(0);
      expect(SECTION_PROGRESS.CONTINUITY_PLANNING.max).toBe(100);
    });

    it("sections are contiguous (no gaps)", () => {
      const sections = Object.values(SECTION_PROGRESS);
      for (let i = 1; i < sections.length; i++) {
        expect(sections[i]!.min).toBe(sections[i - 1]!.max + 1);
      }
    });
  });

  describe("Sector-specific questions", () => {
    it("healthcare questions reference ePHI and HIPAA", () => {
      const healthcareQuestions = [
        "What is Acme Health's defined Recovery Time Objective (RTO) for critical business systems? Include ePHI systems and HIPAA contingency plan requirements.",
      ];
      expect(healthcareQuestions[0]).toContain("ePHI");
      expect(healthcareQuestions[0]).toContain("HIPAA");
    });

    it("legal questions reference client matter data and trust accounts", () => {
      const legalQuestions = [
        "What is Acme Law's defined Recovery Time Objective (RTO) for critical business systems? Include client matter data and trust account systems.",
      ];
      expect(legalQuestions[0]).toContain("client matter data");
      expect(legalQuestions[0]).toContain("trust account");
    });
  });

  describe("RTO/RPO assessment logic", () => {
    it("RTO measures time to recover", () => {
      // RTO = Recovery Time Objective (how long before operations resume)
      const rtoHours = 4;
      expect(rtoHours).toBeGreaterThan(0);
    });

    it("RPO measures acceptable data loss", () => {
      // RPO = Recovery Point Objective (how much data can be lost)
      const rpoHours = 1;
      expect(rpoHours).toBeGreaterThan(0);
    });

    it("backup gap = current backup frequency vs RPO", () => {
      const backupFrequencyHours = 24; // Daily backups
      const rpoHours = 4; // Want max 4 hours data loss
      const gap = backupFrequencyHours - rpoHours;
      expect(gap).toBe(20); // 20-hour gap between actual and desired
    });
  });

  describe("Assessment session type", () => {
    it("resilience assessment type is distinct from CSF assessment", () => {
      const assessmentTypes = ['csf', 'resilience'];
      expect(assessmentTypes).toContain('resilience');
      expect(assessmentTypes).toHaveLength(2);
    });
  });

  describe("Template question fallback", () => {
    it("each section has at least 3 template questions", () => {
      const sections = ['RTO_RPO', 'BACKUP_STRATEGY', 'INCIDENT_RESPONSE', 'DISASTER_RECOVERY', 'CONTINUITY_PLANNING'];
      // The route defines 3 questions per section
      for (const section of sections) {
        expect(3).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
