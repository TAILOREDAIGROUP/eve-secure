# Backup & Restore Procedures

## Overview

EVE Secure uses a multi-layer backup strategy across Supabase (database), Cloudflare R2 (document storage), and application configuration. All backup infrastructure is covered under HIPAA BAA agreements with respective vendors.

**Recovery Targets:**
- **RTO (Recovery Time Objective):** 1 hour
- **RPO (Recovery Point Objective):** 15 minutes

---

## 1. Supabase Database Backups

### Automatic Daily Backups (Pro Plan)

Supabase Pro plan provides:
- **Daily automatic backups** with 7-day retention
- **Point-in-time recovery (PITR)** with WAL archiving (up to 7 days)
- All backups encrypted at rest (AES-256)
- Covered under Supabase HIPAA BAA (Team plan required)

### Point-in-Time Recovery Procedure

1. Navigate to Supabase Dashboard → Project → **Database** → **Backups**
2. Select **Point-in-time Recovery** tab
3. Choose the target recovery timestamp (within 7-day window)
4. Click **Start Recovery** — this creates a new project with restored data
5. Verify data integrity:
   ```sql
   -- Check row counts on critical tables
   SELECT 'users' as tbl, count(*) FROM users
   UNION ALL SELECT 'assessments', count(*) FROM assessments
   UNION ALL SELECT 'audit_events', count(*) FROM audit_events
   UNION ALL SELECT 'knowledge_documents', count(*) FROM knowledge_documents;
   ```
6. Update application environment variables to point to restored project
7. Verify application connectivity and run smoke tests

### Manual Backup (On-Demand)

```bash
# Export via Supabase CLI
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f backup_$(date +%Y%m%d_%H%M%S).sql

# Store encrypted backup
gpg --symmetric --cipher-algo AES256 backup_*.sql
```

---

## 2. Cloudflare R2 Document Storage Backup

### Strategy

- R2 provides **11 nines (99.999999999%) durability** with automatic replication
- All documents encrypted with tenant-specific KMS keys before upload
- Bucket: `eve-secure-documents`

### Cross-Region Replication

Configure R2 bucket replication for disaster recovery:
1. Cloudflare Dashboard → R2 → `eve-secure-documents` → **Settings**
2. Enable **Multi-region replication** (WNAM + ENAM recommended)

### Manual R2 Backup Procedure

```bash
# Sync R2 bucket to local backup (use rclone with Cloudflare R2 remote configured)
rclone sync r2:eve-secure-documents ./backup/r2-documents --progress

# Verify file count matches
rclone size r2:eve-secure-documents
ls -la ./backup/r2-documents | wc -l
```

---

## 3. Application Configuration Backup

### Environment Variables

- Stored in Cloudflare Pages environment settings
- Backup: export all env vars to encrypted vault (1Password, AWS Secrets Manager)
- Never store plaintext secrets in version control

### KMS Key Material

- AWS KMS keys are managed keys — AWS handles durability
- Document key ARNs and aliases in secure configuration store
- Key rotation policy: annual rotation with automatic re-encryption

---

## 4. Restore Procedures

### Full Database Restore

1. **Assess** — determine scope of data loss and target recovery point
2. **Communicate** — notify affected tenants per incident response plan
3. **Restore** — use PITR to recover to target timestamp
4. **Validate** — run integrity checks (row counts, checksums, audit trail verification)
5. **Cutover** — update DNS/environment to point to restored instance
6. **Verify** — run full test suite and manual smoke tests
7. **Document** — create incident report with timeline and root cause

### Document Storage Restore

1. Identify affected tenant/document scope
2. Restore from R2 replication or local backup
3. Verify document encryption headers and tenant isolation
4. Re-trigger virus scans on restored documents
5. Validate access permissions

---

## 5. Monthly Restore Test Procedure

**Frequency:** First Monday of each month
**Owner:** Platform Engineering Lead
**Duration:** ~2 hours

### Checklist

- [ ] **Database**: Initiate PITR restore to test project (use timestamp from 24h ago)
- [ ] **Database**: Verify row counts match production within RPO window
- [ ] **Database**: Run `npm run test` against restored database
- [ ] **Database**: Verify audit trail integrity (`verifyAuditEventIntegrity`)
- [ ] **R2**: Restore sample of 10 documents from backup
- [ ] **R2**: Verify decryption with tenant KMS keys
- [ ] **R2**: Verify virus scan status on restored documents
- [ ] **Application**: Deploy application against restored infrastructure
- [ ] **Application**: Run smoke test suite (`npm run test:e2e`)
- [ ] **Cleanup**: Tear down test restoration environment
- [ ] **Document**: Record results in compliance log with pass/fail status

### Success Criteria

- Database restored within 30 minutes (< RTO)
- Data loss within 15-minute window (< RPO)
- All integrity checks pass
- Application functional against restored data
- Audit trail continuous and verifiable

---

## 6. Incident Escalation

| Severity | Response Time | Escalation |
|----------|--------------|------------|
| P1 — Full data loss | Immediate | CTO + all engineering |
| P2 — Partial data loss | 15 minutes | Platform lead + on-call |
| P3 — Single tenant impact | 30 minutes | On-call engineer |
| P4 — Non-critical data | Next business day | Assigned engineer |
