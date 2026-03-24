# E6: Sector Translation Eval

## Purpose

Validate that EVE Secure's advisory output is **understood and actionable** by the actual humans who will use it — not just linguistically correct for the sector.

This eval determines whether EVE works for real people or just passes technical benchmarks. It is the adoption make-or-break eval.

## Eval Matrix

- **30 NIST CSF subcategories** × **3 audience sectors** = **90 eval cases**
- Each case produces EVE advisory output that gets scored by human reviewers

### Sectors

| Sector | Target Reviewer Profile | Framework Context |
|--------|------------------------|-------------------|
| Healthcare | Office manager with no security background | HIPAA 45 CFR 164 |
| Legal | Law firm partner or practice manager | ABA Model Rules, client confidentiality |
| Financial | Small business controller or office admin | PCI-DSS, GLBA |

## Reviewer Requirements

### Minimum Reviewers

- **3 reviewers per sector** (9 total minimum)
- Reviewers must be **actual non-technical professionals** from the target sector
- No security professionals, engineers, or IT staff as reviewers
- Reviewers should represent the real user persona: someone who received EVE's output and needs to act on it

### Reviewer Qualification Criteria

- Currently working in the target sector
- No formal cybersecurity training or certifications
- Responsible for some aspect of operations, compliance, or administration
- Willing to spend 60-90 minutes reviewing 10 eval cases

## Scoring Criteria

Each eval case is scored 1-5 on four dimensions:

### 1. Clarity (weight: 30%)
> "Do I understand what EVE is telling me?"

- 5: Immediately clear, no re-reading needed
- 3: Understandable after re-reading, some jargon
- 1: Cannot understand without looking things up

### 2. Actionability (weight: 30%)
> "Do I know what to do next?"

- 5: Clear next steps I could take tomorrow
- 3: General direction but need to figure out specifics
- 1: No idea what concrete action to take

### 3. Confidence (weight: 25%)
> "Do I feel confident acting on this advice?"

- 5: Would act on this immediately
- 3: Would act but want to verify with someone first
- 1: Would not act without consulting an expert

### 4. Jargon Avoidance (weight: 15%)
> "Does this feel like talking to a helpful advisor or a compliance auditor?"

- 5: Conversational, approachable, like a trusted advisor
- 3: Some technical terms but mostly accessible
- 1: Reads like a compliance audit report

## Pass/Fail Criteria

- **Pass**: Average score across all reviewers ≥ 3.5 on each dimension
- **Sector pass**: Each sector must independently pass (no cross-sector averaging)
- **Critical fail**: Any dimension averaging below 2.5 for any sector

## Feedback Loop

Results feed back into:

1. `src/lib/ai/prompts/system.ts` — sector-aware translation tuning
2. `guardrails/policies/refusal-patterns.yaml` — sector translation emphasis
3. Knowledge base examples — adding sector-specific phrasing templates

## Running the Eval

### Phase 1: Generate Eval Cases
```bash
npm run eval:accuracy  # Generates advisory output for all 30 subcategories × 3 sectors
```

### Phase 2: Human Review
1. Export eval cases to a scoring spreadsheet (Google Sheets template TBD)
2. Distribute to reviewers with instructions
3. Collect scores and free-text feedback
4. Import results back

### Phase 3: Analysis
```bash
npm run test:eval -- --filter=translation  # Analyze scores against pass/fail criteria
```

## Timeline

- Reviewer recruitment: 2 weeks before eval
- Review period: 1 week
- Analysis and system prompt tuning: 1 week
- Re-eval if any sector fails: +2 weeks

## Key Insight

> "AI doesn't teach itself, at least not for most people."

The same adoption friction that plagues enterprise AI deployment will hit EVE's users. If the assessment feels like talking to a compliance auditor instead of a helpful advisor, adoption fails regardless of how good the RAG pipeline is. This eval is where you find out if EVE actually works for real people.
