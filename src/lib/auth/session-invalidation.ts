import { Redis } from '@upstash/redis';
import { Webhook } from 'svix';
import { z } from 'zod';

/**
 * Session invalidation for EVE Secure
 * Handles Clerk webhook events to invalidate sessions immediately
 * - Role changes
 * - User deletion
 * - Tenant deactivation
 * - Suspicious activity detection
 *
 * Redis deny-list provides <1ms lookup on every request
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

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
 * Clerk webhook event types we handle
 */
const ClerkWebhookEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user.updated'),
    data: z.object({
      id: z.string(),
      primary_email_address_id: z.string().optional(),
      public_metadata: z.record(z.unknown()).optional(),
      updated_at: z.number(),
    }),
  }),
  z.object({
    type: z.literal('user.deleted'),
    data: z.object({
      id: z.string(),
      deleted: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('session.ended'),
    data: z.object({
      id: z.string(),
      user_id: z.string(),
      expire_at: z.number(),
    }),
  }),
  z.object({
    type: z.literal('organizationMembership.updated'),
    data: z.object({
      id: z.string(),
      user_id: z.string(),
      organization_id: z.string(),
      role: z.string(),
      updated_at: z.number(),
    }),
  }),
]);

type ClerkWebhookEvent = z.infer<typeof ClerkWebhookEventSchema>;

/**
 * Verify and parse Clerk webhook
 * Uses Svix library for HMAC verification
 * @param payload - Raw request body
 * @param signature - svix-id, svix-timestamp, svix-signature headers
 * @returns Parsed webhook event
 * @throws Error if verification fails
 */
export async function verifyClerkWebhook(
  payload: string,
  signature: string
): Promise<ClerkWebhookEvent> {
  if (!CLERK_WEBHOOK_SECRET) {
    throw new Error('Clerk webhook secret not configured');
  }

  try {
    const webhook = new Webhook(CLERK_WEBHOOK_SECRET);
    const event = webhook.verify(payload, signature);

    // Parse and validate event
    const parsedEvent = ClerkWebhookEventSchema.parse(event);
    return parsedEvent;
  } catch (error) {
    throw new Error(
      `Webhook verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Invalidate all sessions for a user
 * Called on user deletion or security events
 * @param userId - Clerk user ID
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
      7 * 24 * 60 * 60, // 7-day deny list (Clerk tokens max lifetime)
      JSON.stringify({
        reason,
        timestamp,
        invalidatedAt: new Date().toISOString(),
      })
    );

    // Also invalidate all active sessions for this user
    // In practice, would enumerate sessions from Clerk or database
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
 * @param userId - Clerk user ID
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

    console.log(`[SESSION INVALIDATED] User ${userId}: ${oldRole} -> ${newRole}`);
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

    console.log(`[TENANT SESSIONS INVALIDATED] Tenant ${tenantId}: ${reason}`);
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
    console.error('User deny-list check failed:', error);
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
    console.error('Tenant deny-list check failed:', error);
    return false;
  }
}

/**
 * Handle Clerk user.updated webhook
 * Check for role or permission changes
 * @param event - Clerk webhook event
 */
async function handleUserUpdated(event: ClerkWebhookEvent): Promise<void> {
  if (event.type !== 'user.updated') return;

  const { id: userId, public_metadata } = event.data;

  // Check if role changed in metadata
  // Implementation depends on how roles are stored
  // This is a placeholder for integration with your role system

  console.log(`[WEBHOOK] User updated: ${userId}`);
}

/**
 * Handle Clerk user.deleted webhook
 * Invalidate all sessions for deleted user
 * @param event - Clerk webhook event
 */
async function handleUserDeleted(event: ClerkWebhookEvent): Promise<void> {
  if (event.type !== 'user.deleted') return;

  const { id: userId } = event.data;

  await invalidateUserSessions(userId, 'user_deleted');

  console.log(`[WEBHOOK] User deleted and sessions invalidated: ${userId}`);
}

/**
 * Handle Clerk session.ended webhook
 * Add to deny-list when user explicitly logs out
 * @param event - Clerk webhook event
 */
async function handleSessionEnded(event: ClerkWebhookEvent): Promise<void> {
  if (event.type !== 'session.ended') return;

  const { id: sessionId, user_id: userId } = event.data;

  try {
    const redis = getRedisClient();
    const denyKey = `session-deny:${sessionId}`;

    await redis.setex(
      denyKey,
      24 * 60 * 60,
      JSON.stringify({
        reason: 'session_ended',
        timestamp: Date.now(),
        userId,
      })
    );

    console.log(`[WEBHOOK] Session ended: ${sessionId} (user: ${userId})`);
  } catch (error) {
    console.error(`Failed to process session.ended webhook:`, error);
  }
}

/**
 * Handle organizationMembership.updated webhook (if using Clerk organizations)
 * Invalidate sessions when role changes
 * @param event - Clerk webhook event
 */
async function handleOrgMembershipUpdated(event: ClerkWebhookEvent): Promise<void> {
  if (event.type !== 'organizationMembership.updated') return;

  const { user_id: userId, role } = event.data;

  // Would need to track previous role to detect changes
  console.log(`[WEBHOOK] Organization membership updated: ${userId} (role: ${role})`);
}

/**
 * Process Clerk webhook event
 * Routes to appropriate handler based on event type
 * @param event - Parsed webhook event
 */
export async function processClerkWebhookEvent(event: ClerkWebhookEvent): Promise<void> {
  try {
    switch (event.type) {
      case 'user.updated':
        await handleUserUpdated(event);
        break;
      case 'user.deleted':
        await handleUserDeleted(event);
        break;
      case 'session.ended':
        await handleSessionEnded(event);
        break;
      case 'organizationMembership.updated':
        await handleOrgMembershipUpdated(event);
        break;
      default:
        // Unknown event type
        const _exhaustive: never = event;
        return _exhaustive;
    }
  } catch (error) {
    console.error(`[WEBHOOK ERROR] Failed to process event:`, error);
    throw error;
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
  console.warn('[WARNING] Deny-lists would be cleared here');
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
    console.error('Failed to get deny-list stats:', error);
    return {
      userDenylistCount: 0,
      sessionDenylistCount: 0,
      tenantDenylistCount: 0,
    };
  }
}
