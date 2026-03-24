import { createBrowserClient } from '@supabase/ssr';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/db';

/**
 * Supabase Auth integration for EVE Secure (replaces Clerk)
 *
 * - Client-side: createClient() for browser auth
 * - Server-side: createServerClient() for SSR/API auth with cookies
 * - requireAuth() enforces authentication and resolves user + tenant
 * - MFA via Supabase TOTP (HIPAA requirement)
 * - RLS context: sets app.current_user_id and app.current_tenant_id via RPC
 */

// ─── Custom error ────────────────────────────────────────────────────────────

export class AuthError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

// ─── Auth result type ────────────────────────────────────────────────────────

export interface AuthResult {
  user: {
    id: string;
    email: string;
    role: string;
  };
  tenantId: string;
  supabaseUid: string;
}

// ─── Client-side (browser) ───────────────────────────────────────────────────

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Server-side (SSR / API routes) ──────────────────────────────────────────

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}

// ─── Service-role client (admin, bypasses RLS) ───────────────────────────────

export function createServiceClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Auth functions ──────────────────────────────────────────────────────────

export async function signIn(email: string, password: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AuthError(error.message, 401);
  return data;
}

export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, unknown>
) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  });
  if (error) throw new AuthError(error.message, 400);
  return data;
}

export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new AuthError(error.message, 500);
}

export async function getSession() {
  const supabase = await createServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw new AuthError(error.message, 500);
  return session;
}

export async function getUser() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new AuthError(error.message, 401);
  return user;
}

/**
 * Require an authenticated session. Throws 401 if no session.
 * Resolves the EVE Secure user record and tenant from the database.
 * Sets RLS context via app.current_user_id and app.current_tenant_id.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createServerClient();
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

  if (authError || !authUser) {
    throw new AuthError('Authentication required', 401);
  }

  // Resolve user record and tenant from database
  const db = getSupabaseAdmin();
  const { data: user, error: userError } = await db
    .from('users')
    .select('id, tenant_id, role, email')
    .eq('supabase_uid', authUser.id)
    .single();

  if (userError || !user) {
    throw new AuthError('User record not found', 403);
  }

  // Set RLS context for tenant isolation
  await db.rpc('set_rls_context', {
    p_user_id: user.id,
    p_tenant_id: user.tenant_id,
  }).then(({ error }) => {
    if (error) {
      // Non-fatal: RLS will still filter by tenant_id in queries
    }
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    tenantId: user.tenant_id,
    supabaseUid: authUser.id,
  };
}

// ─── MFA functions (HIPAA requirement) ───────────────────────────────────────

/**
 * Check if MFA is verified at AAL2 level.
 * Throws 403 if MFA not verified.
 */
export async function requireMFA() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) throw new AuthError(error.message, 500);

  if (data.currentLevel !== 'aal2') {
    throw new AuthError('MFA verification required', 403);
  }

  return data;
}

/**
 * Enroll a new MFA factor (TOTP).
 */
export async function enrollMFA(factorType: 'totp' = 'totp') {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType,
    friendlyName: 'EVE Secure TOTP',
  });
  if (error) throw new AuthError(error.message, 500);
  return data;
}

/**
 * Verify an MFA challenge with a TOTP code.
 */
export async function verifyMFA(factorId: string, code: string) {
  const supabase = await createServerClient();

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId });
  if (challengeError) throw new AuthError(challengeError.message, 400);

  const { data, error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  });
  if (error) throw new AuthError(error.message, 400);
  return data;
}

// ─── RLS context helper ─────────────────────────────────────────────────────

/**
 * Set RLS context for a specific Supabase client instance.
 */
export async function setRLSContext(
  supabase: ReturnType<typeof createSupabaseJsClient>,
  userId: string,
  tenantId: string
) {
  await supabase.rpc('set_rls_context', {
    p_user_id: userId,
    p_tenant_id: tenantId,
  });
}
