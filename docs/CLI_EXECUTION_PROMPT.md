# EVE Secure — Claude Code CLI Execution Prompt

Copy and paste the prompt below into Claude Code CLI after navigating to the EVE Secure project root.

---

## STEP 1: Initial Setup Prompt

Paste this FIRST to let Claude Code orient itself to the codebase:

```
Read CLAUDE.md, then read docs/build-plan.md in full. Read the database migration at src/lib/db/migrations/001_foundation.sql. Read src/lib/ai/prompts/system.ts, src/lib/ai/rag/pipeline.ts, src/lib/ai/litellm.ts, src/lib/ai/guardrails/input-sanitizer.ts, src/lib/ai/guardrails/output-validator.ts. Read src/lib/auth/clerk.ts and src/middleware/auth.ts. Read src/lib/encryption/kms.ts. Read package.json and tsconfig.json.

After reading everything, give me a status report:
1. What's already built and ready to execute
2. What needs to be wired together
3. What's scaffolded but needs implementation
4. Recommended first 3 slices to build in order

Do NOT write any code yet. Just report.
```

---

## STEP 2: Foundation Wiring (Slice 0)

After reviewing the status report, paste this:

```
CONTEXT: Read CLAUDE.md. This is Slice 0 — wiring the foundation.

TASK: Initialize the project so it runs locally.

STEPS:
1. Run `npm install` to install all dependencies from package.json
2. Create `src/lib/db/index.ts` — Supabase client initialization using env vars from .env.example. Export `supabase` (anon client) and `supabaseAdmin` (service role client). Include connection health check function.
3. Create `src/lib/db/queries/index.ts` — Base query helpers that enforce tenant isolation:
   - `withTenant(tenantId: string)` — returns scoped query builder
   - `getTenantFromSession(session)` — extracts tenant_id from Clerk session
   - All queries MUST use RLS context. No raw queries without tenant scoping.
4. Wire `src/app/layout.tsx` to use ClerkProvider from @clerk/nextjs
5. Wire `src/middleware.ts` to use clerkMiddleware() with proper public/protected route config
6. Verify: `npm run dev` starts without errors. `npm run typecheck` passes. `npm run lint` passes.
7. Run `npm test` — at minimum the health check endpoint test should pass.

CONSTRAINTS:
- Follow patterns already established in src/lib/auth/clerk.ts
- Use Zod schemas from src/types/index.ts
- Every new file gets a corresponding test in tests/
- Do NOT modify CLAUDE.md or docs/build-plan.md
- Run the verify command from CLAUDE.md when complete
```

---

## STEP 3: Auth + Database (Slice 1)

```
CONTEXT: Read CLAUDE.md. Slice 0 is complete. This is Slice 1 — Auth + Database + Seed Data.

TASK: Build F1 (Database) + D1 (Tenant Isolation) + D3 (Auth Hardening) as one vertical slice.

DATABASE:
1. Run the migration at src/lib/db/migrations/001_foundation.sql against local Supabase
2. Create `src/lib/db/migrations/002_rls_policies.sql`:
   - RLS policy on EVERY table with tenant_id
   - Policy: tenant can only SELECT/INSERT/UPDATE/DELETE their own rows
   - Admin policy: super-admin can read all tenants
   - Emergency access bypass policy (for D10 emergency codes)
3. Create `scripts/seed.ts`:
   - 2 test tenants: "Greenfield Medical Group" (healthcare, SC) and "Morrison & Associates" (legal, NY)
   - 3 users per tenant (admin, user, readonly)
   - Sample org profiles with realistic data
   - Sample assessment sessions at various stages
   - Idempotent (safe to run multiple times)

AUTH:
4. Implement `src/lib/auth/emergency-access.ts`:
   - Generate 8 one-time codes at onboarding
   - Store as bcrypt hashes only
   - Validate against our DB directly (bypasses Clerk)
   - Used code immediately invalidated
   - Never store or return plaintext after generation

API:
5. Implement `src/app/api/v1/auth/emergency/route.ts`:
   - POST: validate emergency code, return temporary session token
   - Zod validation on input
   - Rate limit: 3 attempts per 15 minutes

TESTS:
6. Write tests in tests/unit/security/:
   - "User A cannot access User B's data via API"
   - "User A cannot access User B's data via direct DB query with RLS"
   - "Emergency code works when valid"
   - "Used emergency code is rejected on second use"
   - "Plaintext emergency codes are not stored in database"
   - "Rate limit blocks 4th emergency code attempt in 15 minutes"

CONSTRAINTS:
- Follow patterns in src/middleware/auth.ts for auth middleware
- Follow patterns in src/lib/encryption/kms.ts for key management
- Run verify command when complete
- Commit with descriptive message
```

