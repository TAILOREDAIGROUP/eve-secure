# EVE Secure: Vertical Slice Build Plan

**Platform:** Production-grade AI cybersecurity advisory platform for healthcare and legal clients
**Methodology:** Vertical-slice-builder pattern
**Total Tasks:** 60 across 7 workstreams
**Target:** Core ship by end of Week 5; Phase 1.1 completion by end of Week 7

---

## Execution Schedule

### Week 0: Foundation
- **F1, F2, F3, F4, F5, F6** – All foundation tasks execute in parallel

### Weeks 1–2: Knowledge Bootstrap & AI Engine Foundation
**Knowledge Workstream (A):**
- A1: NIST CSF 2.0 Corpus
- A4: Threat Intelligence
- A5: Insurance Layer

**AI Engine Workstream (B):**
- B1: LiteLLM Integration
- B2: RAG Pipeline
- B9: Streaming Delivery

**Product Workstream (C):**
- C1: Onboarding (start)
- C2: ASSESS Mode (start)

**Security Workstream (D):**
- D1: Multi-Tenant Architecture
- D2: Row-Level Security (RLS)
- D3: Encryption at Rest
- D7: Input Validation
- D8: Output Filtering
- D12: RBAC Implementation
- D14: Audit Logging

**Eval Workstream (E):**
- E3: Citation Accuracy Eval (early)

### Weeks 3–4: Knowledge Expansion & AI Engine Completion
**Knowledge Workstream (A):**
- A2: Healthcare Pack
- A3: Legal Pack
- A6: Regulatory Compliance Engine
- A7: Knowledge Integrity

**AI Engine Workstream (B):**
- B3: System Prompt
- B4: Input Sanitization
- B5: Output Validation
- B6: Conversation State
- B7: Token Budget Management
- B8: Model Error Handling

**Product Workstream (C):**
- C2: ASSESS Mode (finish)
- C3: PLAN Mode
- C4: Cost of Inaction Brief
- C6: Operational Resilience Assessment

**Security Workstream (D):**
- D4: PII Handling
- D5: Cross-Tenant Isolation
- D13: MFA & Session Management
- D15: HIPAA Compliance Check

**Eval Workstream (E):**
- E1: Accuracy Benchmark
- E2: Hallucination Detection
- E4: Compliance Verification
- E5: Performance SLA Testing

### Week 5: Core Ship
**Product Workstream (C):**
- C10: Assessment Report
- C11: Admin Panel
*C1, C2, C3, C4, C6 are complete; core product launches*

**Knowledge Workstream (A):**
- A8: Knowledge Update Workflow
- A9: Knowledge Versioning

**Security Workstream (D):**
- D6: Data Residency
- D9: Secrets Management
- D10: Dependency Scanning
- D11: SIEM Integration

**Eval Workstream (E):**
- E6: Cost Tracking Eval
- E7: Regression Suite Expansion

**Operations Workstream (O):**
- O3: Cost Monitoring
- O4: Client Offboarding
- O5: DR Runbook

### Weeks 6–7: Phase 1.1 & Security Hardening
**Product Workstream (C):**
- C5: Insurance Questionnaire Helper
- C7: Offline IR Package
- C8: IR Walkthrough
- C9: Tabletop Generator

**Security Workstream (D):**
- Full security review cycle

**Eval Workstream (E):**
- E8: Load Testing & Scaling

**Operations Workstream (O):**
- O1: Internal IR Plan
- O2: Uptime & Alerting

---

## Workstream F: Foundation (6 tasks)

### F1: Database Schema

**Goal:** Define and implement the complete PostgreSQL schema with row-level security, migrations, and seed data to support multi-tenant, HIPAA-compliant operations.

**Dependencies:** None (foundational)

**Features to Build:**
- Core tables: `tenants`, `users`, `conversations`, `messages`, `assessments`, `recommendations`, `knowledge_items`, `audit_logs`, `evals`
- RLS policies for tenant isolation and user-scoped access
- Encrypted columns: conversation_metadata, assessment_data, user_settings
- Indexes on frequently queried fields (tenant_id, user_id, created_at, assessment_type)
- Migration system with rollback capability
- Seed data: sample assessments, recommendation templates, NIST CSF structure

**Tests Required:**
- RLS policy enforcement (cross-tenant leak detection)
- Migration up/down cycle
- Data integrity constraints (NOT NULL, UNIQUE, FK)
- Index coverage verification
- Seed data validation (10k+ rows)

**Definition of Done:**
- All tables created and indexed
- RLS policies verified via test tenants
- Migrations run cleanly on fresh and existing databases
- Seed data loads without errors
- Schema documented (ERD, column descriptions)

**Estimated Time:** 3 days

---

### F2: API Contract

**Goal:** Define OpenAPI 3.1 specification and implement Zod schemas for type-safe request/response validation and mock server for frontend development.

**Dependencies:** F1 (schema design informs API shape)

**Features to Build:**
- OpenAPI 3.1 YAML specification covering all endpoints (auth, assess, plan, upload, report, admin)
- Zod schemas for request bodies, query params, path params, response shapes
- Mock server (via Prism or custom Next.js route) with realistic response fixtures
- Automated schema validation middleware in API handlers
- Swagger UI documentation endpoint
- Request/response examples for each endpoint

**Tests Required:**
- OpenAPI spec validation (spectral or openapi-generator)
- Zod schema parse/validate tests
- Mock server response format compliance
- Middleware integration test (invalid request rejection)
- Schema drift detection (compare generated vs. actual types)

**Definition of Done:**
- OpenAPI spec published and accessible
- Zod schemas compile and cover all endpoints
- Mock server runs and serves correct responses
- Frontend can develop against mocks
- API documentation is current and accurate

**Estimated Time:** 2 days

---

### F3: Embedding Strategy

**Goal:** Benchmark and select embedding models, implement chunking strategy, and prototype hybrid search to enable RAG accuracy and performance.

**Dependencies:** F1 (database for vectors)

**Features to Build:**
- Benchmark: Voyage 3 vs. OpenAI text-embedding-3-large (accuracy, latency, cost)
- Chunking strategy: paragraph + sentence overlap, 512-token max with semantic boundaries
- pgvector integration: index types (IVFFlat for scale, HNSW for accuracy testing)
- Hybrid search prototype: BM25 (lexical) + vector (semantic) + fusion ranking
- NIST CSF corpus as benchmark dataset (1k+ reference documents)
- Cost calculator for embedding + query operations

**Tests Required:**
- Embedding quality: cosine similarity on known relevant docs
- Retrieval recall@10 and precision for healthcare/legal queries
- Latency test: query time <500ms p95 at 100k vectors
- Chunk quality: no orphaned or nonsensical chunks
- Hybrid search ranking: top-1 accuracy on golden queries

**Definition of Done:**
- Embedding model selected and cost justified
- Chunking produces 50-100 chunks per source document
- Hybrid search implementation >85% recall@10 on test set
- pgvector index size and query performance validated
- Embedding budget documented (per-doc, per-query costs)

**Estimated Time:** 3 days

---

### F4: Environment Setup

**Goal:** Establish reproducible local (Docker), staging (AWS), and production (AWS) environments with infrastructure-as-code (Pulumi) and secure secret management.

**Dependencies:** None (parallel with others)

**Features to Build:**
- Local development: Docker Compose with PostgreSQL, Redis, pgvector, mock S3
- Staging environment: AWS VPC, ECS Fargate for API, Aurora PostgreSQL, RDS Proxy
- Production environment: Same as staging, with enhanced monitoring and backup
- Pulumi IaC: All AWS resources, version-controlled, drift-detected
- Secrets management: AWS Secrets Manager integration, local .env.local for dev
- CI/CD pipeline: GitHub Actions for test → stage → prod (manual approval on prod)

**Tests Required:**
- Local environment spins up in <2 min, all services healthy
- Database connection pool works in Docker and ECS
- Staging deployment succeeds, all health checks pass
- Production environment is identical to staging (diff check)
- Secrets rotation test (update secret, app reconnects without restart)

**Definition of Done:**
- Local development environment fully functional
- Staging and production both deployed
- All environment variables documented
- Secrets stored in AWS Secrets Manager (none in code)
- CI/CD pipeline passes test suite before deploy

**Estimated Time:** 4 days

---

### F5: Frontend Architecture

**Goal:** Establish Next.js 13+ app structure with TypeScript, Shadcn/UI components, state management (Zustand), data fetching (React Query), and accessibility/responsiveness standards.

**Dependencies:** F2 (API contract)

**Features to Build:**
- Next.js 13+ with app router, TypeScript strict mode
- Page structure: `/auth`, `/assess`, `/plan`, `/reports`, `/admin`, `/settings`
- Shadcn/UI component library: buttons, forms, tables, dialogs, modals
- Zustand store: auth state, current assessment, user preferences
- React Query: server state for conversations, assessments, recommendations
- Server-sent events (SSE) for streaming AI responses
- Responsive design: mobile-first, tablet, desktop (640px, 1024px breakpoints)
- Accessibility: WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- Error boundary and fallback UI for failed states

**Tests Required:**
- Component rendering tests (React Testing Library)
- Routing tests (navigation between auth states)
- State management tests (Zustand store mutations)
- Responsive layout tests (viewport sizes, media queries)
- Accessibility tests (axe-core, keyboard navigation)
- SSE connection tests (mock server responses)

**Definition of Done:**
- All core pages render without errors
- Forms submit and handle responses
- Navigation works correctly
- Mobile layout passes responsive tests
- Accessibility score >90 on Lighthouse
- Build succeeds with no TypeScript errors

**Estimated Time:** 5 days

---

### F6: Error Handling & Logging

