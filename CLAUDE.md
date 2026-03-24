# EVE Secure — Production AI Cybersecurity Advisory Platform

**Purpose:** Healthcare & legal risk assessment via RAG-only Claude integration with multi-tenant isolation.

## Tech Stack
- **Frontend:** Next.js 14+ (Cloudflare Pages), Shadcn/UI, Tailwind, Zustand
- **Backend:** Supabase (PostgreSQL + pgvector + Auth + MFA/TOTP + Automatic Embeddings), R2 storage
- **AI:** Claude (Haiku/Sonnet/Opus via OpenRouter + direct Anthropic for HIPAA), RAG-only
- **Infrastructure:** Cloudflare (Pages, R2, KV, WAF), Sentry error tracking, Grafana Cloud
- **CI/CD:** GitHub Actions (lint, typecheck, test, security audit, build)

## Directory Map
```
src/app/           # Next.js routes (auth, dashboard, API v1, webhooks)
src/components/    # Feature-organized React components
src/lib/           # Core: ai/, db/, auth/, encryption/, logging/, pdf/, storage/
src/types/         # TypeScript interfaces
src/store/         # Zustand state
tests/             # eval/, unit tests (behavior-first)
infra/             # Pulumi, Docker configs
knowledge/         # RAG source documents
docs/              # Architecture, tech debt, build plan
```

## Critical Rules
**Database:** Every table has `tenant_id` with RLS. Use `TIMESTAMPTZ`, `DECIMAL(10,2)` for money—never FLOAT.
**Auth:** Verify auth before logic. Verify tenant ownership on every data access.
**AI:** RAG-only. System prompts server-side only. User input never in prompts. No general knowledge.
**Security:** No secrets in code. AES-256 per-tenant KMS. TLS 1.3. Zod validation on all inputs.
**Code:** No `any` types. No console.log in production. Max 50 lines/function. Behavior tests required.

## Standards
[CSF] NIST CSF 2.0 · [ZT] NIST SP 800-207 (Zero Trust) · [OW] OWASP LLM Top 10 2025 · [HIP] HIPAA 45 CFR 164 · [SOC] SOC 2 TSC · [EVL] EVE Eval Framework

## Essential Commands
```bash
npm run dev          # Start local (Docker Compose)
npm run build        # Production build
npm run test         # Run behavior tests
npx tsc --noEmit     # Type check
npm run lint         # Linting
.claude/commands/verify-slice.md  # Validate vertical slice
```

## Workflow
1. **Find code:** Search `src/` by feature. Check `docs/architecture.md` for slice patterns.
2. **Add feature:** Create vertical slice (routes + components + lib + tests). Run `verify-slice`.
3. **Test & deploy:** Write behavior tests. Run `npm run test`. Push to staging first.
4. **Security:** Every route checks auth + tenant. Every query filters by `tenant_id`. No hardcoded secrets.

---
**Maintainer:** EVE Secure Team · **Last Updated:** 2026-03-24 · **Status:** Production