---

## STEP 4: Onboarding + Org Profile (Slice 2)

```
CONTEXT: Read CLAUDE.md. Slices 0-1 complete. This is Slice 2 — Onboarding (C1).

TASK: Build the complete onboarding flow from account creation through first EVE interaction.

API:
1. Implement `src/app/api/v1/onboarding/route.ts`:
   - POST: Create org profile (Zod validated)
   - Fields: org_name, sector (healthcare|legal), state, employee_count, it_budget_range, current_tools (EHR/DMS selection), has_cyber_insurance, carrier_name
   - Encrypt profile with tenant KMS key (use src/lib/encryption/kms.ts pattern)
   - Generate emergency access codes (call emergency-access.ts)
   - Set default notification preferences
   - Return: profile + emergency codes (one-time display)

2. Implement `src/app/api/v1/onboarding/[tenantId]/route.ts`:
   - GET: Return org profile (decrypted) for current tenant only
   - PUT: Update org profile fields
   - Auth required, tenant-scoped

FRONTEND:
3. Wire `src/app/(dashboard)/onboarding/page.tsx` to the API:
   - 4-step wizard already scaffolded — connect each step to API calls
   - Use React Query mutations for form submission
   - Show emergency codes with clear "save these securely" instructions
   - Redirect to dashboard on completion

TESTS:
4. Write tests:
   - "Onboarding creates org profile with correct sector"
   - "Emergency codes displayed exactly once"
   - "Profile encrypted at rest (raw DB read shows ciphertext)"
   - "Tenant A cannot read Tenant B's org profile"
   - "Invalid sector rejected with 400"
   - "Missing required fields rejected with 400"

CONSTRAINTS:
- Follow existing Zod schemas in src/types/index.ts — extend if needed
- Profile data encrypted with tenant-specific KMS key
- Run verify command when complete
- Commit with descriptive message
```

---

## STEP 5: Knowledge Base + RAG (Slice 3)

```
CONTEXT: Read CLAUDE.md. Slices 0-2 complete. This is Slice 3 — Knowledge Base (A1) + RAG Pipeline (B2).

TASK: Build the NIST CSF 2.0 knowledge corpus and wire it through the RAG pipeline.

KNOWLEDGE:
1. Create `knowledge/nist-csf/corpus.json`:
   - All 6 Functions, 22 Categories, 106 Subcategories from NIST CSF 2.0
   - Each entry: { id, function, category, subcategory, description, implementation_examples, informative_references }
   - Include CSF Tiers (1-4) as reference data

2. Create `scripts/ingest-knowledge.ts`:
   - Read corpus.json
   - Generate embeddings via Voyage AI (or OpenAI fallback)
   - Store in knowledge_documents table with pgvector column
   - Store structured metadata for exact-match queries
   - Calculate SHA-256 hash per document
   - Store hash manifest in separate location (A7)
   - Idempotent (re-run safe)

RAG PIPELINE:
3. Wire `src/lib/ai/rag/pipeline.ts` (already scaffolded) to actually execute:
   - Query → embedding → pgvector cosine similarity (top-k=8)
   - Hybrid: if query contains citation pattern (§, CFR, Rule), also exact SQL match
   - Merge, deduplicate, rank results
   - Pass retrieved context + query + system prompt → LiteLLM
   - Response must cite sources

4. Implement `src/app/api/v1/knowledge/route.ts`:
   - GET: Search knowledge base (query param)
   - Returns: matched documents with similarity scores
   - Admin only: POST to trigger re-ingestion

TESTS:
5. Write tests in tests/eval/accuracy/:
   - "Query 'what does NIST CSF say about access control' returns PR.AA subcategories"
   - "Query '§164.312(a)(1)' returns exact HIPAA match via SQL (not just vector)"
   - "Query about cooking recipes returns 'I don't have verified info on that'"
   - "Every response includes source citations"
   - "Hybrid search correctly merges vector + exact results"

CONSTRAINTS:
- Follow embedding strategy documented in the codebase
- System prompt from src/lib/ai/prompts/system.ts enforces RAG-only
- Run verify command when complete
- Commit with descriptive message
```

---

## STEP 6: ASSESS Mode (Slice 4)