**Goal:** Implement three-tier error handling (client/API/system) with structured logging to Grafana, critical alerts via PagerDuty, and compliance-aware retention.

**Dependencies:** F4 (environment setup)

**Features to Build:**
- Client-side error boundary: catches React errors, fallback UI, error reporting
- API error handling: standardized error response format (code, message, trace_id, retry_hint)
- Server-side logging: structured JSON logs (timestamp, level, trace_id, tenant_id, user_id, action, error details)
- Grafana dashboards: error rate by type, latency percentiles, failed tenants, API health
- PagerDuty integration: CRITICAL alerts (auth failure, data loss, rate limit), escalation
- Log retention: 30 days hot storage, 1-year archive in S3, compliance-safe deletion
- Trace correlation: trace_id propagation across request/response

**Tests Required:**
- Error is caught at boundary, no app crash
- Log entry includes all required fields
- Grafana dashboard loads and displays recent logs
- PagerDuty alert fires on CRITICAL log entry
- Retention policy enforces expiration
- Trace_id is consistent across multi-step operations

**Definition of Done:**
- Error boundary deployed and tested with intentional errors
- Structured logging active in staging
- Grafana dashboards created and monitored
- PagerDuty integration verified
- Retention policy configured in S3
- On-call runbook documents alert types and escalation

**Estimated Time:** 3 days

---

## Workstream A: Knowledge Base (9 tasks)

### A1: NIST CSF 2.0 Corpus

**Goal:** Ingest NIST Cybersecurity Framework 2.0 (6 Functions, 22 Categories, 106 Subcategories across Tiers 1-4) and map to healthcare/legal sector contexts.

**Dependencies:** F1 (database), F3 (embedding)

**Features to Build:**
- NIST CSF 2.0 complete document tree: 6 Functions (GOVERN, PROTECT, DETECT, RESPOND, RECOVER, SUPPLY CHAIN RISK MANAGEMENT)
- 22 Categories with descriptions
- 106 Subcategories with implementation guidance
- Tier-level guidance (1-4) for each subcategory
- Cross-mapping: HIPAA → CSF, ABA → CSF, SEC cybersecurity rules → CSF
- Sector-specific guidance for healthcare and legal
- Source documentation linked (official NIST PDFs)

**Tests Required:**
- All 106 subcategories present in database
- Tier descriptions match official NIST text
- Cross-mappings are bidirectional and consistent
- Search retrieves correct subcategory on functional keywords
- Sector guidance appears in context window for healthcare/legal queries

**Definition of Done:**
- NIST CSF 2.0 fully loaded in knowledge base
- Cross-mappings verified by SME
- Embedding vectors generated and indexed
- Assessment engine can fetch and score against Tiers
- 100% retrieval coverage for NIST references

**Estimated Time:** 2 days

---

### A2: Healthcare Pack

**Goal:** Curate and embed healthcare-specific security controls, compliance guidance, breach protocols, EHR hardening, medical device security, and ransomware mitigations.

**Dependencies:** A1 (NIST CSF foundation), F3 (embedding)

**Features to Build:**
- HIPAA Security Rule: all 49 standards (Administrative, Physical, Technical safeguards)
- HIPAA Breach Notification Rule: notification timelines, media templates, regulatory triggers
- EHR Security Hardening: vendor selection criteria, authentication, audit trails, role-based access
- Medical Device Security: isolation strategies, segmentation, firmware management, supply chain
- Healthcare Ransomware Playbook: attack vectors (supply chain, staff), containment, recovery, communication
- State healthcare data breach laws: 50-state matrix of notification requirements and penalties
- Health information exchange (HIE) security considerations
- Sector-specific threat intelligence (healthcare targeting trends, known vulnerabilities in EHR systems)

**Tests Required:**
- HIPAA sections retrieve correctly (compliance rules engine)
- Breach notification rules trigger on appropriate events
- Medical device security guidance applies to healthcare assessments
- Ransomware guidance is distinct from general IR playbooks
- 50-state breach matrix is complete and current

**Definition of Done:**
- Healthcare pack loaded and SME-reviewed
- HIPAA coverage at 100% (all 49 standards)
- Breach notification templates ready for use
- Healthcare assessments show sector-specific guidance
- Citation accuracy >95% for healthcare queries

**Estimated Time:** 3 days

---

### A3: Legal Pack

**Goal:** Curate and embed legal-sector-specific security controls, ABA ethics rules, state bar cybersecurity opinions, document management security, BEC prevention, and privilege protection.

**Dependencies:** A1 (NIST CSF foundation), F3 (embedding)

**Features to Build:**
- ABA Model Rules of Professional Conduct: cybersecurity-relevant rules (confidentiality, competence, tech knowledge)
- State bar cybersecurity opinions: 50-state sample of guidance, ethical obligations
- Legal document management (DMS) security: encryption, access control, privilege tracking
- Business Email Compromise (BEC) prevention: authentication, verification protocols, fraud detection
- Attorney-client privilege protection: secure communication, encryption, metadata handling
- E-discovery security: data minimization, privileged document identification, secure production
- Malpractice insurance requirements: cyber liability, errors & omissions, coverage gaps
- Client communication encryption standards (Signal, SecureEmail, etc.)

**Tests Required:**
- ABA rule retrieval on ethics questions
- State bar opinions load for all 50 states
- DMS guidance distinguishes privileged from non-privileged content
- BEC scenarios trigger prevention controls in advisories
- E-discovery checklists are comprehensive and compliant

**Definition of Done:**
- Legal pack loaded and bar association-reviewed
- ABA rules coverage complete
- 50-state bar opinions available (at least sample from each)
- DMS security controls mapped to NIST CSF
- BEC prevention guidance in all relevant contexts

**Estimated Time:** 3 days

---

### A4: Threat Intelligence

**Goal:** Ingest and continuously update threat intelligence: CISA KEV catalog, FBI IC3 reports, attack chains, social engineering tactics, deepfakes, and nation-state activity.

**Dependencies:** F1 (database), F3 (embedding)

**Features to Build:**
- CISA Known Exploited Vulnerabilities (KEV) catalog: daily sync, CVSS scores, exploit POCs, patch status
- FBI IC3 (Internet Crime Complaint Center) reports: fraud patterns, ransomware variants, BEC case studies
- ATT&CK Framework (MITRE): tactics, techniques, procedures (TTPs), sector-specific usage
- Social engineering tactics: phishing templates, pretexting scenarios, supply chain manipulation
- Deepfake detection guidance: identify synthetic media, verify sender identity, incident response
- Nation-state activity reports: targeting patterns, attribution, sector focus, TTPs
- Ransomware variants: encryption methods, payment processes, leaked data, decryption tools available
- Zero-day disclosure trends: recent CVEs, vendor patching speed, exploitability

**Tests Required:**
- CISA KEV sync runs daily, latest CVEs present
- FB IC3 reports map to threat scenarios
- ATT&CK TTP search retrieves relevant techniques
- Social engineering guidance includes sector-specific examples
- Deepfake scenarios are realistic and detection-focused
- Nation-state reports reference credible sources

**Definition of Done:**
- Threat intelligence feed ingestion automated (daily)
- All sources integrated and cross-referenced
- Query retrieval returns current, relevant threats
- Healthcare and legal sector threats highlighted
- Update pipeline documented and monitored

**Estimated Time:** 3 days

---

### A5: Insurance Layer

**Goal:** Map insurance policy requirements to NIST CSF controls, document exclusion patterns, and embed claims process guidance for informed decision-making.

**Dependencies:** A1 (NIST CSF), F1 (database)

**Features to Build:**
- Cyber liability insurance policy analysis: required controls, coverage limits, exclusions
- NIST CSF ↔ Insurance requirement mapping: which controls reduce premiums, improve coverage
- Exclusion patterns: common gaps (ransomware exclusions, unpatched systems, insufficient authentication)
- Claims process: notification requirements, documentation, loss quantification, recovery steps
- Industry-standard cyber insurance carriers: comparison matrix, state availability, premium drivers
- Business interruption coverage: downtime costs, recovery time objectives, policy limits
- Privacy breach liability: PII handling requirements, notification costs, regulatory fines coverage
- Healthcare-specific cyber liability: HIPAA breach coverage, patient notification, regulatory fines

**Tests Required:**
- Insurance requirements map to 80%+ of NIST CSF subcategories
- Exclusion patterns are recognized and flagged in recommendations
- Claims process guidance is compliant with carrier standards
- Premium drivers (MFA, EDR, backups) are highlighted
- Healthcare insurance policies specifically address HIPAA

**Definition of Done:**
- Insurance policy matrix created and updated quarterly
- NIST ↔ Insurance mapping complete and validated
- Assessment recommendations include insurance implications
- Claims process guidance available for incident scenarios
- SME (insurance broker) review completed

**Estimated Time:** 2 days

---

### A6: Regulatory Compliance Engine

**Goal:** Build SQL matrix correlating NIST CSF, HIPAA, ABA, SEC cybersecurity rules, 50-state breach laws, CMMC, and CIRCIA to enable compliance reporting.

**Dependencies:** A1-A5 (all knowledge packs), F1 (database)

**Features to Build:**
- Compliance matrix: rows = NIST subcategories, columns = HIPAA, ABA, SEC, 50-state breach, CMMC levels, CIRCIA
- Cell values: cross-reference (which regulation requires which CSF control), specific section citations
- State-specific breach laws: notification timelines, encrypted data exemptions, penalty ranges
- CMMC levels (1-5): control mapping, assessment criteria, contractor requirements
- CIRCIA (Cyber Incident Reporting for Critical Infrastructure): reporting requirements, timelines
- SEC cybersecurity rules: board reporting, risk assessment, incident disclosure, vendor management
- Compliance scoring: assess client against each regulation, identify gaps, prioritize remediation
- Reporting engine: generate compliance status PDF for each regulation

