-- EVE Secure Migration 005: Security Fixes
-- Hardens RLS policies per security audit findings:
-- 1. Emergency codes UPDATE: remove is_emergency_access() — emergency = SELECT only
-- 2. Audit events INSERT: enforce tenant_id check instead of WITH CHECK (true)
-- 3. Add validate_rls_context() to verify session context is set

-- ============================================================================
-- 1. FIX emergency_codes UPDATE policy
-- Emergency access should only grant SELECT, not UPDATE.
-- ============================================================================
DROP POLICY IF EXISTS "emergency_codes_update" ON emergency_codes;
CREATE POLICY "emergency_codes_update" ON emergency_codes FOR UPDATE
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
  );

-- ============================================================================
-- 2. FIX audit_events INSERT policy
-- WITH CHECK (true) allowed any user to insert audit events for any tenant.
-- Now enforces tenant_id matches the current session or user is super_admin.
-- ============================================================================
DROP POLICY IF EXISTS "audit_events_insert" ON audit_events;
CREATE POLICY "audit_events_insert" ON audit_events FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id', true)::uuid
    OR is_super_admin()
  );

-- ============================================================================
-- 3. validate_rls_context() — verify RLS session variables are set
-- Call before any RLS-protected operation to ensure context is initialized.
-- Returns true if valid, raises exception if not.
-- ============================================================================
CREATE OR REPLACE FUNCTION validate_rls_context()
RETURNS boolean AS $$
DECLARE
  v_user_id text;
  v_user_exists boolean;
BEGIN
  -- Check that app.current_user_id is set
  v_user_id := current_setting('app.current_user_id', true);

  IF v_user_id IS NULL OR v_user_id = '' THEN
    RAISE EXCEPTION 'RLS context not initialized: app.current_user_id is not set';
  END IF;

  -- Verify the user_id references a real user
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = v_user_id::uuid
  ) INTO v_user_exists;

  IF NOT v_user_exists THEN
    RAISE EXCEPTION 'RLS context invalid: app.current_user_id (%) does not match a real user', v_user_id;
  END IF;

  RETURN true;

EXCEPTION
  WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'RLS context invalid: app.current_user_id is not a valid UUID';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
