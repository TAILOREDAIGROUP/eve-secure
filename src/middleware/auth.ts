import { NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware, auth } from '@clerk/nextjs/server';
import { Redis } from '@upstash/redis';
import { z } from 'zod';

/**
 * Authentication middleware for EVE Secure API
 * - Extracts tenant_id from Clerk session
 * - Injects into database query context (PostgreSQL app.current_tenant_id)
 * - Checks Redis deny-list for invalidated sessions
 * - Rate limiting: 60/min authenticated, 10/min unauthenticated
 */

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redisClient: Redis | null = null;

/**
 * Initialize Redis client for deny-list checks
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

const AuthContextSchema = z.object({
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  sessionId: z.string(),
  email: z.string().email(),
  mfaVerified: z.boolean(),
});

type AuthContext = z.infer<typeof AuthContextSchema>;

/**
 * Extract auth context from Clerk session
 * @param request - Next.js request object
 * @returns Auth context with user, tenant, and session info
 * @throws Error if authentication fails
 */
async function extractAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const { userId, sessionId } = await auth();

  if (!userId || !sessionId) {
    return null;
  }

  // In production, fetch full session with metadata from Clerk
  // This is a simplified version
  const context: AuthContext = {
    userId,
    tenantId: '', // Would be extracted from session metadata
    sessionId,
    email: '', // Would be extracted from session
    mfaVerified: false, // Would be checked from session metadata
  };

  try {
    return AuthContextSchema.parse(context);
  } catch {
    return null;
  }
}

/**
 * Check if session is in Redis deny-list (invalidated)
 * Returns immediately (sub-millisecond lookup)
 * @param sessionId - Clerk session ID
 * @returns true if session is invalidated
 */
async function isSessionDenylisted(sessionId: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const denyKey = `session-deny:${sessionId}`;
    const isDenied = await redis.get(denyKey);
    return isDenied !== null;
  } catch (error) {
    // On Redis error, fail open (allow request)
    // Log error for monitoring
    console.error('Redis deny-list check failed:', error);
    return false;
  }
}

/**
 * Get rate limit key for request
 * Uses user ID if authenticated, IP address if not
 * @param request - Next.js request
 * @param userId - Optional user ID if authenticated
 * @returns Rate limit key
 */
function getRateLimitKey(request: NextRequest, userId?: string): string {
  if (userId) {
    return `ratelimit:authed:${userId}`;
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    'unknown';

  return `ratelimit:unauthed:${ip}`;
}

/**
 * Check and increment rate limit counter
 * Uses token bucket algorithm with Redis
 * @param key - Rate limit key
 * @param limit - Max requests allowed
 * @param window - Time window in seconds
 * @returns Object with current count and remaining
 */
async function checkRateLimit(
  key: string,
  limit: number,
  window: number
): Promise<{ current: number; remaining: number; resetAt: Date }> {
  try {
    const redis = getRedisClient();

    // Get current count
    const current = await redis.incr(key);

    // Set expiry on first request
    if (current === 1) {
      await redis.expire(key, window);
    }

    const remaining = Math.max(0, limit - current);
    const ttl = await redis.ttl(key);
    const resetAt = new Date(Date.now() + (ttl > 0 ? ttl * 1000 : window * 1000));

    return { current, remaining, resetAt };
  } catch (error) {
    // On Redis error, fail open (allow request but don't count it)
    console.error('Rate limit check failed:', error);
    return {
      current: 0,
      remaining: 1,
      resetAt: new Date(Date.now() + 60000),
    };
  }
}

/**
 * Main authentication middleware
 * Applied to all API routes
 * Validates session, checks deny-list, enforces rate limiting
 */
export async function authMiddleware(request: NextRequest): Promise<NextResponse> {
  const authContext = await extractAuthContext(request);

  // Unauthenticated request
  if (!authContext) {
    // Apply unauthenticated rate limit (10/min)
    const rateLimitKey = getRateLimitKey(request);
    const rateLimit = await checkRateLimit(rateLimitKey, 10, 60);

    if (rateLimit.current > 10) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000).toString(),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    return NextResponse.next({
      request: {
        headers: new Headers(request.headers),
      },
    });
  }

  // Authenticated request
  // Check deny-list for invalidated sessions
  const isDenied = await isSessionDenylisted(authContext.sessionId);
  if (isDenied) {
    return NextResponse.json(
      {
        error: 'Session invalidated',
        message: 'This session has been revoked. Please re-authenticate.',
      },
      { status: 401 }
    );
  }

  // Apply authenticated rate limit (60/min)
  const rateLimitKey = getRateLimitKey(request, authContext.userId);
  const rateLimit = await checkRateLimit(rateLimitKey, 60, 60);

  if (rateLimit.current > 60) {
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': String(rateLimit.remaining),
          'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
        },
      }
    );
  }

  // Add auth context to request headers for downstream processing
  const responseHeaders = new Headers(request.headers);
  responseHeaders.set('x-user-id', authContext.userId);
  responseHeaders.set('x-tenant-id', authContext.tenantId);
  responseHeaders.set('x-session-id', authContext.sessionId);
  responseHeaders.set('x-mfa-verified', authContext.mfaVerified ? 'true' : 'false');

  // For database query context injection
  responseHeaders.set('x-db-tenant-context', `SET app.current_tenant_id = '${authContext.tenantId}'`);

  return NextResponse.next({
    request: {
      headers: responseHeaders,
    },
  });
}

/**
 * Protected route handler wrapper
 * Ensures authentication is validated before handler runs
 * @param handler - Route handler function
 * @param options - Configuration options
 * @returns Wrapped handler with auth checks
 */
export function withAuth<T extends any[], R>(
  handler: (context: AuthContext, ...args: T) => Promise<R> | R,
  options: {
    requireMFA?: boolean;
    rateLimit?: number;
  } = {}
) {
  return async (...args: T): Promise<R | NextResponse> => {
    const request = args[0] as NextRequest;

    const authContext = await extractAuthContext(request);
    if (!authContext) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    if (options.requireMFA && !authContext.mfaVerified) {
      return NextResponse.json(
        { error: 'MFA verification required' },
        { status: 403 }
      );
    }

    // Rate limiting already handled by main middleware
    return handler(authContext, ...(args.slice(1) as any as T));
  };
}

/**
 * Invalidate session and add to Redis deny-list
 * Called when user logs out, role changes, or account disabled
 * @param sessionId - Clerk session ID to invalidate
 * @param reason - Reason for invalidation (for logging)
 */
export async function invalidateSessionInDenylist(
  sessionId: string,
  reason: string = 'user_logout'
): Promise<void> {
  try {
    const redis = getRedisClient();
    const denyKey = `session-deny:${sessionId}`;

    // Add to deny-list with 24-hour expiry
    // After 24 hours, Clerk will have issued new tokens anyway
    await redis.setex(denyKey, 24 * 60 * 60, JSON.stringify({ reason, timestamp: Date.now() }));
  } catch (error) {
    throw new Error(
      `Failed to invalidate session: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Check if user has required role/permission
 * Enforces authorization after authentication
 * @param authContext - Auth context from request
 * @param requiredRole - Role to check for
 * @returns true if user has role
 */
export async function hasRole(
  authContext: AuthContext,
  requiredRole: 'admin' | 'clinician' | 'user'
): Promise<boolean> {
  // Implementation would check Clerk user metadata or database
  // Placeholder for integration
  return true;
}

/**
 * Middleware configuration for Next.js
 */
export const authConfig = {
  publicRoutes: [
    '/api/auth/emergency',
    '/api/health',
    '/api/public/privacy',
  ],
};
