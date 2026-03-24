import { clerkClient } from '@clerk/nextjs/server';
import type { Session } from '@clerk/nextjs/server';
import { z } from 'zod';

/**
 * Clerk integration for EVE Secure with HIPAA compliance
 * - Mandatory MFA enforcement
 * - Differentiated session timeouts (30 min normal, 15 min sensitive)
 * - Automatic lockout after 5 failed attempts (30 min)
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
 * Get tenant ID from authenticated session
 * @param session - Clerk session object
 * @returns Tenant ID as UUID
 * @throws Error if session invalid or no tenant_id
 */
export function getTenantId(session: Session | null): string {
  if (!session) {
    throw new Error('Unauthenticated: no active session');
  }

  try {
    const metadata = SessionMetadataSchema.parse(session.publicMetadata);
    return metadata.tenant_id;
  } catch (error) {
    throw new Error(
      `Invalid session metadata: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validate session and enforce MFA requirement
 * @param session - Clerk session to validate
 * @param requireMFA - Whether MFA verification is mandatory (default: true)
 * @returns Validated session metadata
 * @throws Error if session invalid, MFA not verified, or user locked out
 */
export function validateSession(
  session: Session | null,
  requireMFA: boolean = true
): SessionMetadata {
  if (!session || !session.userId) {
    throw new Error('Invalid session: missing session or user ID');
  }

  const now = Date.now();

  try {
    const metadata = SessionMetadataSchema.parse(session.publicMetadata);

    // Check if user is locked out
    if (metadata.locked_until && now < metadata.locked_until) {
      const minutesRemaining = Math.ceil((metadata.locked_until - now) / 60000);
      throw new Error(
        `Account locked due to failed login attempts. Try again in ${minutesRemaining} minutes.`
      );
    }

    // Enforce MFA verification
    if (requireMFA) {
      if (!session.user?.primaryEmailAddress?.verification?.status ||
          session.user.primaryEmailAddress.verification.status !== 'verified') {
        throw new Error('Email verification required for MFA');
      }

      // Check if MFA was verified in the last 24 hours
      const mfaMaxAge = 24 * 60 * 60 * 1000; // 24 hours in ms
      if (!metadata.mfa_verified_at || now - metadata.mfa_verified_at > mfaMaxAge) {
        throw new Error('MFA verification expired. Please re-authenticate.');
      }
    }

    return metadata;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Session validation failed: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
}

/**
 * Check if session requires MFA re-verification
 * Sensitive operations require MFA verified within last 15 minutes
 * @param session - Clerk session
 * @returns true if MFA re-verification needed
 */
export function requireMFARefresh(session: Session | null): boolean {
  if (!session) return true;

  try {
    const metadata = SessionMetadataSchema.parse(session.publicMetadata);
    const now = Date.now();
    const sensitiveMFAWindow = 15 * 60 * 1000; // 15 minutes in ms

    return !metadata.mfa_verified_at || now - metadata.mfa_verified_at > sensitiveMFAWindow;
  } catch {
    return true;
  }
}

/**
 * Get appropriate session timeout based on operation sensitivity
 * @param sensitive - Whether operation requires sensitive timeout (15 min vs 30 min)
 * @returns Timeout in milliseconds
 */
export function getSessionTimeout(sensitive: boolean = false): number {
  return sensitive ? 15 * 60 * 1000 : 30 * 60 * 1000;
}

/**
 * Record failed login attempt and enforce lockout if needed
 * @param userId - Clerk user ID
 * @param currentAttempts - Current attempt count
 * @returns Updated attempt count; throws error if lockout triggered
 */
export async function recordFailedLoginAttempt(
  userId: string,
  currentAttempts: number
): Promise<number> {
  const newAttemptCount = currentAttempts + 1;
  const maxAttempts = 5;

  if (newAttemptCount >= maxAttempts) {
    // Trigger 30-minute lockout
    const lockoutDuration = 30 * 60 * 1000;
    const lockedUntil = Date.now() + lockoutDuration;

    try {
      await clerkClient.users.updateUser(userId, {
        publicMetadata: {
          locked_until: lockedUntil,
          attempt_count: 0,
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to update user lockout status: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }

    throw new Error('Account locked due to too many failed login attempts. Try again in 30 minutes.');
  }

  // Update attempt count
  try {
    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        attempt_count: newAttemptCount,
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to update login attempts: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }

  return newAttemptCount;
}

/**
 * Reset failed login attempts on successful authentication
 * @param userId - Clerk user ID
 */
export async function resetLoginAttempts(userId: string): Promise<void> {
  try {
    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        attempt_count: 0,
        locked_until: undefined,
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to reset login attempts: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Mark MFA as verified in session metadata
 * Called after successful MFA challenge
 * @param userId - Clerk user ID
 */
export async function markMFAVerified(userId: string): Promise<void> {
  try {
    await clerkClient.users.updateUser(userId, {
      publicMetadata: {
        mfa_verified_at: Date.now(),
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to mark MFA verified: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validate Clerk JWT token
 * Used for API routes that need manual JWT validation
 * @param token - JWT token from Authorization header
 * @returns Decoded session data
 * @throws Error if token invalid or expired
 */
export async function verifyClerkToken(token: string): Promise<SessionMetadata> {
  try {
    const decoded = await clerkClient.verifyToken(token);
    if (!decoded.sub) {
      throw new Error('Invalid token: missing user ID');
    }

    // In practice, fetch full session from Clerk API
    // This is a simplified validation
    return {
      tenant_id: (decoded as Record<string, unknown>).tenant_id as string || '',
      mfa_verified_at: (decoded as Record<string, unknown>).mfa_verified_at as number || 0,
      attempt_count: 0,
    };
  } catch (error) {
    throw new Error(
      `Token verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
