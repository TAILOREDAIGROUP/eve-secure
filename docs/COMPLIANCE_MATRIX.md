# EVE Secure Compliance Matrix

## Overview

This document maps regulatory requirements to EVE Secure's implementation. Updated as part of ongoing compliance program.

---

## 1. HIPAA 45 CFR 164 — Security Rule

| Requirement | Standard | Implementation | Status | Evidence |
|---|---|---|---|---|
| Access Control (§164.312(a)(1)) | Unique user identification | Clerk authentication with MFA (TOTP), unique user IDs per tenant | Complete | `src/middleware/auth.ts`, Clerk dashboard config |
| Access Control — Emergency Access | Emergency access procedure | 8 single-use bcrypt-hashed emergency codes per user, separate auth endpoint | Complete | `src/lib/auth/emergency-access.ts` |
| Audit Controls (§164.312(b)) | Record and examine activity | Immutable S3 audit trail with Object Lock, tenant-scoped, encrypted | Complete | `src/lib/logging/audit-trail.ts` |
| Integrity Controls (§164.312(c)(1)) | Protect ePHI from alteration | SHA-256 checksums on audit events, KMS encryption at rest | Complete | `src/lib/encryption/kms.ts` |
| Transmission Security (§164.312(e)(1)) | Encrypt ePHI in transit | TLS 1.3 via Cloudflare, HSTS headers, certificate pinning | Complete | `src/middleware/security-headers.ts`, Cloudflare config |
| Authentication (§164.312(d)) | Verify person seeking access | Clerk MFA + session management, 30-min timeout, deny-list | Complete | `src/lib/auth/session-invalidation.ts` |
| Automatic Logoff (§164.312(a)(2)(iii)) | Terminate session after inactivity | 30-minute session timeout via Clerk + Redis deny-list | Complete | Clerk auth settings, `src/middleware/auth.ts` |
| Encryption at Rest (§164.312(a)(2)(iv)) | Encrypt ePHI at rest | AES-256 via AWS KMS, tenant-specific keys | Complete | `src/lib/encryption/kms.ts` |
| Breach Notification (§164.404) | Notify individuals within 60 days | Incident response procedures documented, audit trail for detection | Complete | `docs/BACKUP_RESTORE.md`, incident response plan |
| BAA Requirements (§164.502(e)) | Business associate agreements | Supabase BAA (Team plan), Anthropic BAA, Cloudflare DPA | Complete | Vendor agreements on file |
| Minimum Necessary (§164.502(b)) | Limit ePHI access to minimum needed | Row-level security (RLS), tenant isolation, role-based access | Complete | Supabase RLS policies, `src/middleware/auth.ts` |

---

## 2. NIST SP 800-207 — Zero Trust Architecture

| Requirement | Standard | Implementation | Status | Evidence |
|---|---|---|---|---|
| Verify Explicitly | Always authenticate and authorize | Every API request verified via Clerk + session deny-list check | Complete | `src/middleware/auth.ts` |
| Least Privilege Access | Limit access to minimum needed | Role-based access control, tenant isolation via RLS | Complete | Supabase RLS, Clerk roles |
| Assume Breach | Minimize blast radius | Tenant-scoped KMS keys, cross-tenant PII scanning, session invalidation | Complete | `src/lib/ai/guardrails/output-validator.ts` |
| Micro-segmentation | Segment resources by policy | Per-tenant database isolation (RLS), per-tenant encryption keys | Complete | Supabase RLS policies |
| Dynamic Policy | Context-aware access decisions | Rate limiting (IP + user), Redis deny-list, real-time session checks | Complete | `src/middleware/auth.ts` |
| Continuous Monitoring | Monitor all access patterns | Structured logging (Pino → Grafana Loki), audit trail | Complete | `src/lib/logging/logger.ts` |
| Device/Identity Trust | Validate device and identity | MFA enforcement, session fingerprinting, automatic logoff | Complete | Clerk MFA config |

---

## 3. SOC 2 Trust Services Criteria

