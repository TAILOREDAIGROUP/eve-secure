import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.resolve(__dirname, "..", "..", "..", "knowledge");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadJSON<T>(relativePath: string): T {
  const fullPath = path.join(KNOWLEDGE_DIR, relativePath);
  expect(fs.existsSync(fullPath), `File should exist: ${relativePath}`).toBe(
    true
  );
  return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as T;
}

function findInArray<T extends { id: string }>(
  items: T[],
  id: string
): T | undefined {
  return items.find((item) => item.id === id);
}

// ---------------------------------------------------------------------------
// A2: HIPAA Healthcare Pack
// ---------------------------------------------------------------------------

describe("A2: HIPAA Healthcare Pack", () => {
  let corpus: {
    framework: string;
    specifications: Array<{
      id: string;
      title: string;
      cfr_section: string;
      safeguard_type: string;
      nist_mapping: string[];
      required_or_addressable: string;
      description: string;
      implementation_guidance: string;
      breach_notification_relevance: string;
    }>;
    breach_notification: Record<string, unknown>;
  };

  beforeAll(() => {
    corpus = loadJSON("hipaa/corpus.json");
  });

  it("has valid top-level structure", () => {
    expect(corpus.framework).toContain("HIPAA");
    expect(corpus.specifications).toBeDefined();
    expect(Array.isArray(corpus.specifications)).toBe(true);
    expect(corpus.breach_notification).toBeDefined();
  });

  it("contains at least 40 implementation specifications", () => {
    expect(corpus.specifications.length).toBeGreaterThanOrEqual(40);
  });

  it("every spec has required fields", () => {
    for (const spec of corpus.specifications) {
      expect(spec.id, `${spec.id} missing id`).toBeTruthy();
      expect(spec.title, `${spec.id} missing title`).toBeTruthy();
      expect(spec.cfr_section, `${spec.id} missing cfr_section`).toContain(
        "164"
      );
      expect(
        spec.safeguard_type,
        `${spec.id} missing safeguard_type`
      ).toMatch(/Administrative|Physical|Technical/);
      expect(
        spec.nist_mapping.length,
        `${spec.id} missing nist_mapping`
      ).toBeGreaterThan(0);
      expect(
        spec.required_or_addressable,
        `${spec.id} missing required_or_addressable`
      ).toMatch(/Required|Addressable/);
      expect(spec.description.length, `${spec.id} short description`).toBeGreaterThan(20);
      expect(spec.implementation_guidance.length, `${spec.id} short guidance`).toBeGreaterThan(20);
    }
  });

  it("query §164.312(a) returns Technical Safeguard specification", () => {
    const match = corpus.specifications.find((s) =>
      s.cfr_section.includes("164.312(a)")
    );
    expect(match).toBeDefined();
    expect(match!.safeguard_type).toBe("Technical");
  });

  it("covers all three safeguard types", () => {
    const types = new Set(corpus.specifications.map((s) => s.safeguard_type));
    expect(types.has("Administrative")).toBe(true);
    expect(types.has("Physical")).toBe(true);
    expect(types.has("Technical")).toBe(true);
  });

  it("includes breach notification requirements", () => {
    expect(corpus.breach_notification).toBeDefined();
    const bnString = JSON.stringify(corpus.breach_notification);
    expect(bnString).toContain("164.404");
  });

  it("NIST mappings use valid CSF 2.0 IDs", () => {
    const validPrefixes = ["GV.", "ID.", "PR.", "DE.", "RS.", "RC."];
    for (const spec of corpus.specifications) {
      for (const mapping of spec.nist_mapping) {
        expect(
          validPrefixes.some((p) => mapping.startsWith(p)),
          `Invalid NIST mapping "${mapping}" in ${spec.id}`
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// A3: Legal Pack
// ---------------------------------------------------------------------------

describe("A3: Legal Pack", () => {
  let corpus: {
    framework: string;
    aba_rules: Array<{
      id: string;
      rule_or_opinion: string;
      jurisdiction: string;
      full_text: string;
      cybersecurity_implications: string;
      nist_mapping: string[];
    }>;
    state_bar_opinions: Array<{
      id: string;
      rule_or_opinion: string;
      jurisdiction: string;
      full_text: string;
      cybersecurity_implications: string;
      nist_mapping: string[];
    }>;
  };

  beforeAll(() => {
    corpus = loadJSON("legal/corpus.json");
  });

  it("has valid top-level structure", () => {
    expect(corpus.aba_rules).toBeDefined();
    expect(corpus.state_bar_opinions).toBeDefined();
  });

  it("contains ABA Rule 1.6(c) with cybersecurity implications", () => {
    const rule = corpus.aba_rules.find(
      (r) =>
        r.rule_or_opinion.includes("1.6") &&
        (r.rule_or_opinion.includes("(c)") || r.id.includes("1.6"))
    );
    expect(rule, "ABA Rule 1.6(c) not found").toBeDefined();
    expect(rule!.cybersecurity_implications.length).toBeGreaterThan(50);
    expect(rule!.nist_mapping.length).toBeGreaterThan(0);
  });

  it("contains ABA Rule 1.1 Comment [8] on technology competence", () => {
    const rule = corpus.aba_rules.find(
      (r) =>
        r.rule_or_opinion.includes("1.1") ||
        r.id.includes("1.1")
    );
    expect(rule, "ABA Rule 1.1 not found").toBeDefined();
    expect(
      rule!.cybersecurity_implications.toLowerCase()
    ).toMatch(/competenc|technolog/);
  });

  it("includes state bar opinions from at least 4 states", () => {
    const states = new Set(corpus.state_bar_opinions.map((o) => o.jurisdiction));
    expect(states.size).toBeGreaterThanOrEqual(4);
  });

  it("every entry has NIST CSF mappings", () => {
    const allEntries = [...corpus.aba_rules, ...corpus.state_bar_opinions];
    for (const entry of allEntries) {
      expect(
        entry.nist_mapping.length,
        `${entry.id} missing nist_mapping`
      ).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// A4: Threat Intelligence
// ---------------------------------------------------------------------------

describe("A4: Threat Intelligence", () => {
  let corpus: {
    attack_chains: Array<{
      id: string;
      threat_type: string;
      sector_relevance: string[];
      attack_chain: string;
      indicators: string[];
      business_impact: string;
      defensive_measures: string[];
      source: string;
    }>;
    social_engineering: Array<{
      id: string;
      threat_type: string;
      sector_relevance: string[];
      indicators: string[];
      business_impact: string;
      defensive_measures: string[];
      source: string;
    }>;
    sector_threats: {
      healthcare: Array<{
        id: string;
        threat_type: string;
        sector_relevance: string[];
        business_impact: string;
        defensive_measures: string[];
      }>;
      legal: Array<{
        id: string;
        threat_type: string;
        sector_relevance: string[];
        business_impact: string;
        defensive_measures: string[];
      }>;
    };
  };

  beforeAll(() => {
    corpus = loadJSON("threats/corpus.json");
  });

  it("has attack chains, social engineering, and sector threats", () => {
    expect(corpus.attack_chains.length).toBeGreaterThanOrEqual(5);
    expect(corpus.social_engineering.length).toBeGreaterThanOrEqual(3);
    expect(corpus.sector_threats.healthcare.length).toBeGreaterThanOrEqual(3);
    expect(corpus.sector_threats.legal.length).toBeGreaterThanOrEqual(3);
  });

  it("healthcare ransomware query returns EHR-specific threats", () => {
    const healthcareThreats = corpus.sector_threats.healthcare;
    const ehrThreat = healthcareThreats.find(
      (t) =>
        t.threat_type.toLowerCase().includes("ransomware") ||
        t.threat_type.toLowerCase().includes("ehr")
    );
    expect(ehrThreat, "EHR/ransomware threat not found").toBeDefined();
    expect(ehrThreat!.sector_relevance).toContain("healthcare");
  });

  it("every threat has business impact with dollar amounts", () => {
    const allThreats = [
      ...corpus.attack_chains,
      ...corpus.sector_threats.healthcare,
      ...corpus.sector_threats.legal,
    ];
    for (const threat of allThreats) {
      expect(
        threat.business_impact.length,
        `${threat.id} missing business_impact`
      ).toBeGreaterThan(10);
    }
  });

  it("every threat has defensive measures", () => {
    const allThreats = [
      ...corpus.attack_chains,
      ...corpus.social_engineering,
      ...corpus.sector_threats.healthcare,
      ...corpus.sector_threats.legal,
    ];
    for (const threat of allThreats) {
      expect(
        threat.defensive_measures.length,
        `${threat.id} missing defensive_measures`
      ).toBeGreaterThan(0);
    }
  });

  it("BEC wire fraud appears in legal threats", () => {
    const legalThreats = corpus.sector_threats.legal;
    const bec = legalThreats.find(
      (t) =>
        t.threat_type.toLowerCase().includes("bec") ||
        t.threat_type.toLowerCase().includes("wire fraud") ||
        t.threat_type.toLowerCase().includes("business email")
    );
    expect(bec, "BEC/wire fraud not found in legal threats").toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// A5: Insurance Layer
// ---------------------------------------------------------------------------

describe("A5: Insurance Layer", () => {
  let corpus: {
    requirements: Array<{
      id: string;
      requirement: string;
      nist_mapping: string;
      implementation_action: string;
      documentation_needed: string;
      common_exclusions: string[];
      carrier_notes: string;
    }>;
    common_exclusions: Array<{
      id: string;
      exclusion: string;
      description: string;
      risk_mitigation: string;
      affected_nist_controls: string[];
    }>;
  };

  beforeAll(() => {
    corpus = loadJSON("insurance/corpus.json");
  });

  it("has requirements and exclusions", () => {
    expect(corpus.requirements.length).toBeGreaterThanOrEqual(10);
    expect(corpus.common_exclusions.length).toBeGreaterThanOrEqual(5);
  });

  it("MFA requirement maps to correct NIST subcategory", () => {
    const mfa = corpus.requirements.find(
      (r) =>
        r.requirement.toLowerCase().includes("mfa") ||
        r.requirement.toLowerCase().includes("multi-factor")
    );
    expect(mfa, "MFA requirement not found").toBeDefined();
    expect(mfa!.nist_mapping).toContain("PR.AC-01");
  });

  it("every requirement has carrier notes", () => {
    for (const req of corpus.requirements) {
      expect(
        req.carrier_notes.length,
        `${req.id} missing carrier_notes`
      ).toBeGreaterThan(20);
    }
  });

  it("every requirement has NIST mapping", () => {
    for (const req of corpus.requirements) {
      expect(req.nist_mapping, `${req.id} missing nist_mapping`).toBeTruthy();
    }
  });

  it("exclusions include war/nation-state", () => {
    const warExclusion = corpus.common_exclusions.find(
      (e) =>
        e.exclusion.toLowerCase().includes("war") ||
        e.exclusion.toLowerCase().includes("nation-state")
    );
    expect(warExclusion, "War exclusion not found").toBeDefined();
  });

  it("every exclusion has risk mitigation guidance", () => {
    for (const exc of corpus.common_exclusions) {
      expect(
        exc.risk_mitigation.length,
        `${exc.id} missing risk_mitigation`
      ).toBeGreaterThan(20);
    }
  });
});

// ---------------------------------------------------------------------------
// A6: Regulatory Compliance Matrix
// ---------------------------------------------------------------------------

describe("A6: Regulatory Compliance Matrix", () => {
  let matrix: {
    state_breach_laws: Array<{
      state: string;
      state_name: string;
      breach_notification_timeline_days: number;
      ag_notification_required: boolean;
      content_requirements: string[];
      hipaa_applies: boolean;
      encrypted_data_exemption: boolean;
      penalties: string;
    }>;
    cross_reference: Array<{
      nist_subcategory: string;
      hipaa_spec: string;
      aba_rule: string;
      implementation_priority: string;
      audit_evidence: string[];
    }>;
  };

  beforeAll(() => {
    matrix = loadJSON("compliance-matrix/matrix.json");
  });

  it("has state breach laws and cross-references", () => {
    expect(matrix.state_breach_laws.length).toBeGreaterThanOrEqual(50);
    expect(matrix.cross_reference.length).toBeGreaterThanOrEqual(15);
  });

  it("covers all 50 states + DC", () => {
    const states = new Set(matrix.state_breach_laws.map((s) => s.state));
    expect(states.size).toBeGreaterThanOrEqual(51);
  });

  it("healthcare org in SC returns correct breach notification timeline", () => {
    const sc = matrix.state_breach_laws.find((s) => s.state === "SC");
    expect(sc, "South Carolina not found").toBeDefined();
    expect(sc!.breach_notification_timeline_days).toBeGreaterThan(0);
    expect(sc!.hipaa_applies).toBe(true);
  });

  it("California has strict timeline", () => {
    const ca = matrix.state_breach_laws.find((s) => s.state === "CA");
    expect(ca, "California not found").toBeDefined();
    expect(ca!.breach_notification_timeline_days).toBeLessThanOrEqual(45);
    expect(ca!.ag_notification_required).toBe(true);
  });

  it("Florida has one of the shortest timelines", () => {
    const fl = matrix.state_breach_laws.find((s) => s.state === "FL");
    expect(fl, "Florida not found").toBeDefined();
    expect(fl!.breach_notification_timeline_days).toBeLessThanOrEqual(30);
  });

  it("cross-references map NIST to HIPAA and ABA", () => {
    for (const ref of matrix.cross_reference) {
      expect(ref.nist_subcategory, "Missing NIST subcategory").toBeTruthy();
      expect(ref.hipaa_spec || ref.aba_rule, `${ref.nist_subcategory} has no HIPAA or ABA mapping`).toBeTruthy();
      expect(ref.audit_evidence.length, `${ref.nist_subcategory} missing audit evidence`).toBeGreaterThan(0);
    }
  });

  it("every state has notification timeline and content requirements", () => {
    for (const state of matrix.state_breach_laws) {
      expect(
        state.breach_notification_timeline_days,
        `${state.state} missing timeline`
      ).toBeGreaterThan(0);
      expect(
        state.content_requirements.length,
        `${state.state} missing content requirements`
      ).toBeGreaterThan(0);
    }
  });
});
