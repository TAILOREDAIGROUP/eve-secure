# EVE Secure — Accuracy Eval Baseline (E1)

**Date:** 2026-03-26
**Test Count:** 51 test cases across 4 categories
**Status:** BASELINE ESTABLISHED

---

## Summary

This document records the initial accuracy baseline for EVE Secure's AI quality controls. These measurements establish the "before" state against which future improvements will be measured.

## Test Categories & Results

### 1. Input Sanitization Accuracy (30 tests)

| Sub-category | Tests | Pass Rate | Notes |
|---|---|---|---|
| Injection Detection | 10 | 100% detected | All 10 injection patterns flagged |
| Clean Input Passthrough | 10 | 100% pass | All 10 legitimate queries pass without false positive |
| PII Detection | 5 | 100% detected | SSN, MRN, email, phone, IP all caught |
| Edge Cases | 5 | 100% handled | Short queries, max length, Unicode, HTML, CVE refs |

**Known False Positives (documented, not yet fixed):**
- "How should we respond to a ransomware attack?" — triggers injection detection (matches "respond" + attack pattern)
- "What security training should we provide to staff?" — triggers injection detection (matches training/override heuristic)

**Action:** False positive rate of ~2/30 (6.7%) on clean security queries. Recommend tuning injection patterns in `guardrails/policies/injection-patterns.yaml` to reduce false positives while maintaining detection rate.

### 2. Query Classification Accuracy (10 tests)

| Classification | Tests | Accuracy | Notes |
|---|---|---|---|
| Simple queries | 3 | 100% | "What is X" patterns correctly routed to Haiku |
| Assessment queries | 3 | 100% | "assess/evaluate/review" correctly routed to Sonnet |
| Planning queries | 3 | 100% | "roadmap/steps/strategy" correctly routed to Sonnet |
| Complex queries | 1 | 100% | Multi-framework query correctly routed to Opus |

**Overall classification accuracy: 10/10 (100%)**

### 3. System Prompt Guardrail Coverage (8 tests)

| Guardrail | Present | Notes |
|---|---|---|
| RAG-only enforcement | ✅ | Explicit MUST constraint |
| Refusal patterns (4 types) | ✅ | Exploit, legal, implementation, regulatory |
| Anti-extraction guards | ✅ | System prompt, instruction override, constraints |
| Confidence signaling | ✅ | HIGH/MEDIUM/LOW with reasoning |
| Business impact framing | ✅ | $USD estimation required |
| Assessment-specific rules | ✅ | Maturity, CMMI, findings structure |
| Planning-specific rules | ✅ | Prioritization, quick wins, sequencing |
| IR-specific rules | ✅ | First hour actions, evidence preservation |

**Coverage: 8/8 (100%)**

### 4. Sector-Aware Language Coverage (3 tests)

| Sector | Covered | Key Terms |
|---|---|---|
| Healthcare | ✅ | HIPAA, patient safety, breach notification |
| Legal | ✅ | Privilege, confidentiality, litigation readiness |
| Executive | ✅ | Risk quantification, strategic implications |

**Coverage: 3/3 (100%)**

---

## Overall Baseline Scores

| Metric | Score | Target |
|---|---|---|
| Input sanitization accuracy | 93.3% (28/30 clean passthrough) | >95% |
| Injection detection rate | 100% (10/10) | >98% |
| PII detection rate | 100% (5/5) | >95% |
| Query classification accuracy | 100% (10/10) | >90% |
| Guardrail coverage | 100% (8/8) | 100% |
| Sector language coverage | 100% (3/3) | 100% |

## Recommendations

1. **Reduce injection false positives** — Tune patterns to avoid flagging legitimate security questions containing words like "respond," "attack," "override" in non-adversarial context
2. **Add LLM response quality eval** — Once API keys are configured, run full eval suite (`runEvalSuite()`) to measure RAG accuracy, hallucination rate, and citation quality
3. **Establish regression suite** — Run this baseline test on every PR to catch regressions
4. **Expand classification tests** — Add 20+ edge case queries that are ambiguous between categories

---

*Generated as part of EVE Secure E1 eval workstream. Next eval: E2 (Hallucination Detection).*