| Requirement | Standard | Implementation | Status | Evidence |
|---|---|---|---|---|
| CC1.1 — Integrity and Ethics | COSO principle | Code review policy, security-first development practices | Complete | GitHub branch protection, PR reviews |
| CC5.1 — Logical Access Controls | Control activities | Clerk auth + RBAC, MFA, session management | Complete | `src/middleware/auth.ts` |
| CC5.2 — Authentication Mechanisms | Multi-factor authentication | TOTP MFA via Clerk, emergency access codes as backup | Complete | Clerk config, `src/lib/auth/emergency-access.ts` |
| CC6.1 — Encryption | Protect data in transit and at rest | TLS 1.3 (transit), AES-256 KMS (rest), tenant-scoped keys | Complete | `src/middleware/security-headers.ts`, `src/lib/encryption/kms.ts` |
| CC6.6 — System Boundaries | Restrict data flows | CSP headers, CORS policy, API rate limiting | Complete | `src/middleware/security-headers.ts` |
| CC7.1 — Vulnerability Management | Detect vulnerabilities | Dependency scanning, ClamAV virus scanning on uploads | Complete | `src/lib/storage/file-upload.ts` |
| CC7.2 — Incident Detection | Monitor for anomalies | Structured logging, audit trail, rate limit alerts | Complete | `src/lib/logging/logger.ts`, `src/lib/logging/audit-trail.ts` |
| CC7.3 — Incident Response | Respond to incidents | Session invalidation, tenant deny-list, emergency access revocation | Complete | `src/lib/auth/session-invalidation.ts` |
| CC8.1 — Change Management | Controlled changes | Git version control, CI/CD pipeline, PR reviews | Complete | GitHub Actions, branch protection |
| A1.2 — Recovery Procedures | Backup and restore | Daily backups, PITR, monthly restore tests | Complete | `docs/BACKUP_RESTORE.md` |

---

## 4. OWASP LLM Top 10 (2025)

| Requirement | Standard | Implementation | Status | Evidence |
|---|---|---|---|---|
| LLM01 — Prompt Injection | Prevent direct/indirect injection | Input sanitization, system prompt isolation, guardrails | Complete | `src/lib/ai/guardrails/input-validator.ts` |
| LLM02 — Insecure Output Handling | Validate LLM outputs | Output validator with harmful content, PII, citation checks | Complete | `src/lib/ai/guardrails/output-validator.ts` |
| LLM03 — Training Data Poisoning | Protect training data integrity | No fine-tuning; RAG-only with curated knowledge base | Complete | `knowledge/` directory, embedding pipeline |
| LLM04 — Model Denial of Service | Prevent resource exhaustion | Token budget management, rate limiting per user/IP | Complete | `src/middleware/auth.ts`, token budget config |
| LLM05 — Supply Chain Vulnerabilities | Secure model supply chain | Pinned Anthropic SDK version, vendor BAA agreements | Complete | `package.json`, vendor agreements |
| LLM06 — Sensitive Information Disclosure | Prevent data leakage | PII scanning, cross-tenant isolation, output validation | Complete | `src/lib/ai/guardrails/output-validator.ts` |
| LLM07 — Insecure Plugin Design | Secure tool/plugin interfaces | No external plugins; controlled RAG pipeline only | Complete | Architecture design |
| LLM08 — Excessive Agency | Limit LLM actions | Read-only RAG, no autonomous actions, human-in-the-loop | Complete | Assessment workflow design |
| LLM09 — Overreliance | Prevent blind trust in outputs | RAG grounding validation, citation checking, ungrounded claim disclaimers | Complete | `src/lib/ai/guardrails/output-validator.ts` |
| LLM10 — Model Theft | Protect model access | API key rotation, server-side only LLM calls, no client exposure | Complete | Environment variable management |

---

## 5. Additional Security Controls

| Control | Framework | Implementation | Status | Evidence |
|---|---|---|---|---|
| Content Security Policy | OWASP | Strict CSP with nonce-based script loading | Complete | `src/middleware/security-headers.ts` |
| Rate Limiting | OWASP | Token bucket via Redis (authenticated + unauthenticated) | Complete | `src/middleware/auth.ts` |
| File Upload Security | OWASP | Magic byte validation, ClamAV scanning, size limits | Complete | `src/lib/storage/file-upload.ts`, `src/lib/storage/s3.ts` |
| Session Management | OWASP | Redis deny-list, 30-min timeout, webhook-driven invalidation | Complete | `src/lib/auth/session-invalidation.ts` |
| Logging & Monitoring | NIST CSF | Pino structured logging → Grafana Loki, sensitive data redaction | Complete | `src/lib/logging/logger.ts` |
| Secrets Management | CIS | Environment variables via Cloudflare, AWS Secrets Manager for KMS | Complete | Cloudflare Pages config |

---

## Review Schedule

| Review | Frequency | Owner |
|--------|-----------|-------|
| Compliance matrix update | Quarterly | Security Lead |
| Backup restore test | Monthly | Platform Engineering |
| Dependency vulnerability scan | Weekly (automated) | CI/CD pipeline |
| Penetration test | Annual | External vendor |
| HIPAA risk assessment | Annual | Compliance Officer |
