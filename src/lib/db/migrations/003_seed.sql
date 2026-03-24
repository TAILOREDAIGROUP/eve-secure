-- EVE Secure Seed Data
-- Initial test data for development and testing

-- ============================================================================
-- TEST TENANTS
-- ============================================================================

INSERT INTO tenants (
  id,
  name,
  sector,
  state,
  employee_count,
  it_budget_range,
  current_tools,
  has_cyber_insurance,
  carrier_name,
  status,
  kms_key_id,
  created_at,
  updated_at
) VALUES
(
  '11111111-1111-1111-1111-111111111111'::uuid,
  'MediCare Regional Hospital',
  'healthcare',
  'SC',
  250,
  '$100k-$250k',
  '["Epic EHR", "Medidata", "Palo Alto Networks"]'::jsonb,
  true,
  'Chubb Cyber',
  'active',
  'aws-kms-healthcare-001',
  now(),
  now()
),
(
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Turner & Associates LLP',
  'legal',
  'NY',
  180,
  '$50k-$100k',
  '["NetDocuments", "Lexis Nexis", "Fortinet"]'::jsonb,
  true,
  'AIG Cyber',
  'active',
  'aws-kms-legal-001',
  now(),
  now()
);

-- ============================================================================
-- TEST USERS
-- ============================================================================

INSERT INTO users (
  id,
  tenant_id,
  clerk_id,
  email,
  role,
  notification_preferences,
  created_at,
  updated_at
) VALUES
(
  '33333333-3333-3333-3333-333333333333'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_healthcare_admin_001',
  'admin@medicalregional.com',
  'tenant_admin',
  '{"email": true, "sms": false}'::jsonb,
  now(),
  now()
),
(
  '44444444-4444-4444-4444-444444444444'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_healthcare_user_001',
  'security@medicalregional.com',
  'user',
  '{"email": true, "sms": true}'::jsonb,
  now(),
  now()
),
(
  '55555555-5555-5555-5555-555555555555'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'user_legal_admin_001',
  'partner@turnerassoc.com',
  'tenant_admin',
  '{"email": true, "sms": false}'::jsonb,
  now(),
  now()
),
(
  '66666666-6666-6666-6666-666666666666'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'user_legal_user_001',
  'compliance@turnerassoc.com',
  'user',
  '{"email": true, "sms": false}'::jsonb,
  now(),
  now()
);

-- ============================================================================
-- ORG PROFILES
-- ============================================================================

INSERT INTO org_profiles (
  id,
  tenant_id,
  org_name,
  sector,
  state,
  employee_count,
  it_budget_range,
  current_tools,
  ehr_system,
  dms_system,
  cyber_insurance,
  carrier,
  profile_data,
  created_at,
  updated_at
) VALUES
(
  '77777777-7777-7777-7777-777777777777'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'MediCare Regional Hospital',
  'healthcare',
  'SC',
  250,
  '$100k-$250k',
  '["Epic EHR", "Medidata", "Palo Alto Networks"]'::jsonb,
  'Epic',
  NULL,
  true,
  'Chubb Cyber',
  '{"compliance_standards": ["HIPAA", "HITECH"], "data_sensitivity": "high"}'::jsonb,
  now(),
  now()
),
(
  '88888888-8888-8888-8888-888888888888'::uuid,
  '22222222-2222-2222-2222-222222222222'::uuid,
  'Turner & Associates LLP',
  'legal',
  'NY',
  180,
  '$50k-$100k',
  '["NetDocuments", "Lexis Nexis", "Fortinet"]'::jsonb,
  NULL,
  'NetDocuments',
  true,
  'AIG Cyber',
  '{"compliance_standards": ["ABA Model Rules", "State Bar Requirements"], "data_sensitivity": "high"}'::jsonb,
  now(),
  now()
);

-- ============================================================================
-- FEATURE FLAGS - ALL PHASE 1 FEATURES ENABLED
-- ============================================================================

INSERT INTO feature_flags (
  id,
  name,
  enabled,
  description,
  created_at,
  updated_at
) VALUES
(
  'ffffffff-ffff-ffff-ffff-000000000001'::uuid,
  'assessment_module',
  true,
  'Phase 1: Core assessment questionnaire and response collection',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000002'::uuid,
  'rag_contextual_responses',
  true,
  'Phase 1: RAG-based contextual response recommendations',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000003'::uuid,
  'cost_of_inaction_report',
  true,
  'Phase 1: Cost of inaction document generation',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000004'::uuid,
  'tier_assignment',
  true,
  'Phase 1: Automatic tier assignment (1-4) based on responses',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000005'::uuid,
  'assessment_report',
  true,
  'Phase 1: Assessment report generation with recommendations',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000006'::uuid,
  'tenant_isolation_rlsp',
  true,
  'Phase 1: Row-level security policies for multi-tenancy',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000007'::uuid,
  'audit_logging',
  true,
  'Phase 1: Comprehensive audit event logging',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000008'::uuid,
  'knowledge_base_seeding',
  true,
  'Phase 1: Initial NIST, HIPAA, and regulatory knowledge base',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000009'::uuid,
  'multi_sector_support',
  true,
  'Phase 1: Support for healthcare and legal sectors',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000010'::uuid,
  'clerk_authentication',
  true,
  'Phase 1: Clerk authentication integration',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000011'::uuid,
  'vector_search',
  true,
  'Phase 1: Vector embedding and similarity search for knowledge docs',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000012'::uuid,
  'notifications',
  true,
  'Phase 1: Email and SMS notification preferences',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000013'::uuid,
  'session_persistence',
  true,
  'Phase 1: Assessment session state persistence and recovery',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000014'::uuid,
  'emergency_codes',
  true,
  'Phase 1: Emergency recovery codes for account lockout',
  now(),
  now()
),
(
  'ffffffff-ffff-ffff-ffff-000000000015'::uuid,
  'conversation_state_management',
  true,
  'Phase 1: Conversation context and state management for multi-turn interactions',
  now(),
  now()
);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To rollback this migration, run:
-- DELETE FROM feature_flags;
-- DELETE FROM org_profiles;
-- DELETE FROM users;
-- DELETE FROM tenants;
