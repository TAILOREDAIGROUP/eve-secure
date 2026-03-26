# EVE Secure — Hallucination Detection Baseline (E2)

**Date:** 2026-03-26
**Test Count:** 75 test cases across 7 categories
**Status:** BASELINE ESTABLISHED

---

## Summary

This document records the hallucination detection baseline for EVE Secure. It measures whether the system has sufficient guardrails to prevent fabricated security recommendations that aren't grounded in the knowledge base.

## Test Categories & Results

### 1. System Prompt Anti-Hallucination Constraints (6 tests)

| Constraint | Present | Enforcement |
|---|---|---|
| RAG-only grounding (MUST constraint) | ✅ | "MUST base all responses exclusively on the provided knowledge context" |
| Knowledge gap disclosure | ✅ | "explicitly state knowledge gaps" |
| Training data prohibition | ✅ | "Do not reference external information, training data" |
| Source attribution requirement | ✅ | "cite the specific source for each claim" |
| Assessment evidence requirement | ✅ | "Source or context that supports this finding" |
| Planning business driver requirement | ✅ | "Business Driver: Why this matters" |

**Result: 6/6 (100%) — All anti-hallucination constraints present in prompts.**

### 2. Knowledge Source Traceability (20 questions)

Each question maps to a specific knowledge corpus and has defined grounding patterns:

| ID | Question (abbreviated) | Expected Sources | Citation Pattern |
|---|---|---|---|
| hal-001 | Six functions of NIST CSF 2.0 | nist-csf | GOVERN/IDENTIFY/PROTECT/DETECT/RESPOND/RECOVER |
| hal-002 | Tier rating system | nist-csf | Tier 1-4, Partial/Risk Informed/Repeatable/Adaptive |
| hal-003 | GOVERN function scope | nist-csf | GV.*, governance, risk management strategy |
| hal-004 | CSF 2.0 vs 1.1 differences | nist-csf | GOVERN addition, supply chain |
| hal-005 | PROTECT subcategories | nist-csf | PR.*, access, awareness, data security |
| hal-006 | ID.RA Risk Assessment | nist-csf | ID.RA, vulnerabilities, threats |
| hal-007 | HIPAA administrative safeguards | hipaa | 164.308, security management |
| hal-008 | Breach notification timeline | hipaa | 60 days, 164.404, OCR |
| hal-009 | ePHI encryption requirements | hipaa | 164.312, addressable |
| hal-010 | Business Associate Agreements | hipaa | BAA, 164.314 |
| hal-011 | Physical safeguard requirements | hipaa | 164.310, facility, workstation |
| hal-012 | ABA Rule 1.6 confidentiality | legal | Rule 1.6, reasonable efforts |
| hal-013 | ABA Formal Opinion 477R | legal | 477R, technology competence |
| hal-014 | Attorney cybersecurity obligations | legal | Rule 1.1, technology |
| hal-015 | Healthcare ransomware landscape | threats | Ransomware, healthcare, phishing |
| hal-016 | Top SMB attack vectors | threats | Phishing, credential theft, BEC |
| hal-017 | Business email compromise | threats | BEC, impersonation, wire fraud |
| hal-018 | Insurance carrier requirements | insurance | MFA, backup, IR plan |
| hal-019 | MFA effect on premiums | insurance | MFA, premium reduction |
| hal-020 | HIPAA encryption safe harbor | hipaa, insurance | Safe harbor, breach notification |

**Result: 20/20 questions have defined grounding sources and citation patterns.**

### 3. Citation Requirement Validation (20 tests)

Each citation pattern was validated against known correct answer fragments.

**Result: 20/20 (100%) — All patterns match valid content.**

### 4. Hallucination Pattern Catalogue (20 tests)

52 distinct hallucination examples catalogued across 20 questions. Examples:

| Category | Hallucination Example | Why It's Wrong |
|---|---|---|
| NIST CSF | "PREVENT function" | CSF 2.0 has 6 functions; PREVENT is not one |
| NIST CSF | "Tier 5" or "Tier 0" | Tiers are 1-4 only |
| HIPAA | "24 hours" breach notification | Actual: 60 days |
| HIPAA | "mandatory encryption" | Encryption is addressable, not required |
| ABA | "attorneys must be CISSP certified" | No such bar requirement exists |
| Threats | "ransomware is declining" | Healthcare targeting is increasing |
| Insurance | "no controls required" | Carriers increasingly mandate MFA, backups |

**Result: 52 fabrication patterns documented for regression detection.**

### 5. Recommendation Validator — Ungrounded Claim Detection (4 tests)

| Test | Result |
|---|---|
| Flags $5M SIEM for 15-person clinic | ✅ DISPROPORTIONATE flagged |
| Accepts $2,500 MFA recommendation | ✅ No false positive |
| Handles sector-mismatched recs | ✅ Validated |
| Adds disclaimers when flagged | ✅ Working |

### 6. RAG Pipeline Graceful Degradation (2 tests)

| Test | Result |
|---|---|
| Empty results without throwing | ✅ Graceful |
| Regulatory citation extraction works | ✅ No errors |

### 7. Coverage Summary (3 tests)

| Metric | Result |
|---|---|
| All 5 knowledge corpora covered | ✅ nist-csf, hipaa, legal, threats, insurance |
| Every question has hallucination examples | ✅ 20/20 |
| Total hallucination examples | 52 (target: 20+) |

---

## Overall Hallucination Defense Scores

| Layer | Score | Notes |
|---|---|---|
| Prompt-level anti-hallucination | 100% (6/6) | All constraints in system prompt |
| Source traceability | 100% (20/20) | All questions have grounding sources |
| Citation validation | 100% (20/20) | All patterns match valid content |
| Hallucination catalogue | 52 patterns | 2.6 fabrications/question |
| Recommendation validator | 100% (4/4) | Catches disproportionate claims |
| RAG graceful degradation | 100% (2/2) | No crashes on empty context |

## Recommendations

1. **Run with live LLM** — When API keys are configured, run all 20 questions through the full RAG pipeline and verify citations in actual responses
2. **Automated regression** — Add hallucination patterns to CI to catch regressions
3. **Expand catalogue** — Add 30+ more hallucination patterns focused on numerical fabrication (fake statistics, invented CVE numbers)
4. **Add cross-tenant leak test** — Verify LLM never references other tenant's assessment data

---

*Generated as part of EVE Secure E2 eval workstream. Next eval: E3 (Citation Accuracy).*
