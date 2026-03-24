import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabaseAdmin } from '@/lib/db';
import { AuthError, type AuthResult } from './supabase-auth-client';

export { AuthError, type AuthResult };

// ─── Server-side (SSR / API routes) ────────────────────────────────────────────
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

// ─── Service-role client (admin, bypasses RLS) ─────────────────────────────────
export function createServiceClient() {
  return createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Auth functions ────────────────────────────────────────────────────────────
export async function getSession() {
  const supabase = await createServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw new AuthError(error.message, 500);
  return session;
}

export async function getUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
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

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    throw new AuthError('Authentication required', 401);
  }

  // Resolve user record and tenant from database
  const db = getSupabaseAdmin();
  const { data: user, error: userError } = await (db
    .from('users')
    .select('id, tenant_id, role, email')
    .eq('supabase_uid' as string, authUser.id)
    .single() as any);

  if (userError || !user) {
    throw new AuthError('User record not found', 403);
  }

  // Set RLS context for tenant isolation
  await (db.rpc as Function)('set_rls_context', {
    p_user_id: user.id,
    p_tenant_id: user.tenant_id,
  }).then(({ error }: { error: unknown }) => {
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

// ─── MFA functions (HIPAA requirement) ─────────────────────────────────────────
export async function requireMFA() {
  const supabase = await createServerClient();
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new AuthError(error.message, 500);

  if (data.currentLevel !== 'aal2') {
    throw new AuthError('MFA verification required', 403);
  }
  return data;
}

export async function enrollMFA(factorType: 'totp' = 'totp') {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType,
    friendlyName: 'EVE Secure TOTP',
  });
  if (error) throw new AuthError(error.message, 500);
  return data;
}

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

// ─── RLS context helper ────────────────────────────────────────────────────────
export async function setRLSContext(
  supabase: ReturnType<typeof createSupabaseJsClient>,
  userId: string,
  tenantId: string
) {
  await (supabase.rpc as Function)('set_rls_context', {
    p_user_id: userId,
    p_tenant_id: tenantId,
  });
}