**Tests Required:**
- Matrix has no conflicting requirements (sanity check)
- Compliance scoring aligns with regulatory guidance
- Gap identification is accurate (missing control → non-compliance)
- Reporting generates correctly formatted PDF
- 50-state laws are current and complete

**Definition of Done:**
- Compliance matrix created and SME-validated
- All regulations mapped at ≥80% coverage
- Compliance scoring engine operational
- Reporting templates ready for use
- Matrix version-controlled and audit-tracked

**Estimated Time:** 3 days

---

### A7: Knowledge Integrity

**Goal:** Implement cryptographic verification of knowledge base content to detect tampering and ensure audit compliance.

**Dependencies:** F1 (database), F6 (logging)

**Features to Build:**
- SHA-256 hashing: every knowledge item (document, chunk, mapping) hashed and stored
- Tamper detection: background job checks hashes periodically, logs any discrepancies
- CRITICAL alerts: if hash mismatch detected, alert security team immediately
- Knowledge changelog: tracks all edits (who, when, what changed, commit hash)
- Compliance report: attestation of knowledge integrity for audits
- Rollback capability: restore to any previous hash state (with audit trail)

**Tests Required:**
- Hash computed consistently for same content
- Tamper detection catches intentional content modification
- CRITICAL alert fires on mismatch
- Changelog records all edits accurately
- Rollback restores correct content and updates hash

**Definition of Done:**
- Hashing implemented for all knowledge items
- Tamper detection runs daily
- CRITICAL alerts monitored and responded to
- Changelog complete and audit-ready
- Compliance report template created

**Estimated Time:** 2 days

---

### A8: Knowledge Update Workflow

**Goal:** Establish Git-based, SME-reviewed, auto-embedding update pipeline with eval gates and rapid rollback to ensure knowledge quality and safety.

**Dependencies:** A1-A7 (knowledge packs), F3 (embedding)

**Features to Build:**
- Git workflow: feature branches for knowledge updates, pull requests with review requirements
- SME review gate: domain experts (healthcare, legal, security) must approve before merge
- Auto-embedding: on merge, new/updated items automatically embedded with Voyage
- Eval gate: embedding quality checked (retrieval test on golden queries), blocks if <85% recall
- Staged rollout: changes can be canaried to 10%, 50%, 100% of tenants
- Rollback trigger: if eval failure or incident detected, revert to previous version
- Rollback time SLA: <15 min from detection to full revert
- Audit log: every update, reviewer, timestamp, eval results

**Tests Required:**
- PR review required before merge
- Auto-embedding triggers on merge
- Eval gate prevents low-quality embeddings
- Canary deployment works (subset of users)
- Rollback completes in <15 min
- Audit log captures all metadata

**Definition of Done:**
- Git workflow documented and enforced
- SME review process established
- Auto-embedding and eval gate operational
- Canary deployment tested
- Rollback procedures documented and practiced

**Estimated Time:** 3 days

---

### A9: Knowledge Versioning

**Goal:** Implement Git-tag versioning strategy with <15 min rollback, admin display of current version, and audit logging.

**Dependencies:** A8 (update workflow), F1 (database)

**Features to Build:**
- Git tagging: every release gets semantic version (v1.0.0, v1.0.1, etc.)
- Version tracking: database stores active version, rollback history
- Admin interface: shows current version, recent tags, rollback button
- Rollback execution: instant tag switch, cache invalidation, embedding reload
- Version audit log: logs every version change, who initiated, reason, timestamp
- Changeset tracking: diff view between versions (what changed)
- Version SLA: rollback <15 min from admin action

**Tests Required:**
- Tag creation is automatic on release
- Version displayed accurately in admin panel
- Rollback switches version and reloads data <15 sec
- Audit log records version changes
- Changeset diff is accurate and readable

**Definition of Done:**
- Versioning strategy implemented
- Admin panel shows version controls
- Rollback SLA met and tested
- Audit log complete and monitored
- Version strategy documented for ops team

**Estimated Time:** 2 days

---

## Workstream B: AI Engine (9 tasks)

### B1: LiteLLM Integration

**Goal:** Integrate LiteLLM for model routing across Haiku/Sonnet/Opus with automatic fallback, comprehensive logging, and cost tracking.

**Dependencies:** F2 (API contract), F6 (logging)

**Features to Build:**
- LiteLLM setup: Haiku for fast responses, Sonnet for balanced accuracy, Opus for complex reasoning
- Model routing logic: choose model based on prompt complexity (heuristic or learning)
- Fallback mechanism: Haiku → Sonnet → Opus if rate limited or failing
- Request logging: prompt, model chosen, tokens used, latency, cost
- Cost tracking: per-tenant, per-user, per-model aggregation and reporting
- Rate limit handling: queue requests, backoff strategy, client notification
- Model-specific error handling: Anthropic rate limits vs. API errors vs. timeouts

**Tests Required:**
- Model routing chooses appropriate model for prompt
- Fallback triggers and succeeds on rate limit
- Cost calculation accurate for all models
- Logging captures all metadata
- Rate limit queue processes without loss
- Error handling distinguishes between error types

**Definition of Done:**
- LiteLLM integrated and operational
- Model routing working with all 3 models
- Cost tracking live and accurate
- Fallback tested and working
- Logging comprehensive and monitored

**Estimated Time:** 2 days

---

### B2: RAG Pipeline

**Goal:** Implement complete RAG pipeline: embed → pgvector search → hybrid ranking → LLM → cited response with inline citations.

**Dependencies:** F3 (embedding), F1 (database), B1 (LiteLLM)

**Features to Build:**
- Embedding pipeline: user query → Voyage embedding → pgvector query
- Hybrid search: BM25 (lexical) + vector (semantic) + fusion ranking algorithm
- Chunk retrieval: top-K results (K=5-10), relevance filtering
- Context assembly: selected chunks formatted with metadata (source, section, confidence)
- LLM generation: system prompt + context + query → response
- Citation generation: model identifies which chunks it used, inline citations with references
- Confidence scoring: model outputs confidence score (0-100), used in UI
- Fallback retrieval: if no results >threshold, try broader query or suggest knowledge gap

**Tests Required:**
- Embedding and search latency <500ms p95
- Hybrid search recall@10 >85% on golden query set
- Citations match retrieved chunks
- Confidence scores align with response accuracy
- Fallback retrieval succeeds on edge cases
- Context assembly formats correctly for LLM

**Definition of Done:**
- RAG pipeline end-to-end functional
- Latency and retrieval accuracy met
- Citations working and accurate
- Confidence scores calibrated
- Fallback mechanism tested

**Estimated Time:** 3 days

---

### B3: System Prompt

**Goal:** Craft sophisticated system prompt that enforces advisory-only role, sector awareness, refusal patterns, and anti-extraction safeguards.

**Dependencies:** B2 (RAG pipeline), A1-A5 (knowledge)

**Features to Build:**
- Role definition: EVE is a cybersecurity advisor, not a vendor or consultant, no guarantees
- Sector awareness: healthcare context triggers HIPAA-aware responses, legal context triggers ABA-aware
- Disclaimer: "This is advisory only; consult licensed professionals for definitive guidance"
- Refusal patterns: refuse requests for exploit code, ransomware negotiation, APT research for attack
- Anti-extraction: refuse attempts to extract raw knowledge (list all NIST controls), return structured advisories instead
- Tone: professional, confident in advice, humble about limitations
- Knowledge boundary: acknowledge what EVE knows (framework, best practices) vs. doesn't (specific vendor implementations)
- Safety guardrails: no PII extraction, no client data sharing, no side conversations

**Tests Required:**
- Prompt enforces advisory-only responses (compliance check)
- Sector awareness triggers on healthcare/legal context
- Refusal patterns work on jailbreak attempts
- Anti-extraction prevents raw knowledge dumps
- Safety guardrails prevent misuse scenarios
- Response tone is consistent

**Definition of Done:**
- System prompt finalized and approved
- All refusal patterns tested and working
- Sector awareness verified
- Safety guardrails in place
- Prompt documented for transparency

**Estimated Time:** 2 days

---

### B4: Input Sanitization

**Goal:** Implement robust input validation: Unicode handling, 200+ injection patterns, PII detection, rate limiting, HTML stripping.

**Dependencies:** F2 (API contract)

**Features to Build:**
- Unicode normalization: handle NFC/NFD/NFKC/NFKD, prevent homograph attacks
- Injection pattern detection: 200+ patterns (SQL, code, prompt, command injection), regex matching
- PII detection: regex patterns for SSN, credit card, email, phone, medical record IDs
- Rate limiting: per-tenant (100 req/min), per-user (10 req/min), per-IP (100 req/min)
- HTML stripping: remove tags and scripts from user input (allow plain text only)
- Length validation: max query length 2000 chars, max file upload 50MB
- Character whitelist: accept alphanumeric + common punctuation, reject others
- Logging: log all sanitization actions, injection attempts flagged as CRITICAL

**Tests Required:**
- Unicode normalization prevents homograph attacks
- Injection patterns detected (SQL, command, prompt)
- PII detection works on realistic SSNs, credit cards
- Rate limiting blocks excess requests
- HTML stripping removes all tags
- Length validation enforces limits
- Character whitelist rejects invalid chars
- Sanitization logged correctly

**Definition of Done:**
- Input sanitization middleware integrated
- All 200+ injection patterns covered
- PII detection working
- Rate limiting active and tested
- HTML stripping effective
- Sanitization logging monitored

**Estimated Time:** 2 days

---

### B5: Output Validation

