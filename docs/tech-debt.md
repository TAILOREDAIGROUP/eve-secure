# Tech Debt Register

Track technical debt items, their priority, and remediation timeline.

## Format

```markdown
## [Component/Area] - [Date Added]

**Issue**: [Description of the debt]
**Severity**: Critical | High | Medium | Low
**Priority**: P0 | P1 | P2 | P3
**Effort**: S | M | L | XL
**Status**: Open | In Progress | Resolved
**Target Resolution**: [Date or milestone]

### Context
[Background on why this debt was incurred]

### Impact
[How this affects the system or team]

### Remediation Plan
[Steps to address the debt]

### Dependencies
[Other items that need to be completed first]

### Owner
[Team member responsible]
```

## Guidelines

- Add new tech debt items as they are identified
- Review monthly with the team
- Prioritize based on risk and impact
- Include effort estimates for planning
- Update status as work progresses
- Archive resolved items with date

## Priority Definitions

- **P0/Critical**: Blocks deployment or causes production issues
- **P1/High**: Significantly impacts maintainability or performance
- **P2/Medium**: Should be addressed in next quarter
- **P3/Low**: Nice to have improvements

## Effort Estimates

- **S**: 1-4 hours
- **M**: 4-16 hours
- **L**: 16-40 hours
- **XL**: 40+ hours

## Current Items

(Add tech debt items below this line)

## AI Engine — B7 Anchored Iterative Summarization — 2026-03-24

**Issue**: Token budget summarization uses naive rolling compression — extractive keyword matching (`summarizeSection` at lines 65-150 of `token-budget.ts`) grabs lines containing "key/important/critical" then truncates. Under multi-section assessments, this causes semantic drift: section summaries lose the specific findings, scores, and recommendations that downstream sections need to reference. The "further compress" fallback (lines 329-333) just slices to first 2 lines of an already-lossy summary.
**Severity**: High
**Priority**: P1
**Effort**: M (8-12 hours)
**Status**: Open
**Target Resolution**: Post Slices 6-10, before Phase 1 ship

### Context
Identified from NemoClaw B7 analysis. EVE assessments span 6 NIST CSF functions × multiple subcategories. By the time a user reaches Function 5 (Recover), the summaries of Functions 1-3 have degraded to keyword fragments. The user's prior answers and EVE's prior recommendations are effectively lost.

### Impact
- Assessment quality degrades in later sections
- EVE may ask redundant questions or contradict earlier recommendations
- Long assessments (30+ Q&A turns) lose coherence

### Remediation Plan
1. Replace extractive summarization with **anchored iterative summarization**:
   - Each section summary retains anchored facts: scores given, specific recommendations made, user-stated constraints (budget, timeline, staff count)
   - Summary format: `[Section: X] [Score: Y/5] [Key findings: ...] [Constraints: ...] [Recommendations: ...]`
2. Add a `sectionAnchors` field to `SectionSummary` interface — structured data that survives compression
3. Compression cascade: full text → structured anchors + narrative → structured anchors only (never lose anchors)
4. Add regression test: 30-turn assessment where Section 6 references a constraint stated in Section 1

### Dependencies
- B6 (conversation state) — already complete
- No blocking dependencies

### Owner
CLI implementation

---

## AI Guardrails — Externalize to Declarative Policy Files — 2026-03-24

**Issue**: All guardrail patterns are hardcoded in TypeScript — 200+ injection patterns in `input-sanitizer.ts`, output validation rules in `output-validator.ts`, refusal patterns in `system.ts`. Updating any guardrail requires a code change and redeploy.
**Severity**: Medium
**Priority**: P2
**Effort**: M (8-12 hours)
**Status**: Open
**Target Resolution**: Post Slices 6-10, before Phase 1 ship

### Context
Identified from NemoClaw declarative guardrails pattern. EVE serves regulated industries (healthcare, legal) where security teams (e.g., Acrisure) need to audit guardrail policies. Asking auditors to review TypeScript is a friction point. Externalizing to versioned YAML/JSON files makes policies auditable by non-engineers and updatable without code deploys.

