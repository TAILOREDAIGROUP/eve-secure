/**
 * EVE Secure Seed Script
 * Creates test data for 2 tenants with 3 users each + sample assessments
 * Idempotent: safe to run multiple times (uses upsert / ON CONFLICT)
 *
 * Usage: npx ts-node scripts/seed.ts
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY required. Set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// TENANT DATA
// ============================================================================

const TENANT_HEALTHCARE = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Greenfield Medical Group',
  sector: 'healthcare',
  state: 'SC',
  employee_count: 85,
  it_budget_range: '$50k-$100k',
  current_tools: ['Epic EHR', 'Microsoft 365', 'Sophos Firewall'],
  has_cyber_insurance: true,
  carrier_name: 'Chubb Cyber Enterprise',
  status: 'active',
  kms_key_id: 'arn:aws:kms:us-east-1:000000000000:key/healthcare-dev-001',
};

const TENANT_LEGAL = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Morrison & Associates PLLC',
  sector: 'legal',
  state: 'NY',
  employee_count: 42,
  it_budget_range: '$100k-$500k',
  current_tools: ['NetDocuments', 'Clio', 'CrowdStrike Falcon'],
  has_cyber_insurance: true,
  carrier_name: 'Coalition Cyber',
  status: 'active',
  kms_key_id: 'arn:aws:kms:us-east-1:000000000000:key/legal-dev-001',
};

// ============================================================================
// USER DATA — 3 per tenant (admin, user, readonly)
// ============================================================================

const USERS = [
  // Healthcare tenant
  {
    id: '33333333-3333-3333-3333-333333333333',
    tenant_id: TENANT_HEALTHCARE.id,
    clerk_id: 'user_healthcare_admin_001',
    email: 'dr.chen@greenfieldmedical.com',
    role: 'tenant_admin',
    notification_preferences: { email: true, sms: true },
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    tenant_id: TENANT_HEALTHCARE.id,
    clerk_id: 'user_healthcare_user_001',
    email: 'j.martinez@greenfieldmedical.com',
    role: 'user',
    notification_preferences: { email: true, sms: false },
  },
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    tenant_id: TENANT_HEALTHCARE.id,
    clerk_id: 'user_healthcare_readonly_001',
    email: 'k.patel@greenfieldmedical.com',
    role: 'user',
    notification_preferences: { email: true, sms: false },
  },
  // Legal tenant
  {
    id: '55555555-5555-5555-5555-555555555555',
    tenant_id: TENANT_LEGAL.id,
    clerk_id: 'user_legal_admin_001',
    email: 'r.morrison@morrisonassoc.com',
    role: 'tenant_admin',
    notification_preferences: { email: true, sms: true },
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    tenant_id: TENANT_LEGAL.id,
    clerk_id: 'user_legal_user_001',
    email: 's.williams@morrisonassoc.com',
    role: 'user',
    notification_preferences: { email: true, sms: false },
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tenant_id: TENANT_LEGAL.id,
    clerk_id: 'user_legal_readonly_001',
    email: 'a.nguyen@morrisonassoc.com',
    role: 'user',
    notification_preferences: { email: false, sms: false },
  },
];

// ============================================================================
// ORG PROFILES
// ============================================================================

const ORG_PROFILES = [
  {
    id: '77777777-7777-7777-7777-777777777777',
    tenant_id: TENANT_HEALTHCARE.id,
    org_name: 'Greenfield Medical Group',
    sector: 'healthcare',
    state: 'SC',
    employee_count: 85,
    it_budget_range: '$50k-$100k',
    current_tools: ['Epic EHR', 'Microsoft 365', 'Sophos Firewall'],
    ehr_system: 'Epic',
    dms_system: null,
    cyber_insurance: true,
    carrier: 'Chubb Cyber Enterprise',
    profile_data: {
      compliance_standards: ['HIPAA', 'HITECH'],
      data_sensitivity: 'phi',
      last_security_assessment: '2025-06-15',
      has_dedicated_it: false,
      uses_msp: true,
    },
  },
  {
    id: '88888888-8888-8888-8888-888888888888',
    tenant_id: TENANT_LEGAL.id,
    org_name: 'Morrison & Associates PLLC',
    sector: 'legal',
    state: 'NY',
    employee_count: 42,
    it_budget_range: '$100k-$500k',
    current_tools: ['NetDocuments', 'Clio', 'CrowdStrike Falcon'],
    ehr_system: null,
    dms_system: 'NetDocuments',
    cyber_insurance: true,
    carrier: 'Coalition Cyber',
    profile_data: {
      compliance_standards: ['ABA Model Rules 1.6', 'NY State Bar'],
      data_sensitivity: 'pii',
      last_security_assessment: null,
      has_dedicated_it: true,
      uses_msp: false,
    },
  },
];

// ============================================================================
// ASSESSMENT SESSIONS (various stages)
// ============================================================================

const ASSESSMENT_SESSIONS = [
  {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    tenant_id: TENANT_HEALTHCARE.id,
    user_id: USERS[0]!.id, // admin
    status: 'completed',
    current_section: 'RESPOND',
    progress_pct: 100,
    tier_rating: 2,
    gaps: [
      { function: 'PROTECT', category: 'PR.AC', gap: 'No MFA on EHR system', severity: 'critical' },
      { function: 'DETECT', category: 'DE.CM', gap: 'No network monitoring', severity: 'high' },
      { function: 'RESPOND', category: 'RS.RP', gap: 'No documented IR plan', severity: 'critical' },
    ],
    completed_at: new Date('2026-02-15').toISOString(),
  },
  {
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    tenant_id: TENANT_HEALTHCARE.id,
    user_id: USERS[1]!.id, // user
    status: 'in_progress',
    current_section: 'IDENTIFY',
    progress_pct: 25,
    tier_rating: null,
    gaps: [],
    completed_at: null,
  },
  {
    id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    tenant_id: TENANT_LEGAL.id,
    user_id: USERS[3]!.id, // legal admin
    status: 'in_progress',
    current_section: 'PROTECT',
    progress_pct: 40,
    tier_rating: null,
    gaps: [
      { function: 'IDENTIFY', category: 'ID.AM', gap: 'No asset inventory', severity: 'high' },
    ],
    completed_at: null,
  },
];

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedTenants() {
  const { error } = await supabase
    .from('tenants')
    .upsert([TENANT_HEALTHCARE, TENANT_LEGAL], { onConflict: 'id' });
  if (error) throw new Error(`Seed tenants failed: ${error.message}`);
  console.log('  Tenants seeded (2)');
}

async function seedUsers() {
  const { error } = await supabase
    .from('users')
    .upsert(USERS, { onConflict: 'id' });
  if (error) throw new Error(`Seed users failed: ${error.message}`);
  console.log(`  Users seeded (${USERS.length})`);
}

async function seedOrgProfiles() {
  const { error } = await supabase
    .from('org_profiles')
    .upsert(ORG_PROFILES, { onConflict: 'id' });
  if (error) throw new Error(`Seed org_profiles failed: ${error.message}`);
  console.log(`  Org profiles seeded (${ORG_PROFILES.length})`);
}

async function seedAssessmentSessions() {
  const { error } = await supabase
    .from('assessment_sessions')
    .upsert(ASSESSMENT_SESSIONS, { onConflict: 'id' });
  if (error) throw new Error(`Seed assessment_sessions failed: ${error.message}`);
  console.log(`  Assessment sessions seeded (${ASSESSMENT_SESSIONS.length})`);
}

async function seedEmergencyCodes() {
  // Generate emergency codes for each user
  for (const user of USERS) {
    // Check if codes already exist
    const { data: existing } = await supabase
      .from('emergency_codes')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  Emergency codes already exist for ${user.email}, skipping`);
      continue;
    }

    const codes: { user_id: string; code_hash: string; used: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      const plainCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      const hash = await bcrypt.hash(plainCode, 12);
      codes.push({
        user_id: user.id,
        code_hash: hash,
        used: false,
      });
    }

    const { error } = await supabase.from('emergency_codes').insert(codes);
    if (error) throw new Error(`Seed emergency_codes for ${user.email} failed: ${error.message}`);
  }
  console.log('  Emergency codes seeded (8 per user)');
}

async function seedFeatureFlags() {
  const flags = [
    { name: 'assessment_module', enabled: true, description: 'Core assessment questionnaire' },
    { name: 'rag_contextual_responses', enabled: true, description: 'RAG-based contextual responses' },
    { name: 'cost_of_inaction_report', enabled: true, description: 'Cost of inaction document generation' },
    { name: 'tier_assignment', enabled: true, description: 'Automatic tier assignment (1-4)' },
    { name: 'emergency_codes', enabled: true, description: 'Emergency recovery codes' },
    { name: 'ir_mode', enabled: false, description: 'Incident response walkthrough (Phase 1.1)' },
    { name: 'tabletop_exercises', enabled: false, description: 'Tabletop exercise generator (Phase 1.1)' },
    { name: 'insurance_helper', enabled: false, description: 'Insurance questionnaire helper (Phase 1.1)' },
  ];

  const { error } = await supabase
    .from('feature_flags')
    .upsert(flags, { onConflict: 'name' });
  if (error) throw new Error(`Seed feature_flags failed: ${error.message}`);
  console.log(`  Feature flags seeded (${flags.length})`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('Seeding EVE Secure database...\n');

  try {
    await seedTenants();
    await seedUsers();
    await seedOrgProfiles();
    await seedAssessmentSessions();
    await seedEmergencyCodes();
    await seedFeatureFlags();

    console.log('\nSeed complete.');
  } catch (error) {
    console.error('\nSeed failed:', error);
    process.exit(1);
  }
}

main();
