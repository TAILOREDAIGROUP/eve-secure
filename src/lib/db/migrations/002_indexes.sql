-- EVE Secure Indexes
-- Optimizes query performance for common access patterns

-- ============================================================================
-- KNOWLEDGE DOCUMENTS INDEXES
-- ============================================================================

-- Vector index for similarity search
CREATE INDEX idx_knowledge_documents_embedding
  ON knowledge_documents USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Category and subcategory lookup
CREATE INDEX idx_knowledge_documents_category_subcategory
  ON knowledge_documents (category, subcategory);

-- Hash lookup for deduplication
CREATE INDEX idx_knowledge_documents_hash
  ON knowledge_documents (hash);

-- ============================================================================
-- COMPLIANCE MATRIX INDEXES
-- ============================================================================

-- NIST subcategory lookup
CREATE INDEX idx_compliance_matrix_nist_subcategory_id
  ON compliance_matrix (nist_subcategory_id);

-- HIPAA and state regulations
CREATE INDEX idx_compliance_matrix_hipaa_state
  ON compliance_matrix (hipaa_spec, state);

-- ============================================================================
-- ASSESSMENT SESSIONS INDEXES
-- ============================================================================

-- Tenant and status lookup for active sessions
CREATE INDEX idx_assessment_sessions_tenant_status
  ON assessment_sessions (tenant_id, status);

-- Tenant and creation time for chronological queries
CREATE INDEX idx_assessment_sessions_tenant_created
  ON assessment_sessions (tenant_id, created_at DESC);

-- User sessions lookup
CREATE INDEX idx_assessment_sessions_user_id
  ON assessment_sessions (user_id);

-- ============================================================================
-- ASSESSMENT RESPONSES INDEXES
-- ============================================================================

-- Session responses
CREATE INDEX idx_assessment_responses_session_id
  ON assessment_responses (session_id);

-- Tenant and section filtering
CREATE INDEX idx_assessment_responses_tenant_section
  ON assessment_responses (tenant_id, section);

-- ============================================================================
-- ACTION PLANS INDEXES
-- ============================================================================

-- Session lookup
CREATE INDEX idx_action_plans_session_id
  ON action_plans (session_id);

-- Tenant lookup
CREATE INDEX idx_action_plans_tenant_id
  ON action_plans (tenant_id);

-- ============================================================================
-- GENERATED DOCUMENTS INDEXES
-- ============================================================================

-- Session documents
CREATE INDEX idx_generated_documents_session_id
  ON generated_documents (session_id);

-- Tenant and doc type filtering
CREATE INDEX idx_generated_documents_tenant_doctype
  ON generated_documents (tenant_id, doc_type);

-- ============================================================================
-- AUDIT EVENTS INDEXES
-- ============================================================================

-- Tenant and creation time (important for audit trails)
CREATE INDEX idx_audit_events_tenant_created
  ON audit_events (tenant_id, created_at DESC);

-- Event type lookup
CREATE INDEX idx_audit_events_event_type
  ON audit_events (event_type);

-- User activity lookup
CREATE INDEX idx_audit_events_user_id
  ON audit_events (user_id);

-- ============================================================================
-- USERS INDEXES
-- ============================================================================

-- Clerk ID lookup (authentication)
CREATE INDEX idx_users_clerk_id
  ON users (clerk_id);

-- Tenant users
CREATE INDEX idx_users_tenant_id
  ON users (tenant_id);

-- Email lookup
CREATE INDEX idx_users_email
  ON users (email);

-- ============================================================================
-- ORG PROFILES INDEXES
-- ============================================================================

-- Tenant lookup
CREATE INDEX idx_org_profiles_tenant_id
  ON org_profiles (tenant_id);

-- Sector and state filtering
CREATE INDEX idx_org_profiles_sector_state
  ON org_profiles (sector, state);

-- ============================================================================
-- NOTIFICATION PREFERENCES INDEXES
-- ============================================================================

-- User preferences lookup
CREATE INDEX idx_notification_preferences_user_id
  ON notification_preferences (user_id);

-- Tenant preferences lookup
CREATE INDEX idx_notification_preferences_tenant_id
  ON notification_preferences (tenant_id);

-- ============================================================================
-- EMERGENCY CODES INDEXES
-- ============================================================================

-- User emergency codes
CREATE INDEX idx_emergency_codes_user_id
  ON emergency_codes (user_id);

-- Code hash lookup
CREATE INDEX idx_emergency_codes_hash
  ON emergency_codes (code_hash);

-- ============================================================================
-- CONVERSATION STATE INDEXES
-- ============================================================================

-- Session conversation state lookup
CREATE INDEX idx_conversation_state_session_id
  ON conversation_state (session_id);

-- Tenant conversation state
CREATE INDEX idx_conversation_state_tenant_id
  ON conversation_state (tenant_id);

-- ============================================================================
-- TENANTS INDEXES
-- ============================================================================

-- Status lookup
CREATE INDEX idx_tenants_status
  ON tenants (status);

-- Sector filtering
CREATE INDEX idx_tenants_sector
  ON tenants (sector);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_tenants_sector;
-- DROP INDEX IF EXISTS idx_tenants_status;
-- DROP INDEX IF EXISTS idx_conversation_state_tenant_id;
-- DROP INDEX IF EXISTS idx_conversation_state_session_id;
-- DROP INDEX IF EXISTS idx_emergency_codes_hash;
-- DROP INDEX IF EXISTS idx_emergency_codes_user_id;
-- DROP INDEX IF EXISTS idx_notification_preferences_tenant_id;
-- DROP INDEX IF EXISTS idx_notification_preferences_user_id;
-- DROP INDEX IF EXISTS idx_org_profiles_sector_state;
-- DROP INDEX IF EXISTS idx_org_profiles_tenant_id;
-- DROP INDEX IF EXISTS idx_users_email;
-- DROP INDEX IF EXISTS idx_users_tenant_id;
-- DROP INDEX IF EXISTS idx_users_clerk_id;
-- DROP INDEX IF EXISTS idx_audit_events_user_id;
-- DROP INDEX IF EXISTS idx_audit_events_event_type;
-- DROP INDEX IF EXISTS idx_audit_events_tenant_created;
-- DROP INDEX IF EXISTS idx_generated_documents_tenant_doctype;
-- DROP INDEX IF EXISTS idx_generated_documents_session_id;
-- DROP INDEX IF EXISTS idx_action_plans_tenant_id;
-- DROP INDEX IF EXISTS idx_action_plans_session_id;
-- DROP INDEX IF EXISTS idx_assessment_responses_tenant_section;
-- DROP INDEX IF EXISTS idx_assessment_responses_session_id;
-- DROP INDEX IF EXISTS idx_assessment_sessions_user_id;
-- DROP INDEX IF EXISTS idx_assessment_sessions_tenant_created;
-- DROP INDEX IF EXISTS idx_assessment_sessions_tenant_status;
-- DROP INDEX IF EXISTS idx_compliance_matrix_hipaa_state;
-- DROP INDEX IF EXISTS idx_compliance_matrix_nist_subcategory_id;
-- DROP INDEX IF EXISTS idx_knowledge_documents_hash;
-- DROP INDEX IF EXISTS idx_knowledge_documents_category_subcategory;
-- DROP INDEX IF EXISTS idx_knowledge_documents_embedding;