**Goal:** Validate LLM responses: check citations, confidence scores, cross-tenant isolation, harmful content filtering.

**Dependencies:** B2 (RAG), B3 (system prompt)

**Features to Build:**
- Citation validation: ensure all claims have corresponding chunk references, no orphan statements
- Confidence score validation: score exists, 0-100 range, aligns with response quality
- Cross-tenant scan: check response doesn't contain other tenant's data or scenarios
- Harmful content filter: blocklist for dangerous advice (disable security, extract data, etc.)
- Response length validation: >50 tokens (substantive), <8000 tokens (concise)
- Format validation: structured JSON response with all required fields
- Audit logging: log all validation results, failures flagged as CRITICAL

**Tests Required:**
- Citation validation catches missing references
- Confidence score validation enforces range
- Cross-tenant scan prevents data leakage
- Harmful filter catches dangerous advice
- Response length validation enforces bounds
- Format validation requires all fields
- Validation failures logged correctly

**Definition of Done:**
- Output validation middleware deployed
- Citation validation working
- Cross-tenant isolation verified
- Harmful content filter effective
- Validation failures monitored and alerted

**Estimated Time:** 2 days

---

### B6: Conversation State

**Goal:** Manage per-tenant conversation state with PostgreSQL persistence, RLS, and encryption to enable multi-turn dialogues.

**Dependencies:** F1 (database), F4 (environment)

**Features to Build:**
- Conversation table: tenant_id, user_id, conversation_id, turn_number, created_at, updated_at
- Message storage: user query, AI response, metadata (model, tokens, cost, latency)
- Session persistence: load conversation on new request, context preserved
- RLS enforcement: users see only their conversations, tenants isolated
- Encryption: conversation content encrypted at rest (KMS), decrypted on read
- Conversation lifecycle: create, update, archive, delete (soft delete with audit trail)
- Context window management: trim old turns if conversation grows (keep last 10 turns + summary)

**Tests Required:**
- Conversation persists and loads correctly
- RLS prevents cross-user/cross-tenant access
- Encryption/decryption works and is transparent
- Session context maintained across turns
- Conversation lifecycle operations work
- Context trimming preserves latest turns

**Definition of Done:**
- Conversation storage implemented
- RLS policies verified
- Encryption working
- Session persistence tested
- Context window management working

**Estimated Time:** 2 days

---

### B7: Token Budget Management

**Goal:** Implement smart token budgeting: summarize older sections, rolling context window, never truncate knowledge chunks.

**Dependencies:** B6 (conversation state), F7 (embeddings)

**Features to Build:**
- Token counter: track prompt + response tokens for every turn
- Budget allocation: Haiku (1k tokens), Sonnet (3k), Opus (5k) per turn
- Context prioritization: knowledge (always full) > recent turns (full) > old turns (summarized)
- Summarization: old turns summarized to 1-2 sentences, injected as context
- Rolling window: keep last N turns, older turns summarized
- Knowledge chunks: never truncate knowledge chunks (full context always included)
- Overflow handling: if token budget exceeded, trim oldest turns instead of knowledge
- Logging: track token usage per turn, alert if approaching budget limits

**Tests Required:**
- Token count accurate for different models
- Budget allocation enforced
- Summarization preserves key info
- Knowledge chunks never truncated
- Rolling window works as expected
- Overflow handling prioritizes knowledge
- Token logging accurate

**Definition of Done:**
- Token counter integrated
- Budget enforcement active
- Summarization working
- Rolling window tested
- Knowledge preservation verified
- Token logging monitored

**Estimated Time:** 2 days

---

### B8: Model Error Handling

**Goal:** Handle model failures gracefully: timeout retry, rate limit queueing, malformed response recovery, cost alerts.

**Dependencies:** B1 (LiteLLM), B7 (token budget)

**Features to Build:**
- Timeout handling: request timeout 30 sec, retry up to 3 times with exponential backoff
- Rate limit queueing: queue requests on 429, process in FIFO order
- Malformed response handling: detect incomplete/corrupted responses, retry or use fallback
- Cost alert: if daily tenant cost >$100, alert finance team
- Circuit breaker: if model down >5 min, failover to fallback model
- User notification: if error during conversation, inform user ("Temporary issue, please retry")
- Graceful degradation: if advanced model fails, retry with simpler model
- Detailed logging: log all errors, retries, fallbacks, cost anomalies

**Tests Required:**
- Timeout triggers after 30 sec, retries work
- Rate limit queue processes requests in order
- Malformed responses detected and handled
- Cost alerts fire on threshold
- Circuit breaker activates on repeated failures
- User notifications clear and helpful
- Fallback model succeeds
- Error logging comprehensive

**Definition of Done:**
- Error handling middleware integrated
- Retry logic tested and working
- Rate limit queue operational
- Cost alerts configured
- Circuit breaker tested
- User notifications deployed

**Estimated Time:** 2 days

---

### B9: Streaming Delivery

**Goal:** Deliver AI responses via Server-Sent Events (SSE) for real-time streaming, reconnection on drop, and loading states.

**Dependencies:** B1 (LiteLLM), F5 (frontend)

**Features to Build:**
- SSE endpoint: `/api/stream` accepts query/conversation_id, returns event stream
- Streaming format: tokens streamed as they arrive, includes metadata (cost, citation count)
- Client reconnection: auto-reconnect on connection drop, resume from last token
- Loading states: UI shows "Streaming..." with token count, spinning indicator
- Token rate: smooth display at 10-50 tokens/sec (human-readable pace)
- Error streaming: if error occurs, send error event with message
- Timeout handling: close connection after 2 min idle, client reconnects
- Browser compatibility: tested on Chrome, Firefox, Safari, mobile

**Tests Required:**
- SSE stream delivers tokens in order
- Reconnect on drop works (simulated disconnect)
- Loading states display correctly
- Token rate is smooth (not too fast, not buffering)
- Error events trigger error UI
- Timeout closes connection gracefully
- Cross-browser compatibility verified

**Definition of Done:**
- SSE endpoint implemented and tested
- Frontend streaming UI working
- Reconnection logic tested
- Loading states displaying
- Cross-browser verified

**Estimated Time:** 2 days

---

## Workstream C: Product Features (11 tasks)

### C1: Onboarding

**Goal:** Enable secure multi-step onboarding: Clerk MFA, guided profile, emergency codes, notification preferences.

**Dependencies:** F5 (frontend), D13 (MFA)

**Features to Build:**
- Clerk authentication: sign-up, sign-in, password reset, social login (Google, Microsoft)
- MFA enforcement: SMS or TOTP, required for all users, recovery codes
- Emergency codes: 10 single-use backup codes, stored securely, download/print/email
- Guided profile setup: sector (healthcare/legal), organization size, role, risk profile
- Notification preferences: email frequency, alert types, SMS opt-in
- Welcome email: introduces EVE, quick start guide, support contact
- Analytics: track onboarding drop-off, profile completion time
- Accessibility: forms fully accessible, screen reader tested

**Tests Required:**
- Sign-up completes successfully
- MFA required and enforced
- Emergency codes generated and stored
- Profile setup captures all fields
- Notifications respect preferences
- Welcome email sends correctly
- Analytics logged
- Accessibility verified

**Definition of Done:**
- Onboarding flow tested end-to-end
- MFA working
- Emergency codes generated and secure
- Profile data persisted
- Notification preferences honored
- Analytics functional

**Estimated Time:** 3 days

---

### C2: ASSESS Mode

**Goal:** Implement conversational NIST CSF assessment: sector-adaptive, Tier rating, gap identification, saved to database.

**Dependencies:** B2 (RAG), A1 (NIST CSF), F1 (database), C1 (onboarding)

**Features to Build:**
- Conversational flow: EVE asks diagnostic questions about current controls
- Sector adaptation: healthcare questions differ from legal (different context)
- Response capture: user input analyzed, controls mapped to NIST subcategories
- Scoring: each subcategory scored 1-4 (Tier levels), confidence attached
- Gap identification: controls where score <Tier target, flagged for remediation
- Assessment persistence: save assessment with date, sector, scores, gaps
- Report generation: summary of Tier levels, top 5 gaps, compliance gaps
- Export option: assessment data exportable as JSON for external analysis

**Tests Required:**
- Assessment flow works end-to-end (5+ question turns)
- Sector adaptation verified (healthcare/legal questions differ)
- Response analysis maps to correct subcategories
- Tier scoring aligns with NIST guidance
- Gap identification accurate
- Assessment persists and loads correctly
- Report generates with all fields
- Export produces valid JSON

**Definition of Done:**
- Assessment flow operational
- Sector adaptation working
- Scoring accurate and persistent
- Gap identification complete
- Report generation functional
- Export working

**Estimated Time:** 4 days

---

### C3: PLAN Mode

**Goal:** Generate prioritized remediation actions with cost, difficulty, compliance tags, and budget awareness.

**Dependencies:** C2 (ASSESS), A6 (compliance engine)

**Features to Build:**
- Action generation: for each gap, suggest specific controls (3-5 recommendations)
- Cost estimation: low/medium/high, with 12-month TCO range
- Difficulty rating: 1-5 scale (easy to complex), estimated effort in days
- Compliance tagging: which regulations require this control (HIPAA, ABA, SEC, etc.)
- Prioritization: algorithm considers compliance urgency, cost-benefit, difficulty
- Budget constraints: if user specifies budget, filter recommendations to fit
- Implementation timeline: Gantt-style view showing recommended sequence
- Owner assignment: recommend responsibility (IT, CIO, legal, etc.)
- Compliance mapping: show which gaps remediation closes

**Tests Required:**
- Actions generated for all assessment gaps
- Cost estimation consistent and reasonable
- Difficulty rating aligns with control complexity
- Compliance tagging comprehensive
- Prioritization algorithm balances factors
- Budget filtering works correctly
- Timeline view generates correctly
- Compliance mapping accurate