### Impact
- Guardrail updates require code deploys instead of policy file updates
- Security auditors must read TypeScript to verify policies
- No versioned audit trail separate from code commits

### Remediation Plan
1. Create `guardrails/policies/` directory at project root with:
   - `injection-patterns.yaml` — move patterns from `input-sanitizer.ts` lines 94-175
   - `output-rules.yaml` — citation rules, harm filters, length limits from `output-validator.ts`
   - `refusal-patterns.yaml` — what EVE refuses, from `system.ts` lines 31-106
   - `model-constraints.yaml` — model routing, token limits, cost caps
2. Add a `PolicyLoader` in `src/lib/ai/guardrails/policy-loader.ts`:
   - Loads YAML at startup, validates with Zod schemas
   - Caches parsed policies, reloads on file change (dev) or restart (prod)
3. Refactor `input-sanitizer.ts` and `output-validator.ts` to read from loaded policies
4. Version policy files in Git alongside knowledge base
5. Add policy file validation to CI pipeline

### Dependencies
- None — can be done independently

### Owner
CLI implementation

---

## DevEx — Dev Container Configuration — 2026-03-24

**Issue**: No `.devcontainer/` configuration exists. New engineers must manually set up Node 20, PostgreSQL, Redis, extensions, and environment variables.
**Severity**: Low
**Priority**: P3
**Effort**: S (2-4 hours)
**Status**: Open
**Target Resolution**: Post Slices 6-10, before Phase 1 ship

### Context
Identified from Factory.ai agent readiness framework — "the agent isn't broken, the environment is." For a 3-engineer team, reproducible dev environments eliminate "works on my machine" friction. Also benefits Claude Code and other AI coding agents that can leverage dev containers.

### Impact
- Onboarding friction for new engineers
- Environment inconsistencies between developers
- AI coding agents can't auto-provision environments

### Remediation Plan
1. Create `.devcontainer/devcontainer.json`:
   - Base image: Node 20 + PostgreSQL 16 + Redis
   - VS Code extensions: ESLint, Prettier, Tailwind CSS IntelliSense, Prisma
   - Port forwarding: 3000 (Next.js), 5432 (PostgreSQL), 6379 (Redis)
   - Post-create command: `npm install && cp .env.example .env.local`
2. Create `.devcontainer/docker-compose.yml` referencing existing `docker-compose.yml` services
3. Test: `git clone → open in VS Code → Reopen in Container → F5 → running`

### Dependencies
- Existing `docker-compose.yml` and `.env.example`

### Owner
CLI implementation

---

## Product — E6 Sector Translation Eval Must Use Non-Technical Reviewers — 2026-03-24

**Issue**: The E6 sector translation eval (30 subcategories × 3 audiences) risks testing only linguistic accuracy ("does the language match the sector") instead of actual comprehension and actionability by target users.
**Severity**: High
**Priority**: P1
**Effort**: L (design + recruitment + review cycles)
**Status**: Open (product design — no code change)
**Target Resolution**: Before Phase 1 ship

### Context
Core adoption thesis from AI deployment research: companies lack expertise to apply AI solutions. EVE's value proposition is translating complex frameworks (NIST CSF, HIPAA, ABA) into actionable guidance for non-technical users. If the assessment reads like a compliance audit instead of a helpful advisor, adoption fails regardless of RAG pipeline quality.

### Impact
- Make-or-break eval for product-market fit
- Technical-sounding guidance → low adoption by healthcare office managers, law firm partners
- Passing technical benchmarks ≠ working for real users

### Remediation Plan
1. E6 eval must include ACTUAL non-technical reviewers from target sectors:
   - Healthcare: office manager with no security background
   - Legal: law firm partner or practice manager
   - Financial: small business controller
2. Eval criteria: "Does the user understand what EVE is telling them to do AND feel confident acting on it?"
3. Minimum 3 reviewers per sector, scoring on: clarity, actionability, confidence, jargon avoidance
4. Results feed back into system prompt tuning (`system.ts` sector-aware translation)

### Dependencies
- E6 eval framework design
- Reviewer recruitment (external)

### Owner
Product team / Tony

---

## Historical Items

Archive completed or obsolete items here with resolution date.