```
CONTEXT: Read CLAUDE.md. Slices 0-3 complete. This is Slice 4 — ASSESS Mode (C2). The core product feature.

TASK: Build the conversational assessment covering all 6 NIST CSF Functions.

API:
1. Implement `src/app/api/v1/assessment/route.ts`:
   - POST: Start new assessment session
   - GET: List assessment sessions for current tenant
   - Creates assessment_session record with status, progress, section tracking

2. Implement `src/app/api/v1/assessment/[sessionId]/route.ts`:
   - GET: Return assessment session with full state (progress, current section, Q&A history)
   - DELETE: Cancel assessment session

3. Implement `src/app/api/v1/assessment/[sessionId]/respond/route.ts`:
   - POST: Submit user response to current assessment question
   - Calls RAG pipeline with: user response + org profile + assessment context
   - EVE generates next question based on: sector, previous answers, current CSF function
   - Adapts: healthcare gets HIPAA-specific Qs, legal gets ABA-specific Qs
   - Saves response to assessment_responses table
   - Updates progress percentage
   - Returns: EVE's next question via SSE stream

4. Implement `src/app/api/v1/sse/route.ts`:
   - SSE endpoint for streaming AI responses
   - Auth validated on connect and every 5 min during stream
   - Cache in-progress responses for 60s (reconnect recovery)
   - Tokens stream as they arrive from LiteLLM

CONVERSATION STATE (B6):
5. Implement conversation state management:
   - Session persists across browser closes (DB-backed via B6 pattern)
   - Rolling context window: current section full Q&A + summaries of previous
   - Token budget management (B7): compress oldest context when approaching limit
   - Never truncate retrieved knowledge

FRONTEND:
6. Wire `src/app/(dashboard)/assessment/page.tsx` + `src/components/assessment/chat-interface.tsx`:
   - Connect to SSE endpoint via useSSE hook
   - Show progress bar (% complete, current CSF function)
   - Display EVE responses with streaming (typewriter effect)
   - Show source citations inline
   - Section navigation (jump to specific CSF function)
   - Resume from where user left off

TESTS:
7. Write tests:
   - "Healthcare org gets HIPAA-specific questions"
   - "Legal org gets ABA-specific questions"
   - "Assessment progress saves and resumes across sessions"
   - "Token budget stays within model limit over 60+ exchanges"
   - "SSE reconnects and receives remaining response"
   - "Tenant A cannot access Tenant B's assessment"

CONSTRAINTS:
- Use LiteLLM routing: Sonnet for assessment questions, Haiku for summaries
- All responses through RAG pipeline (no general knowledge)
- Follow streaming pattern from src/components/shared/streaming-text.tsx
- Run verify command when complete
- Commit with descriptive message
```

---

## STEP 7: PLAN Mode (Slice 5)

```
CONTEXT: Read CLAUDE.md. Slices 0-4 complete. This is Slice 5 — PLAN Mode (C3).

TASK: Build the prioritized action plan generator from assessment gaps.

API:
1. Implement `src/app/api/v1/plan/route.ts`:
   - POST: Generate action plan from completed assessment
   - Input: assessment_session_id
   - Process: gaps from assessment + org profile → RAG query for each gap → prioritized recommendations
   - Each action item: rank, specific cost estimate, difficulty (easy/med/hard), time to implement, compliance citations, insurance requirements, business impact of NOT doing it
   - "Four Fundamentals" (MFA, email filtering, offline backup, IR plan) always top for Tier 1 orgs
   - Plan respects stated budget
   - Store in action_plans table
   - GET: List plans for current tenant

2. Implement `src/app/api/v1/plan/[planId]/route.ts`:
   - GET: Return full plan with all action items
   - PUT: Update action item status (not started/in progress/complete)
   - Auth + tenant scoped

FRONTEND:
3. Wire `src/app/(dashboard)/plan/page.tsx`:
   - Display action items using ActionCard component
   - Filter by: priority, difficulty, compliance framework, status
   - Sort by: rank, cost, time
   - Show total cost vs budget
   - Progress tracking (% of actions completed)

TESTS:
4. Write tests:
   - "Healthcare $500/mo plan differs from legal $2K/mo plan"
   - "MFA in top 3 for both orgs if absent"
   - "Cost estimates within stated budget"
   - "Every action has compliance + insurance tags"
   - "Four Fundamentals prioritized for Tier 1 orgs"
   - "Tenant A cannot access Tenant B's plan"

CONSTRAINTS:
- Use Opus for complex cross-domain reasoning in plan generation
- All recommendations sourced from knowledge base (RAG)
- Run verify command when complete
- Commit with descriptive message
```

---

## STEP 8: Documents + Admin (Slice 6)

