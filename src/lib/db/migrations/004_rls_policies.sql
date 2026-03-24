-- EVE Secure RLS Policies — Enhanced
-- Builds on 001_foundation.sql base policies
-- Adds: CRUD-specific policies, super-admin bypass, emergency access bypass

-- ============================================================================
-- HELPER FUNCTION: set_config for RLS context
-- ============================================================================
CREATE OR REPLACE FUNCTION set_config(p_setting text, p_value text)
RETURNS void AS $$
BEGIN
  PERFORM set_config(p_setting, p_value, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Check if current user is super_admin
-- ============================================================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = current_setting('app.current_user_id', true)::uuid
    AND role = 'super_admin'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- HELPER FUNCTION: Check if emergency access is active
-- ============================================================================
CREATE OR REPLACE FUNCTION is_emergency_access()
RETURNS boolean AS $$
BEGIN
  RETURN current_setting('app.emergency_access', true) = 'true';
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- DROP existing basic policies (from 001) and replace with granular ones
-- ============================================================================

-- Users
DROP POLICY IF EXISTS "tenant_isolation" ON users;
CREATE POLICY "users_select" ON users FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
    OR is_emergency_access()
  );
CREATE POLICY "users_insert" ON users FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "users_update" ON users FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "users_delete" ON users FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );

-- Org Profiles
DROP POLICY IF EXISTS "tenant_isolation" ON org_profiles;
CREATE POLICY "org_profiles_select" ON org_profiles FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "org_profiles_insert" ON org_profiles FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "org_profiles_update" ON org_profiles FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "org_profiles_delete" ON org_profiles FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );

-- Assessment Sessions
DROP POLICY IF EXISTS "tenant_isolation" ON assessment_sessions;
CREATE POLICY "assessment_sessions_select" ON assessment_sessions FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
    OR is_emergency_access()
  );
CREATE POLICY "assessment_sessions_insert" ON assessment_sessions FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "assessment_sessions_update" ON assessment_sessions FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "assessment_sessions_delete" ON assessment_sessions FOR DELETE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Assessment Responses
DROP POLICY IF EXISTS "tenant_isolation" ON assessment_responses;
CREATE POLICY "assessment_responses_select" ON assessment_responses FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "assessment_responses_insert" ON assessment_responses FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "assessment_responses_update" ON assessment_responses FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Action Plans
DROP POLICY IF EXISTS "tenant_isolation" ON action_plans;
CREATE POLICY "action_plans_select" ON action_plans FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "action_plans_insert" ON action_plans FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "action_plans_update" ON action_plans FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Generated Documents
DROP POLICY IF EXISTS "tenant_isolation" ON generated_documents;
CREATE POLICY "generated_documents_select" ON generated_documents FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "generated_documents_insert" ON generated_documents FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Notification Preferences
DROP POLICY IF EXISTS "tenant_isolation" ON notification_preferences;
CREATE POLICY "notification_prefs_select" ON notification_preferences FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "notification_prefs_insert" ON notification_preferences FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "notification_prefs_update" ON notification_preferences FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Audit Events (tenant isolation with null bypass for system events)
DROP POLICY IF EXISTS "tenant_isolation_audit" ON audit_events;
CREATE POLICY "audit_events_select" ON audit_events FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "audit_events_insert" ON audit_events FOR INSERT
  WITH CHECK (true); -- Any authenticated user can create audit events

-- Conversation State
DROP POLICY IF EXISTS "tenant_isolation" ON conversation_state;
CREATE POLICY "conversation_state_select" ON conversation_state FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );
CREATE POLICY "conversation_state_insert" ON conversation_state FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY "conversation_state_update" ON conversation_state FOR UPDATE
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Emergency Codes (user-scoped, not tenant-scoped)
DROP POLICY IF EXISTS "user_isolation" ON emergency_codes;
CREATE POLICY "emergency_codes_select" ON emergency_codes FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR is_super_admin()
    OR is_emergency_access()
  );
CREATE POLICY "emergency_codes_insert" ON emergency_codes FOR INSERT
  WITH CHECK (true); -- Service role handles inserts
CREATE POLICY "emergency_codes_update" ON emergency_codes FOR UPDATE
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    OR is_emergency_access()
  );

-- ============================================================================
-- RATE LIMITING TABLE for emergency access
-- ============================================================================
CREATE TABLE IF NOT EXISTS emergency_rate_limits (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier varchar(255) NOT NULL, -- email or IP
  attempt_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_rate_limits_identifier
  ON emergency_rate_limits (identifier, window_start);