**Definition of Done:**
- PLAN mode operational
- Actions generated with all metadata
- Prioritization working
- Budget filtering functional
- Timeline generation working
- Compliance mapping complete

**Estimated Time:** 3 days

---

### C4: Cost of Inaction Brief

**Goal:** Generate one-page executive PDF: top 3 gaps, financial exposure, regulatory penalties, sign-off line.

**Dependencies:** C3 (PLAN), A5 (insurance)

**Features to Build:**
- PDF generation: professional 1-page format with EVE branding
- Top 3 gaps: highest-priority gaps, compliance triggers, recommended fixes
- Financial exposure: ransomware ransom potential, breach notification costs, downtime costs
- Regulatory penalties: max penalties for HIPAA/ABA/SEC violations relevant to gaps
- Insurance impact: premium increase if not remediated, coverage gaps
- Sign-off line: space for C-suite signature, date, attestation of review
- Customization: branding option (white-label for partners), custom header/footer
- Versioning: timestamp, assessment version, generated by EVE

**Tests Required:**
- PDF generates with all sections
- Financial exposure calculation reasonable
- Regulatory penalties correct
- Insurance impact accurate
- Sign-off formatting professional
- Custom branding works
- Versioning tracked correctly

**Definition of Done:**
- PDF generator functional
- All sections generating
- Finance data accurate
- Professional formatting confirmed
- Customization options working

**Estimated Time:** 2 days

---

### C5: Insurance Questionnaire Helper

**Goal:** Enable users to upload insurance questionnaires, extract controls, map to security posture, pre-fill answers, flag gaps.

**Dependencies:** A5 (insurance), C2 (ASSESS)

**Features to Build:**
- File upload: PDF, DOCX, Google Docs link support
- Extraction: OCR + LLM to extract questions, required controls, certifications
- Mapping: extracted controls mapped to NIST CSF and assessment results
- Pre-fill: auto-populate questionnaire fields with assessment data
- Gap identification: flag questions where current posture is deficient
- Export: generate filled questionnaire (PDF, DOCX) for submission
- Advisor: suggest answers for ambiguous questions, with reasoning
- Audit trail: log all questionnaire interactions for compliance

**Tests Required:**
- File upload and extraction works
- Mapping to NIST accurate
- Pre-fill correct and complete
- Gap identification accurate
- Export generates correctly
- Advisor suggestions helpful
- Audit trail logged

**Definition of Done:**
- File upload working
- Extraction functional
- Mapping accurate
- Pre-fill operational
- Export functional
- Advisor deployed

**Estimated Time:** 3 days

---

### C6: Operational Resilience Assessment

**Goal:** Add business continuity-focused assessment: RTO/RPO, backup strategy, incident response, disaster recovery, sector-specific checklists.

**Dependencies:** C2 (ASSESS), A2 (healthcare), A3 (legal)

**Features to Build:**
- RTO/RPO definition: EVE asks about acceptable downtime and data loss tolerance
- Current state: backup frequency, recovery testing, documented procedures
- Gap analysis: RTO/RPO realistic given current backups, recovery plan
- Healthcare-specific: EHR continuity, HIPAA breach notification, business associate agreements
- Legal-specific: document backup, case data recovery, bar association continuity guidance
- Tabletop scenarios: simulated outages, recovery step-by-step
- Metrics: RPO gap (time since last backup), RTO shortfall (estimated recovery time)
- Recommendations: backup frequency, off-site storage, recovery testing schedule

**Tests Required:**
- RTO/RPO questions clear and answerable
- Current state capture complete
- Gap analysis aligns with backup strategy
- Sector-specific questions relevant
- Metrics calculation accurate
- Recommendations practical

**Definition of Done:**
- Assessment flow for operational resilience operational
- Sector-specific content included
- Gap analysis working
- Recommendations generated

**Estimated Time:** 2 days

---

### C7: Offline IR Package

**Goal:** Generate encrypted, portable incident response toolkit: templates, checklists, playbooks, regulatory contact info, auto-regenerated periodically.

**Dependencies:** A2 (healthcare), A3 (legal)

**Features to Build:**
- Encryption: ZIP file encrypted with user password, AES-256
- Contents: IR templates (initial report, timeline, notification), checklists (containment, evidence), playbooks
- Regulatory contacts: state breach notification offices, FBI IC3, CISA
- Sector customization: healthcare includes HHS breach contact, legal includes state bar
- Offline access: no internet required, all templates self-contained
- Auto-regeneration: package regenerated monthly, reflects latest policy updates
- Expiration: package marked with generation date, recommended refresh every 3 months
- Distribution: can email to backup contacts, store in secure location

**Tests Required:**
- ZIP encryption works, password-protected
- All templates present and formatted
- Regulatory contacts current
- Sector customization correct
- Package generates successfully
- Offline access verified (no external requests)

**Definition of Done:**
- Package generation functional
- Encryption working
- All templates included
- Sector customization done
- Auto-regeneration scheduled
- Download functional

**Estimated Time:** 2 days

---

### C8: IR Walkthrough

**Goal:** Guide user through incident response: structured intake, containment steps, timestamped documentation, notification drafts.

**Dependencies:** C7 (IR templates), A4 (threat intelligence)

**Features to Build:**
- Structured intake: guided questions (what happened, when, who knows, what evidence)
- Timeline builder: user documents events chronologically, timestamps captured
- Containment steps: contextual recommendations based on incident type
- Evidence collection: checklist for system logs, network captures, affected systems
- Notification drafts: pre-populate breach notification emails (state AG, insurance, customers)
- Decision tree: guide user through containment vs. escalation vs. external party engagement
- Cost tracker: estimate costs (forensics, notification, downtime, regulatory fines)
- Export: generate incident report (PDF) with all documentation

**Tests Required:**
- Intake questions capture incident details
- Timeline builder works intuitively
- Containment steps contextually relevant
- Evidence checklist comprehensive
- Notification drafts pre-filled correctly
- Decision tree logic sound
- Cost estimate reasonable
- Report export complete

**Definition of Done:**
- IR walkthrough operational
- Intake capturing details
- Timeline builder working
- Containment guidance deployed
- Notification drafts functional
- Export generating reports

**Estimated Time:** 3 days

---

### C9: Tabletop Generator

**Goal:** Create incident response tabletops: custom scenarios, timed injects, facilitator guide, sector-specific templates.

**Dependencies:** A2 (healthcare), A3 (legal), A4 (threat intelligence)

**Features to Build:**
- Scenario builder: create custom incident scenarios (ransomware, data breach, BEC, DDoS)
- Preset scenarios: healthcare (ransomware targeting EHR), legal (BEC targeting client funds)
- Injects: timed events ("30 min: alert received", "60 min: press inquiry")
- Facilitator guide: talking points, decision points, scoring criteria
- Participant materials: scenario brief, timeline, role assignments
- Scoring: evaluate team response (speed, correctness, communication)
- Metrics: capture lessons learned, action items, follow-up training needs
- Export: generate facilitator guide (PDF), participant materials, debrief template

**Tests Required:**
- Scenario creation works intuitively
- Injects trigger at correct times
- Facilitator guide comprehensive
- Participant materials clear
- Scoring algorithm fair
- Export generates correctly
- Sector scenarios realistic

**Definition of Done:**
- Scenario builder operational
- Preset scenarios included
- Facilitator guide generation working
- Injects timed correctly
- Scoring functional
- Export complete

**Estimated Time:** 3 days

---

### C10: Assessment Report

**Goal:** Generate professional PDF/DOCX assessment reports: 5-15 pages, executive summary, detailed findings, recommendations, compliance status.

**Dependencies:** C2 (ASSESS), C3 (PLAN)

**Features to Build:**
- Executive summary: 1-2 pages, key findings, top gaps, financial exposure
- Detailed findings: 3-8 pages, control-by-control scoring, explanations
- Recommendations: prioritized action plan with cost, difficulty, compliance tags
- Compliance status: HIPAA/ABA/SEC/state breach law compliance breakdown
- Visual assets: charts (Tier distribution, top gaps), heatmaps (control matrix)
- Custom branding: header, footer, logo, colors (white-label option)
- Metadata: assessment date, assessor, organization, document version
- Export formats: PDF (for distribution), DOCX (for further editing)

**Tests Required:**
- Report generates with all sections
- Data accuracy (scores, recommendations, compliance)
- Visual assets render correctly
- Custom branding applied
- Export formats valid
- Report length 5-15 pages
- Professional appearance

**Definition of Done:**
- Report generator functional
- All sections rendering
- Formatting professional
- Export options working
- Custom branding deployed

**Estimated Time:** 3 days

---

### C11: Admin Panel

**Goal:** Enable super-admin management: tenant CRUD, users, knowledge versions, evals, costs, role-based access.

**Dependencies:** F5 (frontend), F1 (database), D12 (RBAC)

**Features to Build:**
- Tenant management: list, create, edit, archive tenants; view tenant metrics (users, assessments, costs)
- User management: list users per tenant, manage roles (admin, assessor, viewer), deactivate accounts
- Knowledge versions: view current version, version history, rollback button, changelog
- Eval dashboard: view latest eval results (accuracy, hallucination, performance), trend over time
- Cost dashboard: daily/monthly costs per tenant, model usage breakdown, cost anomalies
- Permissions: role-based access (super-admin only for tenant ops, tenant-admin for users)
- Audit log: view all admin actions (tenant creation, user changes, rollbacks)
- Reporting: export tenant metrics, cost reports, usage analytics

