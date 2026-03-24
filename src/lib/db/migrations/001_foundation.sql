-- EVE Secure Foundation Schema
-- Enables pgvector and uuid extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "inet";

-- ============================================================================
-- TENANTS TABLE
-- ============================================================================
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  sector varchar(50) NOT NULL CHECK (sector IN ('healthcare', 'legal')),
  state varchar(2) NOT NULL,
  employee_count integer,
  it_budget_range varchar(50),
  current_tools jsonb DEFAULT '[]'::jsonb,
  has_cyber_insurance boolean DEFAULT false,
  carrier_name varchar(255),
  status varchar(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'offboarded')),
  kms_key_id varchar(255),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- USERS TABLE
-- ============================================================================
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  clerk_id varchar(255) UNIQUE NOT NULL,
  email varchar(255) NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('super_admin', 'tenant_admin', 'user')),
  notification_preferences jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, email)
);

-- ============================================================================
-- ORG PROFILES TABLE
-- ============================================================================
CREATE TABLE org_profiles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_name varchar(255) NOT NULL,
  sector varchar(50) NOT NULL,
  state varchar(2) NOT NULL,
  employee_count integer,
  it_budget_range varchar(50),
  current_tools jsonb DEFAULT '[]'::jsonb,
  ehr_system varchar(255),
  dms_system varchar(255),
  cyber_insurance boolean DEFAULT false,
  carrier varchar(255),
  profile_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- ============================================================================
-- ASSESSMENT SESSIONS TABLE
-- ============================================================================
CREATE TABLE assessment_sessions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  current_section varchar(255),
  progress_pct integer DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  tier_rating integer CHECK (tier_rating >= 1 AND tier_rating <= 4),
  gaps jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ASSESSMENT RESPONSES TABLE
-- ============================================================================
CREATE TABLE assessment_responses (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  question_id varchar(255),
  section varchar(255) NOT NULL,
  question_text text NOT NULL,
  response_text text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ACTION PLANS TABLE
-- ============================================================================
CREATE TABLE action_plans (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  recommendations jsonb DEFAULT '[]'::jsonb,
  total_cost_estimate decimal(10, 2),
  budget_constraint decimal(10, 2),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- GENERATED DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE generated_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  doc_type varchar(50) NOT NULL CHECK (doc_type IN ('cost_of_inaction', 'assessment_report', 'ir_package', 'tabletop', 'insurance_questionnaire')),
  s3_key varchar(512) NOT NULL,
  file_name varchar(255) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- KNOWLEDGE DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category varchar(50) NOT NULL CHECK (category IN ('nist_csf', 'hipaa', 'legal', 'threats', 'insurance')),
  subcategory varchar(100),
  title varchar(255) NOT NULL,
  content text NOT NULL,
  embedding vector(1024),
  metadata jsonb DEFAULT '{}'::jsonb,
  source_reference varchar(512),
  hash text NOT NULL,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- COMPLIANCE MATRIX TABLE
-- ============================================================================
CREATE TABLE compliance_matrix (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  nist_subcategory_id varchar(50),
  hipaa_spec varchar(255),
  aba_rule varchar(255),
  sec_rule varchar(255),
  state varchar(2),
  breach_notification_timeline varchar(50),
  breach_notification_recipients text,
  cmmc_level integer,
  circia_requirement varchar(255),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- ============================================================================
-- AUDIT EVENTS TABLE
-- ============================================================================
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(100) NOT NULL,
  event_data jsonb DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  response_text text,
  knowledge_version integer,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_enabled boolean DEFAULT true,
  sms_enabled boolean DEFAULT false,
  sms_critical_always boolean DEFAULT true,
  phone_number varchar(20),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- ============================================================================
-- EMERGENCY CODES TABLE
-- ============================================================================
CREATE TABLE emergency_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash varchar(255) NOT NULL,
  used boolean DEFAULT false,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- CONVERSATION STATE TABLE
-- ============================================================================
CREATE TABLE conversation_state (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  context_summary text,
  current_section_qa jsonb DEFAULT '{}'::jsonb,
  retrieved_knowledge_ids uuid[] DEFAULT '{}'::uuid[],
  token_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- FEATURE FLAGS TABLE
-- ============================================================================
CREATE TABLE feature_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(100) UNIQUE NOT NULL,
  enabled boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Users table - tenant isolation
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Org profiles table - tenant isolation
ALTER TABLE org_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON org_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Assessment sessions table - tenant isolation
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON assessment_sessions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Assessment responses table - tenant isolation
ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON assessment_responses
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Action plans table - tenant isolation
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON action_plans
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Generated documents table - tenant isolation
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON generated_documents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Notification preferences table - tenant isolation
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON notification_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Audit events table - tenant isolation (nullable for system events)
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_audit" ON audit_events
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Conversation state table - tenant isolation
ALTER TABLE conversation_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON conversation_state
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Emergency codes - user can only see their own codes
ALTER TABLE emergency_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_isolation" ON emergency_codes
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To rollback this migration, run:
-- DROP TABLE IF EXISTS feature_flags CASCADE;
-- DROP TABLE IF EXISTS conversation_state CASCADE;
-- DROP TABLE IF EXISTS emergency_codes CASCADE;
-- DROP TABLE IF EXISTS notification_preferences CASCADE;
-- DROP TABLE IF EXISTS audit_events CASCADE;
-- DROP TABLE IF EXISTS compliance_matrix CASCADE;
-- DROP TABLE IF EXISTS knowledge_documents CASCADE;
-- DROP TABLE IF EXISTS generated_documents CASCADE;
-- DROP TABLE IF EXISTS action_plans CASCADE;
-- DROP TABLE IF EXISTS assessment_responses CASCADE;
-- DROP TABLE IF EXISTS assessment_sessions CASCADE;
-- DROP TABLE IF EXISTS org_profiles CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS tenants CASCADE;
-- DROP EXTENSION IF EXISTS "uuid-ossp";
-- DROP EXTENSION IF EXISTS "vector";
-- DROP EXTENSION IF EXISTS "inet";
