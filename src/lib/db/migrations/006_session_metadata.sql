-- EVE Secure Migration 006: Session Metadata Table
-- Replaces Clerk publicMetadata storage with a Supabase-native table.
-- Stores MFA verification timestamps, login attempt tracking, and lockout state.

-- ============================================================================
-- CREATE session_metadata table
-- ============================================================================
CREATE TABLE IF NOT EXISTS session_metadata (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mfa_verified_at timestamptz,
  attempt_count integer DEFAULT 0 NOT NULL,
  locked_until timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_metadata_user_id
  ON session_metadata (user_id);
CREATE INDEX IF NOT EXISTS idx_session_metadata_tenant_id
  ON session_metadata (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_metadata_user_tenant
  ON session_metadata (user_id, tenant_id);

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE session_metadata ENABLE ROW LEVEL SECURITY;

-- Users can only read their own session metadata
CREATE POLICY "session_metadata_select" ON session_metadata FOR SELECT
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Users can only insert their own session metadata
CREATE POLICY "session_metadata_insert" ON session_metadata FOR INSERT
  WITH CHECK (
    user_id = current_setting('app.current_user_id', true)::uuid
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Users can only update their own session metadata
CREATE POLICY "session_metadata_update" ON session_metadata FOR UPDATE
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Users can only delete their own session metadata
CREATE POLICY "session_metadata_delete" ON session_metadata FOR DELETE
  USING (
    user_id = current_setting('app.current_user_id', true)::uuid
    AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Super admin bypass for all operations
CREATE POLICY "session_metadata_super_admin" ON session_metadata
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================================
-- Auto-update updated_at trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION update_session_metadata_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_metadata_updated_at
  BEFORE UPDATE ON session_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_session_metadata_timestamp();
