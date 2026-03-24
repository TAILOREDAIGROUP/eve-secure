import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

/**
 * Session invalidation for EVE Secure
 * Handles Supabase Auth events to invalidate sessions immediately
 * - Role changes
 * - User deletion
 * - Tenant deactivation
 * - Suspicious activity detection
 *
 * Redis deny-list provides <1ms lookup on every request
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
let redisClient: Redis | null = null;

/**
 * Initialize Redis client
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    if (!REDIS_URL || !REDIS_TOKEN) {
      throw new Error('Redis configuration missing');
    }
    redisClient = new Redis({
      url: REDIS_URL,
      token: REDIS_TOKEN,
    });
  }
  return redisClient;
}

/**
 * Invalidate all sessions for a user
 * Called on user deletion or security events
 * @param userId - User ID
 * @param reason - Reason for invalidation
 * @returns Count of sessions invalidated
 */
export async function invalidateUserSessions(
  userId: string,
  reason: string = 'user_request'
): Promise<number> {
  try {
    const redis = getRedisClient();

    // Add user to deny-list
    // All requests with this user ID will be rejected
    const denyKey = `user-deny:${userId}`;
    const timestamp = Date.now();

    await redis.setex(
      denyKey,
      7 * 24 * 60 * 60, // 7-day deny list (Supabase Auth token max lifetime)
      JSON.stringify({
        reason,
        timestamp,
        invalidatedAt: new Date().toISOString(),
      })
    );

    // Also invalidate all active sessions for this user
    // In practice, would enumerate sessions from database
    return 1;
  } catch (error) {
    throw new Error(
      `Failed to invalidate user sessions: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Invalidate session after role change
 * Called when user's role is updated (e.g., admin revoked)
 * @param userId - User ID
 * @param sessionId - Session ID to invalidate
 * @param oldRole - Previous role
 * @param newRole - New role
 */
export async function invalidateSessionAfterRoleChange(
  userId: string,
  sessionId: string,
  oldRole: string,
  newRole: string
): Promise<void> {
  try {
    const redis = getRedisClient();

    // Add session to deny-list
    const denyKey = `session-deny:${sessionId}`;
    await redis.setex(
      denyKey,
      24 * 60 * 60,
      JSON.stringify({
        reason: `role_change_${oldRole}_to_${newRole}`,
        timestamp: Date.now(),
        userId,
      })
    );

    logger.info('Session invalidated after role change', { userId, oldRole, newRole });
  } catch (error) {
    throw new Error(
      `Failed to invalidate session on role change: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Invalidate tenant-wide sessions
 * Called when tenant is deactivated, suspended, or deleted
 * @param tenantId - Tenant ID to invalidate
 * @param reason - Reason for invalidation
 */
export async function invalidateTenantSessions(
  tenantId: string,
  reason: string = 'tenant_deactivated'
): Promise<void> {
  try {
    const redis = getRedisClient();

    // Add tenant to deny-list
    const denyKey = `tenant-deny:${tenantId}`;
    await redis.setex(
      denyKey,
      30 * 24 * 60 * 60, // 30-day deny list
      JSON.stringify({
        reason,
        timestamp: Date.now(),
        invalidatedAt: new Date().toISOString(),
      })
    );

    logger.info('Tenant sessions invalidated', { tenantId, reason });
  } catch (error) {
    throw new Error(
      `Failed to invalidate tenant sessions: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Check if user is in deny-list
 * Ultra-fast check used in request middleware
 * @param userId - User ID to check
 * @returns true if user is denied
 */
export async function isUserDenylisted(userId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const denyKey = `user-deny:${userId}`;
    const isDenied = await redis.get(denyKey);
    return isDenied !== null;
  } catch (error) {
    // On Redis error, fail open to avoid DoS
    logger.error('User deny-list check failed', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Check if tenant is in deny-list
 * @param tenantId - Tenant ID to check
 * @returns true if tenant is denied
 */
export async function isTenantDenylisted(tenantId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const denyKey = `tenant-deny:${tenantId}`;
    const isDenied = await redis.get(denyKey);
    return isDenied !== null;
  } catch (error) {
    logger.error('Tenant deny-list check failed', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Clear all deny-lists (for testing only)
 * NEVER use in production
 */
export async function clearAllDenylists(): Promise<void> {
  const redis = getRedisClient();

  // This would scan and delete all deny-list keys
  // Using SCAN pattern to avoid blocking
  const pattern = '*-deny:*';

  // Implementation placeholder
  logger.warn('Deny-lists would be cleared here');
}

/**
 * Get deny-list statistics
 * Used for monitoring and debugging
 */
export async function getDenylistStats(): Promise<{
  userDenylistCount: number;
  sessionDenylistCount: number;
  tenantDenylistCount: number;
}> {
  try {
    const redis = getRedisClient();

    // Count entries (implementation would use SCAN)
    return {
      userDenylistCount: 0,
      sessionDenylistCount: 0,
      tenantDenylistCount: 0,
    };
  } catch (error) {
    logger.error('Failed to get deny-list stats', { error: error instanceof Error ? error.message : String(error) });
    return {
      userDenylistCount: 0,
      sessionDenylistCount: 0,
      tenantDenylistCount: 0,
    };
  }
}
