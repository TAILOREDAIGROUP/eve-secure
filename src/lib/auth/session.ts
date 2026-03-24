import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';

/**
 * Session metadata management for EVE Secure
 * Stores session metadata in Supabase (replaces Clerk publicMetadata)
 *
 * - MFA verification tracking
 * - Session timeout enforcement (30 min normal, 15 min sensitive)
 * - Lockout after 5 failed attempts (30 min)
 * - Tenant isolation via session data
 */

const SessionMetadataSchema = z.object({
  tenant_id: z.string().uuid(),
  mfa_verified_at: z.number().int(),
  attempt_count: z.number().int().default(0),
  locked_until: z.number().int().optional(),
});

type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

/**
 * Get tenant ID from user record
 */
export function getTenantId(user: { tenant_id?: string } | null): string {
  if (!user || !user.tenant_id) {
    throw new Error('Unauthenticated: no active session or missing tenant');
  }
  return user.tenant_id;
}

/**
 * Validate session metadata and enforce MFA requirement
 */
export async function validateSession(
  userId: string,
  requireMFA: boolean = true
): Promise<SessionMetadata> {
  const db = getSupabaseAdmin();
  const now = Date.now();

  const { data: meta, error } = await (db as any)
    .from('session_metadata')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !meta) {
    throw new Error('Invalid session: metadata not found');
  }

  const metadata = SessionMetadataSchema.parse(meta);

  // Check lockout
  if (metadata.locked_until && now < metadata.locked_until) {
    const minutesRemaining = Math.ceil((metadata.locked_until - now) / 60000);
    throw new Error(
      `Account locked due to failed login attempts. Try again in ${minutesRemaining} minutes.`
    );
  }

  // Enforce MFA
  if (requireMFA) {
    const mfaMaxAge = 24 * 60 * 60 * 1000;
    if (!metadata.mfa_verified_at || now - metadata.mfa_verified_at > mfaMaxAge) {
      throw new Error('MFA verification expired. Please re-authenticate.');
    }
  }

  return metadata;
}

/**
 * Check if session requires MFA re-verification
 * Sensitive operations require MFA verified within last 15 minutes
 */
export function requireMFARefresh(mfaVerifiedAt: number | null): boolean {
  if (!mfaVerifiedAt) return true;
  const sensitiveMFAWindow = 15 * 60 * 1000;
  return Date.now() - mfaVerifiedAt > sensitiveMFAWindow;
}

/**
 * Get appropriate session timeout
 */
export function getSessionTimeout(sensitive: boolean = false): number {
  return sensitive ? 15 * 60 * 1000 : 30 * 60 * 1000;
}

/**
 * Record failed login attempt and enforce lockout if needed
 */
export async function recordFailedLoginAttempt(
  userId: string,
  currentAttempts: number
): Promise<number> {
  const newAttemptCount = currentAttempts + 1;
  const maxAttempts = 5;
  const db = getSupabaseAdmin();

  if (newAttemptCount >= maxAttempts) {
    const lockoutDuration = 30 * 60 * 1000;
    const lockedUntil = Date.now() + lockoutDuration;

    await (db as any)
      .from('session_metadata')
      .update({ locked_until: lockedUntil, attempt_count: 0 })
      .eq('user_id', userId);

    throw new Error('Account locked due to too many failed login attempts. Try again in 30 minutes.');
  }

  await (db as any)
    .from('session_metadata')
    .update({ attempt_count: newAttemptCount })
    .eq('user_id', userId);

  return newAttemptCount;
}

/**
 * Reset failed login attempts on successful authentication
 */
export async function resetLoginAttempts(userId: string): Promise<void> {
  const db = getSupabaseAdmin();
  await (db as any)
    .from('session_metadata')
    .update({ attempt_count: 0, locked_until: null })
    .eq('user_id', userId);
}

/**
 * Mark MFA as verified in session metadata
 */
export async function markMFAVerified(userId: string): Promise<void> {
  const db = getSupabaseAdmin();
  await (db as any)
    .from('session_metadata')
    .update({ mfa_verified_at: Date.now() })
    .eq('user_id', userId);
}