```
CONTEXT: Read CLAUDE.md. Slices 0-5 complete. This is Slice 6 — Documents (C4, C10) + Admin (C11).

TASK: Build document generation and admin panel.

DOCUMENTS:
1. Implement `src/app/api/v1/documents/route.ts`:
   - POST: Generate document (type: cost_of_inaction | assessment_report | resilience_checklist)
   - Calls Lambda PDF generator (src/lib/pdf/generator.ts)
   - Input sanitized before template injection
   - Upload to S3 with tenant KMS
   - Store metadata in generated_documents table
   - GET: List documents for current tenant

2. Implement Cost of Inaction Brief (C4):
   - 1-page PDF: top 3 gaps, cost to fix, financial exposure
   - Regulatory penalties with citations
   - Average breach cost for sector with source
   - Insurance implications
   - Sign-off line for leadership

3. Implement Assessment Report (C10):
   - Full PDF/DOCX: executive summary, Tier rating, gap detail, action plan, compliance mapping
   - Professional formatting, 5-15 pages
   - Includes date, org name, EVE version

ADMIN:
4. Implement `src/app/api/v1/admin/tenants/route.ts`:
   - GET: List all tenants (super-admin) or current tenant (tenant-admin)
   - Role-based access: super-admin sees all, tenant-admin sees own only

5. Implement `src/app/api/v1/admin/knowledge/route.ts`:
   - GET: Knowledge base version, health status, document count
   - POST: Trigger re-ingestion (super-admin only)

6. Implement `src/app/api/v1/admin/evals/route.ts`:
   - GET: Latest eval results dashboard data
   - Super-admin only

FRONTEND:
7. Wire admin page and documents page to APIs

TESTS:
8. Write tests:
   - "Cost of Inaction PDF generates with correct data"
   - "Assessment Report includes all sections"
   - "Super-admin sees all tenants"
   - "Tenant-admin sees only their tenant"
   - "Document generation sanitizes malicious input"

CONSTRAINTS:
- PDF generation via Lambda pattern in src/lib/pdf/generator.ts
- No direct S3 URLs — pre-signed only
- Run verify command when complete
- Commit with descriptive message
```

---

## SLICES 7-10: Phase 1.1 Features

After Core (Slices 0-6) is solid, build Phase 1.1 one slice at a time:

### Slice 7: Insurance Questionnaire (C5)
```
CONTEXT: Read CLAUDE.md + docs/build-plan.md C5 section. Build the insurance questionnaire helper. Client uploads PDF → EVE extracts questions → maps to posture → pre-fills answers → flags gaps. Use file upload security from src/lib/storage/ (magic byte validation, ClamAV, pre-signed URLs). Output: completed questionnaire + cover letter.
```

### Slice 8: Offline IR Package (C7)
```
CONTEXT: Read CLAUDE.md + docs/build-plan.md C7 section. Build downloadable encrypted ZIP/HTML: IR plan, emergency contacts, containment steps, regulatory templates. AES-256 encrypted, client sets password. Works offline. Auto-regenerates on posture change.
```

### Slice 9: IR Walkthrough (C8)
```
CONTEXT: Read CLAUDE.md + docs/build-plan.md C8 section. Build IR mode: structured intake, step-by-step containment for non-technical staff, timestamped documentation, regulatory notification drafts. Calm, clear language. All logged to audit trail.
```

### Slice 10: Tabletop Generator (C9)
```
CONTEXT: Read CLAUDE.md + docs/build-plan.md C9 section. Build custom tabletop exercise generator: narrative, timed injects, discussion questions, evaluation rubric, facilitator guide. Sector-specific scenarios using org's actual systems. Printable PDF package.
```

---

## REFERENCE: Pull from Other Repos

When you have access to open-brain, project_eve, or tkg-foundation, look for:

### From open-brain:
- Any AI gateway / LiteLLM routing patterns
- Prompt engineering patterns or guardrails
- Eval framework patterns
- Skill/plugin architecture patterns

### From project_eve:
- Any existing EVE conversation patterns
- Assessment logic or question trees
- Knowledge base structures
- UI components or design system

### From tkg-foundation:
- Auth patterns (Clerk integration)
- Multi-tenant patterns
- API middleware patterns
- Database query patterns
- Encryption/KMS patterns

To integrate: open the relevant file, then tell Claude Code:
```
Read this file from [repo]. Adapt its patterns into EVE Secure following the architecture in CLAUDE.md. Specifically integrate: [what you want]. Place it in: [target path]. Write tests.
```

---

## VERIFICATION COMMAND

After every slice, run:
```
npm run typecheck && npm run lint && npm test && echo "=== VERIFY PASS ===" || echo "=== VERIFY FAIL ==="
```

Never proceed to the next slice until the current one passes verification.