**Tests Required:**
- Tenant CRUD works
- User management functional
- Knowledge version controls working
- Eval dashboard displays correctly
- Cost dashboard accurate
- Permissions enforced
- Audit log complete
- Reports export correctly

**Definition of Done:**
- Admin panel deployed
- All CRUD operations working
- Dashboards functional
- Permissions enforced
- Audit logging active

**Estimated Time:** 3 days

---

## Workstream D: Security (15 tasks)

### D1: Multi-Tenant Architecture

**Goal:** Design and implement secure multi-tenant data isolation at database and application layers.

**Dependencies:** F1 (database), F4 (environment)

**Features to Build:**
- Tenant ID as partition key: every data table includes tenant_id
- Data isolation: queries always filter by tenant_id, no cross-tenant queries possible
- Database views: tenant-specific views with WHERE tenant_id = ? baked in
- Application layer: middleware enforces tenant_id from auth token, injects into all queries
- Audit logging: all cross-tenant attempts logged as CRITICAL
- Testing: automated tests verify data isolation (queries from tenant A don't see B's data)

**Tests Required:**
- Query isolation verified (tenant A can't see B's data)
- Middleware enforces tenant_id correctly
- Views filter by tenant_id
- Cross-tenant attempts logged
- Performance impact acceptable (<5% latency increase)

**Definition of Done:**
- Multi-tenant architecture implemented
- Data isolation verified
- Middleware deployed
- Testing comprehensive
- Monitoring active

**Estimated Time:** 2 days

---

### D2: Row-Level Security (RLS)

**Goal:** Implement PostgreSQL RLS policies to enforce tenant and user-scoped access at database level.

**Dependencies:** F1 (database), D1 (multi-tenant)

**Features to Build:**
- RLS policies per table: conversations, assessments, messages, audit_logs
- Tenant policy: users see only their tenant's data
- User policy: users see only their own conversations/assessments
- Admin override: admins can query other users' data with audit trail
- Policy testing: verify policy enforcement with test tenants/users
- Performance: RLS overhead measured, <10% latency impact acceptable

**Tests Required:**
- RLS policy prevents unauthorized access
- Admin override works with audit trail
- Performance acceptable
- Policy coverage complete (all sensitive tables)

**Definition of Done:**
- RLS policies deployed on all sensitive tables
- Policy enforcement verified
- Performance acceptable
- Admin override working

**Estimated Time:** 2 days

---

### D3: Encryption at Rest

**Goal:** Encrypt sensitive data at rest using AWS KMS or equivalent.

**Dependencies:** F1 (database), F4 (environment)

**Features to Build:**
- KMS key setup: per-tenant or per-account KMS keys
- Encryption columns: conversation_metadata, assessment_data, user_settings encrypted
- Transparent decryption: application layer decrypts on read, transparent to business logic
- Key rotation: automatic annual key rotation, no downtime
- Backup encryption: database backups encrypted with same keys
- Secrets storage: all secrets (API keys, passwords) stored in AWS Secrets Manager

**Tests Required:**
- Encrypted columns unreadable in database directly
- Application reads and decrypts correctly
- Key rotation succeeds without errors
- Backup encryption verified
- Secrets storage functional

**Definition of Done:**
- Encryption implemented on sensitive columns
- Key rotation working
- Backup encryption verified
- Secrets management in place

**Estimated Time:** 2 days

---

### D4: PII Handling

**Goal:** Detect, minimize, and securely manage personally identifiable information (PII).

**Dependencies:** B4 (input sanitization)

**Features to Build:**
- PII detection: regex patterns for SSN, credit card, medical record ID, healthcare identifiers
- Masking: PII in logs masked (e.g., SSN → ***-**-1234)
- Minimal storage: never store PII beyond assessment context, auto-delete after 90 days
- Encryption: PII encrypted at rest (KMS) and in transit (TLS)
- User notification: if PII detected in user input, flag and advise proper handling
- Compliance: HIPAA, CCPA, GDPR compliance for PII handling
- Audit: all PII access logged with user, timestamp, purpose

**Tests Required:**
- PII detection identifies common patterns
- Masking applied in logs
- Auto-deletion works (90-day retention)
- Encryption transparent
- User notifications clear
- Audit logging comprehensive

**Definition of Done:**
- PII detection operational
- Masking deployed in logging
- Auto-deletion scheduled
- Encryption working
- Compliance verified

**Estimated Time:** 2 days

---

### D5: Cross-Tenant Isolation

**Goal:** Verify and continuously test cross-tenant isolation to prevent data leakage.

**Dependencies:** D1 (multi-tenant), D2 (RLS)

**Features to Build:**
- Automated testing: nightly tests query data as different tenants, verify isolation
- Penetration testing: red team attempts to access other tenants' data
- Query analysis: static analysis of all database queries for tenant_id filters
- Cache isolation: cache keys include tenant_id, no cross-tenant cache hits
- API testing: each endpoint tested with multiple tenant tokens, no data leakage
- Alerting: any cross-tenant access attempt logs as CRITICAL, alerts security team

**Tests Required:**
- Automated isolation tests pass nightly
- Penetration tests fail to access other tenant data
- Query analysis finds all queries properly filtered
- Cache isolation verified
- API endpoints tested for leakage
- Alerting functional

**Definition of Done:**
- Automated testing operational
- Isolation verified nightly
- Penetration testing passed
- Cache isolation working
- Alerting active

**Estimated Time:** 3 days

---

### D6: Data Residency

**Goal:** Ensure data storage complies with regulatory residency requirements (US data stays in US, EU in EU, etc.).

**Dependencies:** F4 (environment), F1 (database)

**Features to Build:**
- Region tagging: tenants tagged with required residency region
- Database selection: queries route to region-specific database
- Backup location: backups stored in same region
- Replication blocking: no cross-region replication without explicit approval
- Audit: all data location changes logged
- Compliance report: certification that all data in correct regions

**Tests Required:**
- Tenant queries hit correct regional database
- Backups stored in correct regions
- Replication blocked for restricted regions
- Audit log complete
- Compliance report generates correctly

**Definition of Done:**
- Data residency routing implemented
- Regional databases operational
- Backup location enforcement working
- Audit logging active

**Estimated Time:** 2 days

---

### D7: Input Validation

**Goal:** Comprehensive input validation to prevent injection, overflow, and malformed data attacks.

**Dependencies:** B4 (input sanitization)

**Features to Build:**
- Schema validation: Zod schemas enforce request structure
- Type validation: reject strings in numeric fields, etc.
- Length validation: max sizes enforced (query 2000 chars, file 50MB)
- Format validation: email, URL, phone number formats validated
- Encoding validation: UTF-8 normalized, invalid encodings rejected
- Injection pattern detection: 200+ patterns blocked (SQL, code, command, prompt)
- Error response: validation failures return 400 with clear error message
- Logging: all validation failures logged, patterns tracked

**Tests Required:**
- Schema validation rejects malformed requests
- Type validation enforces types
- Length validation enforces limits
- Format validation correct
- Injection patterns detected
- Error responses clear
- Logging comprehensive

**Definition of Done:**
- Validation middleware deployed
- All endpoints validated
- Error handling consistent
- Logging functional

**Estimated Time:** 2 days

---

### D8: Output Filtering

**Goal:** Sanitize and filter application output to prevent XSS, injection, and data leakage.

**Dependencies:** B5 (output validation)

**Features to Build:**
- XSS prevention: all user-generated content HTML-escaped
- Content-Type headers: correct MIME types prevent browser misinterpretation
- CSP headers: Content-Security-Policy restricts script sources
- Data filtering: responses don't include sensitive system info (stack traces, SQL queries)
- File download safety: files downloaded with correct Content-Disposition headers
- API response validation: all API responses match schema
- Audit logging: suspicious output patterns logged

**Tests Required:**
- XSS attempts blocked (script tags escaped)
- CSP headers enforced
- Content-Type headers correct
- Sensitive info not in responses
- File downloads safe
- API responses validated
- Suspicious patterns logged

**Definition of Done:**
- Output filtering middleware deployed
- XSS prevention verified
- CSP headers enforced
- API validation working

**Estimated Time:** 2 days

---

### D9: Secrets Management

**Goal:** Securely manage all secrets (API keys, database passwords, encryption keys) using AWS Secrets Manager.

**Dependencies:** F4 (environment)

**Features to Build:**
- Secrets storage: all secrets in AWS Secrets Manager (zero in code)
- Application access: application retrieves secrets at startup, caches in-memory
- Key rotation: automatic rotation schedule (monthly), old keys cached for graceful rollover
- Audit logging: all secret access logged (who, when, which secret)
- Access control: IAM policies restrict secret access to authorized services
- Local development: .env.local file for dev secrets (not committed)
- CI/CD secrets: GitHub Actions uses OIDC to authenticate to AWS (no stored credentials)

**Tests Required:**
- Secrets stored in AWS Secrets Manager
- Application retrieves and uses secrets
- Key rotation completes without errors
- Audit logging captures all access
- IAM policies enforced
- CI/CD pipeline authenticates via OIDC

**Definition of Done:**
- All secrets migrated to AWS Secrets Manager
- Application retrieves at startup
- Key rotation working
- Audit logging active
- IAM policies enforced

**Estimated Time:** 2 days

---

### D10: Dependency Scanning

**Goal:** Scan application dependencies for known vulnerabilities and manage patches.

**Dependencies:** F4 (environment)

**Features to Build:**
- Dependency vulnerability scanner: npm audit, pip check, Snyk integration
- Automated scanning: nightly scans of dependencies, vulnerabilities reported
- Severity handling: CRITICAL vulnerabilities block deployment, HIGH requires manual approval
- Patch tracking: prioritize patches by severity and exploitability
- Update policy: maintain updated dependencies, security patches within 24 hours
- SBOM generation: software bill of materials for audit and regulatory compliance

**Tests Required:**
- Scanner detects known vulnerabilities
- Scanning runs nightly without errors
- CRITICAL vulnerabilities block deployment
- HIGH vulnerabilities require approval
- SBOM generates correctly
- Audit trail of patches applied

**Definition of Done:**
- Dependency scanner deployed
- Nightly scanning active
- Vulnerability blocking enforced
- Patch tracking working
- SBOM generated

**Estimated Time:** 1 day

---

### D11: SIEM Integration

**Goal:** Stream security logs to SIEM (Splunk/ELK) for real-time threat detection and compliance reporting.

**Dependencies:** F6 (logging), D7-D8 (validation/filtering)

**Features to Build:**
- Log shipping: structured JSON logs shipped to SIEM (Splunk or ELK)
- Alert rules: detection rules for suspicious patterns (multiple failed auth, data extraction, injection attempts)
- Real-time alerting: CRITICAL alerts surface in <5 min
- Compliance dashboards: HIPAA audit trail, data access patterns, unauthorized attempts
- Retention: SIEM retains logs for 1 year (hot 90 days, cold archive)
- Incident enrichment: SIEM correlates logs with threat intelligence, provides context

**Tests Required:**
- Logs ship to SIEM correctly
- Alert rules trigger on suspicious patterns
- Alerting latency <5 min
- Compliance dashboards accurate
- Retention policy enforced

**Definition of Done:**
- SIEM integration deployed
- Log shipping verified
- Alert rules configured
- Compliance dashboards created
- Retention policy active

**Estimated Time:** 2 days

---

### D12: RBAC Implementation

**Goal:** Implement role-based access control (RBAC) for multi-level permissions: super-admin, tenant-admin, assessor, viewer.

**Dependencies:** F1 (database), D1 (multi-tenant)

**Features to Build:**
- Role definitions: super-admin (all operations), tenant-admin (tenant management), assessor (assessments), viewer (read-only)
- Permission matrix: map roles to API endpoints, database tables
- Middleware enforcement: check user role before allowing action
- Database-level enforcement: RLS policies supplement middleware
- Role assignment: admins assign roles to users within tenant
- Audit logging: all permission changes logged

**Tests Required:**
- Each role has correct permissions
- Middleware enforces permissions
- Database-level enforcement works
- Unauthorized actions blocked
- Audit logging complete
- Permission changes tracked

**Definition of Done:**
- RBAC implemented on all endpoints
- Middleware enforcing correctly
- Database enforcement working
- Role assignment functional
- Audit logging active

**Estimated Time:** 2 days

---

### D13: MFA & Session Management

**Goal:** Enforce multi-factor authentication (MFA) and secure session management with short expiry and refresh tokens.

**Dependencies:** C1 (onboarding), D12 (RBAC)

**Features to Build:**
- MFA types: TOTP (authenticator app), SMS, backup codes
- MFA enforcement: required for all users, no exceptions
- Session tokens: JWT with 15-min expiry, refresh tokens with 7-day expiry
- Refresh token rotation: new refresh token issued on each use, old one invalidated
- Session tracking: track active sessions, allow revocation from admin panel
- Device trust: optional: remember device for 30 days (skip MFA on trusted devices)
- Logout: logout invalidates session and refresh tokens
- Password reset security: requires MFA to reset password

**Tests Required:**
- MFA required and enforced
- Session tokens expire correctly
- Refresh tokens rotate properly
- Session revocation works
- Logout clears tokens
- Password reset requires MFA
- Device trust optional and working

**Definition of Done:**
- MFA deployed and enforced
- Session token lifecycle working
- Refresh token rotation verified
- Logout functional
- Admin session management working

**Estimated Time:** 2 days

---

### D14: Audit Logging

**Goal:** Comprehensive audit logging of all user actions, administrative changes, and security events.

**Dependencies:** F1 (database), F6 (logging)

**Features to Build:**
- Audit table: user_id, action, resource, change_before/after, timestamp, IP, user_agent
- Actions tracked: create/update/delete assessment, view conversation, admin user changes, knowledge updates
- Data retention: 1-year retention for audit logs
- Compliance report: generate audit report for regulatory review
- Real-time streaming: audit logs streamed to SIEM
- Query interface: admin panel allows querying audit logs by user, date, action
- Immutability: audit logs cannot be modified, only archived

**Tests Required:**
- Audit log entry created for each tracked action
- Data before/after captured correctly
- Compliance report generates
- Log streaming works
- Query interface functional
- Immutability verified

**Definition of Done:**
- Audit logging deployed on all actions
- Audit table capturing data
- Compliance reports functional
- SIEM streaming active
- Query interface deployed

**Estimated Time:** 2 days

---

### D15: HIPAA Compliance Check

**Goal:** Implement automated checks to ensure HIPAA compliance: encryption, access controls, audit trails, incident response.

**Dependencies:** D1-D14 (security infrastructure)

**Features to Build:**
- Encryption verification: audit script checks all sensitive columns encrypted
- Access control verification: RLS policies enforced, audit trail captured
- Audit trail verification: all data access logged and reviewed
- Incident response readiness: test IR playbook, document procedures
- Business associate agreements: document with all vendors and processors
- Risk assessment: annual risk assessment documents vulnerabilities and mitigations
- HIPAA training: annual training for all staff, tracked and audited
- Compliance certification: annual HIPAA compliance certification generated

**Tests Required:**
- Encryption check passes
- Access control check passes
- Audit trail check passes
- IR playbook executable
- BAAs signed with all vendors
- Risk assessment complete
- Training tracked
- Compliance certification generated

**Definition of Done:**
- Compliance checks operational
- Encryption verified
- Access controls verified
- Audit trails complete
- IR playbook tested
- HIPAA certification ready

**Estimated Time:** 2 days

---

## Workstream E: Eval Framework (8 tasks)

### E1: Accuracy Benchmark

**Goal:** Establish baseline accuracy metrics for RAG retrieval, response quality, and citation correctness.

**Dependencies:** B2 (RAG), A1-A5 (knowledge)

**Features to Build:**
- Golden query set: 100+ test queries with expected answers and citations
- Retrieval metrics: recall@5, recall@10, MRR (mean reciprocal rank)
- Response quality: evaluators score responses (poor/fair/good/excellent)
- Citation accuracy: evaluate if citations match retrieved chunks
- Baseline establishment: measure accuracy on Haiku/Sonnet/Opus
- Sector-specific accuracy: separate benchmarks for healthcare/legal

**Tests Required:**
- Golden query set created and validated
- Retrieval metrics calculated correctly
- Response quality scoring consistent (inter-rater agreement >0.8)
- Citation accuracy tracked
- Baseline metrics documented

**Definition of Done:**
- Golden query set established
- Baseline metrics for all models
- Evaluation methodology documented
- Sector-specific baselines established

**Estimated Time:** 2 days

---

### E2: Hallucination Detection

**Goal:** Identify and measure false or unsupported claims in model responses.

**Dependencies:** B3 (system prompt), E1 (accuracy)

**Features to Build:**
- Hallucination patterns: common false claims (made-up controls, misquoted regulations)
- Evaluation: domain experts review responses, mark hallucinations
- Rate measurement: hallucination rate per model
- Pattern analysis: identify which prompt types trigger hallucinations
- Mitigation strategies: system prompt improvements to reduce hallucinations
- Continuous monitoring: production responses monitored for hallucinations

**Tests Required:**
- Hallucination detection methodology sound
- Evaluators identify hallucinations consistently
- Hallucination rate tracked per model
- Patterns identified and analyzed
- Mitigation effectiveness measured

**Definition of Done:**
- Hallucination detection operational
- Baseline rates established
- Monitoring in production
- Mitigation strategies identified

**Estimated Time:** 2 days

---

### E3: Citation Accuracy Eval

**Goal:** Verify that citations accurately reflect retrieved knowledge chunks and no unsupported claims.

**Dependencies:** B5 (output validation), E1 (accuracy)

**Features to Build:**
- Citation evaluation: for each response, check if cited chunks support claim
- False citation detection: claims cited to unrelated chunks
- Missing citation detection: claims without citations when support exists
- Citation accuracy score: percentage of citations accurate
- Per-tenant metrics: track citation accuracy by client for quality improvement

**Tests Required:**
- Citation matching algorithm accurate
- False citations detected
- Missing citations identified
- Accuracy score calculated correctly
- Per-tenant tracking works

**Definition of Done:**
- Citation evaluation operational
- Accuracy metrics established
- Detection algorithms working
- Monitoring in production

**Estimated Time:** 1 day

---

### E4: Compliance Verification

**Goal:** Verify that responses comply with regulatory requirements and don't provide dangerous advice.

**Dependencies:** B3 (system prompt), B5 (output validation)

**Features to Build:**
- Compliance patterns: identify if response contradicts known regulations
- Dangerous advice detection: identify if response suggests risky actions
- Sector compliance: healthcare responses comply with HIPAA guidance, legal with ABA rules
- False positives: distinguish genuine non-compliance from false alarms
- Escalation: compliance failures escalated for review

**Tests Required:**
- Compliance check algorithm accurate
- Dangerous advice patterns detected
- Sector-specific compliance checked
- False positive rate <5%
- Escalation functional

**Definition of Done:**
- Compliance checking operational
- Dangerous advice detection working
- Sector checks deployed
- Escalation process defined

**Estimated Time:** 1 day

---

### E5: Performance SLA Testing

**Goal:** Verify response latency, throughput, and resource utilization meet SLAs.

**Dependencies:** B9 (streaming), F6 (logging)

**Features to Build:**
- Latency testing: measure p50, p95, p99 latency under load
- Throughput testing: how many concurrent users supported
- Resource utilization: CPU, memory, database connection usage
- Stress testing: gradual load increase to breaking point
- Scaling testing: horizontal scaling adds capacity linearly
- Degradation mode: response under resource constraints (graceful degradation)

**Tests Required:**
- Latency SLAs met (p95 <2 sec, p99 <5 sec)
- Throughput meets expected concurrency (100+ concurrent)
- Resource utilization reasonable
- Stress test completes without crashes
- Scaling effectiveness verified
- Degradation graceful

**Definition of Done:**
- Performance baseline established
- SLAs documented
- Load testing automated
- Monitoring in production

**Estimated Time:** 2 days

---

### E6: Cost Tracking Eval

**Goal:** Verify cost tracking accuracy for tokens, embeddings, and API calls per tenant.

**Dependencies:** B1 (LiteLLM), B7 (token budget)

**Features to Build:**
- Cost calculation: verify token counts and costs match vendor billing
- Per-tenant billing: costs aggregated accurately by tenant
- Cost alerts: alerts when tenant cost exceeds threshold
- Cost optimization: identify high-cost interactions, suggest optimizations
- Billing accuracy: reconcile with vendor bills monthly

**Tests Required:**
- Cost calculation matches vendor billing
- Per-tenant aggregation accurate
- Alerts trigger correctly
- Billing reconciliation matches
- Cost optimization suggestions helpful

**Definition of Done:**
- Cost tracking operational
- Billing accurate
- Alerts configured
- Monthly reconciliation process

**Estimated Time:** 1 day

---

### E7: Regression Suite Expansion

**Goal:** Grow regression test suite to cover all features and prevent regressions.

**Dependencies:** E1-E6 (eval framework)

**Features to Build:**
- Automated regression tests: unit + integration + E2E tests for all features
- Coverage tracking: measure code/feature coverage
- Continuous regression: nightly regression runs, results reported
- Regression detection: compare results to baseline, flag regressions
- Fast feedback: regression suite runs in <10 min
- Flaky test detection: identify and fix unreliable tests

**Tests Required:**
- Regression suite comprehensive (80%+ feature coverage)
- Nightly runs succeed
- Regressions detected reliably
- Suite runs fast (<10 min)
- Flaky tests identified and fixed

**Definition of Done:**
- Regression suite >80% coverage
- Nightly runs automated
- Regression detection active
- Suite performance <10 min

**Estimated Time:** 2 days

---

### E8: Load Testing & Scaling

**Goal:** Conduct load testing to establish scaling limits and optimize infrastructure for production load.

**Dependencies:** E5 (performance), F4 (environment)

**Features to Build:**
- Load profile: define expected load (users, concurrent, requests/sec)
- Test scenarios: assess, plan, IR walkthrough, admin operations
- Scaling targets: define scaling policies (CPU >70% → scale up)
- Database scaling: verify read replicas support read load
- Cache scaling: verify Redis handles session/cache load
- Failure mode: test behavior under resource exhaustion
- Auto-scaling: verify infrastructure scales automatically

**Tests Required:**
- Load test reproduces expected production load
- Scaling policies trigger correctly
- Database replicas reduce load
- Cache effectiveness measured
- Graceful degradation under overload
- Auto-scaling works

**Definition of Done:**
- Load testing completed
- Scaling targets established
- Auto-scaling configured
- Infrastructure capacity known
- Monitoring for overload alerts

**Estimated Time:** 2 days

---

## Workstream O: Operations (5 tasks)

### O1: Internal IR Plan

**Goal:** Document incident response procedures for EVE Secure team (not for customers).

**Dependencies:** C8 (IR walkthrough)

**Features to Build:**
- Incident types: categorize incidents (security breach, data loss, service outage, vendor compromise)
- Detection procedures: how incidents are discovered (alerts, user reports, security team)
- Response procedures: triage, containment, investigation, communication, recovery
- Roles and responsibilities: who does what during incident
- Communication plan: internal escalation, customer notification, regulatory notification
- Recovery procedures: data restoration, service recovery, post-incident review
- Testing: tabletop exercises quarterly to maintain readiness

**Tests Required:**
- IR plan covers all incident types
- Roles and responsibilities clear
- Recovery procedures tested
- Communication plan covers scenarios
- Tabletop exercises scheduled and executed

**Definition of Done:**
- IR plan documented
- Roles assigned
- Recovery procedures tested
- Team training completed
- Quarterly tabletops scheduled

**Estimated Time:** 2 days

---

### O2: Uptime & Alerting

**Goal:** Establish monitoring, alerting, and uptime targets to maintain service reliability.

**Dependencies:** F6 (logging), F4 (environment)

**Features to Build:**
- Uptime target: 99.9% availability (4.38 hours downtime per month)
- Health checks: API health check endpoint, database connectivity, dependency checks
- Alert rules: alert on service down, error rate >5%, latency >2 sec p95
- Alerting channels: PagerDuty for CRITICAL, Slack for WARNING
- On-call rotation: establish on-call schedule, escalation procedures
- Incident tracking: track incidents, TTR (time to recovery), RCA (root cause analysis)
- SLA reporting: monthly uptime report for customers

**Tests Required:**
- Health checks detect failures
- Alerts fire on thresholds
- Alerting channels deliver
- On-call rotation works
- Incident tracking complete
- SLA reports generated

**Definition of Done:**
- Monitoring deployed
- Alert rules configured
- On-call rotation established
- Incident tracking system in place
- SLA reporting automated

**Estimated Time:** 2 days

---

### O3: Cost Monitoring

**Goal:** Track and optimize operational costs (compute, storage, API, vendor services).

**Dependencies:** E6 (cost tracking)

**Features to Build:**
- Cost breakdown: compute (ECS), storage (RDS, S3), API (LiteLLM), monitoring
- Per-tenant cost tracking: allocate costs to tenants for billing
- Cost anomaly detection: alert if costs spike unexpectedly
- Cost optimization: identify and implement cost-saving measures
- Budget tracking: compare actual to budget, track trends
- Reporting: monthly cost reports for finance and customers

**Tests Required:**
- Cost breakdown accurate
- Per-tenant allocation correct
- Anomaly detection works
- Optimization recommendations helpful
- Budget tracking accurate
- Reports generated correctly

**Definition of Done:**
- Cost monitoring operational
- Per-tenant tracking working
- Anomaly detection active
- Optimization process defined
- Monthly reporting automated

**Estimated Time:** 1 day

---

### O4: Client Offboarding

**Goal:** Establish secure procedures for removing clients (data deletion, account closure, knowledge transfer).

**Dependencies:** D14 (audit logging), D4 (PII handling)

**Features to Build:**
- Offboarding checklist: steps to remove client data and accounts
- Data deletion: securely delete all client data (conversations, assessments)
- Account closure: revoke all access tokens, disable user accounts
- Knowledge transfer: export client data if requested (GDPR right to portability)
- Cleanup verification: verify all client data deleted
- Audit trail: log all offboarding actions
- SLA: complete offboarding <30 days after request

**Tests Required:**
- Offboarding checklist comprehensive
- Data deletion thorough (no traces remain)
- Account closure effective
- Data export complete and usable
- Cleanup verification works
- Audit trail complete

**Definition of Done:**
- Offboarding procedure documented
- Checklist created
- Data deletion automated
- Verification process in place
- SLA tracked

**Estimated Time:** 1 day

---

### O5: DR Runbook

**Goal:** Document disaster recovery procedures: backup strategy, RTO/RPO targets, recovery testing.

**Dependencies:** F4 (environment), O2 (alerting)

**Features to Build:**
- Backup strategy: daily incremental, weekly full, monthly archive
- Backup verification: restore testing monthly, all backups verified
- RTO target: <1 hour recovery to operational state
- RPO target: <1 hour data loss acceptable
- Recovery procedures: step-by-step guide to restore from backup
- Testing: quarterly DR drills, recovery procedures tested
- Documentation: runbook documented and accessible to ops team

**Tests Required:**
- Backup creation succeeds
- Restore testing successful monthly
- RTO/RPO targets met in testing
- Recovery procedures work as documented
- DR drills successful
- Runbook clear and usable

**Definition of Done:**
- Backup strategy implemented
- Restore testing monthly
- RTO/RPO verified
- Recovery procedures documented
- DR drills scheduled and executed
- Runbook accessible

**Estimated Time:** 2 days

---

## Dependencies & Critical Path

**Critical Path Summary:**
1. **Week 0 (F1-F6):** All foundation tasks enable everything else
2. **Weeks 1-2:** Knowledge base and AI engine foundation; security basics
3. **Weeks 3-4:** Knowledge expansion and AI engine completion
4. **Week 5:** Core product launch
5. **Weeks 6-7:** Phase 1.1 features and security hardening

**Key Dependencies:**
- F1 enables A1-A9, B2, B6, C2-C11, D1-D15
- F3 enables B2, A1-A9
- F5 enables C1-C11
- B2 enables C2-C11, E1-E5
- A1-A5 enable C2-C6
- D1-D15 enable production launch

**Risk Mitigation:**
- Week 0 fully completes before Weeks 1-2 start
- Security review (D1-D15) completed before core ship
- Eval framework (E1-E8) prevents low-quality launch

---

## Success Criteria

- All 60 tasks completed and Definition of Done met
- Core product (C1-C4, C6, C10, C11) ships by end of Week 5
- Security review passed by end of Week 5
- Phase 1.1 (C5, C7-C9) ships by end of Week 7
- Uptime target (99.9%) met
- Citation accuracy >95%
- Hallucination rate <5%
- HIPAA compliance verified
- Cost tracking accurate
- On-call rotation established
