import { Redis } from '@upstash/redis';
import { z } from 'zod';

/**
 * Redis-backed rate limiting for EVE Secure
 * Token bucket algorithm for distributed rate limiting
 * - Per-user AI endpoint limits: 60 queries/hour
 * - Per-IP API limits: 60/min authenticated, 10/min unauthenticated
 * - Sub-millisecond Redis lookups
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
 * Rate limit configuration
 */
export const RATE_LIMITS = {
  // AI/query endpoints - per-user per hour
  AI_QUERIES_PER_HOUR: 60,
  AI_QUERY_WINDOW_SECONDS: 60 * 60, // 1 hour

  // API endpoints - per-IP per minute
  API_AUTHED_PER_MINUTE: 60,
  API_UNAUTHED_PER_MINUTE: 10,
  API_WINDOW_SECONDS: 60, // 1 minute

  // Assessment submission - per-user per day
  ASSESSMENT_PER_DAY: 5,
  ASSESSMENT_WINDOW_SECONDS: 24 * 60 * 60,

  // Plan generation - per-user per day
  PLAN_GENERATION_PER_DAY: 10,
  PLAN_GENERATION_WINDOW_SECONDS: 24 * 60 * 60,

  // File uploads - per-user per hour
  FILE_UPLOADS_PER_HOUR: 100,
  FILE_UPLOADS_WINDOW_SECONDS: 60 * 60,
};

/**
 * Token bucket state
 */
interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

const TokenBucketSchema = z.object({
  tokens: z.number().min(0),
  lastRefillAt: z.number().int(),
});

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  current: number; // Current count in window
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // Seconds to wait before retry
}

/**
 * Check rate limit using token bucket algorithm
 * @param key - Rate limit key (user ID, IP, etc.)
 * @param capacity - Max tokens in bucket
 * @param refillRate - Tokens per second
 * @param tokensToConsume - Tokens to consume (default: 1)
 * @returns Rate limit check result
 */
export async function checkRateLimit(
  key: string,
  capacity: number,
  refillRate: number,
  tokensToConsume: number = 1
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const rateKey = `ratelimit:${key}`;

  try {
    // Get current bucket state
    const bucketData = await redis.get(rateKey);

    let bucket: TokenBucket;

    if (!bucketData) {
      // New bucket - start with full capacity
      bucket = {
        tokens: capacity,
        lastRefillAt: now,
      };
    } else {
      // Existing bucket - refill based on elapsed time
      bucket = TokenBucketSchema.parse(JSON.parse(bucketData as string));

      // Calculate refill amount
      const elapsedSeconds = (now - bucket.lastRefillAt) / 1000;
      const tokensToAdd = elapsedSeconds * refillRate;

      // Refill tokens (capped at capacity)
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillAt = now;
    }

    // Check if request allowed
    const allowed = bucket.tokens >= tokensToConsume;

    if (allowed) {
      // Consume tokens
      bucket.tokens -= tokensToConsume;
    }

    // Calculate reset time (when bucket will be full)
    const tokensNeeded = Math.max(0, capacity - bucket.tokens);
    const secondsUntilReset = tokensNeeded / refillRate;
    const resetAt = new Date(now + secondsUntilReset * 1000);

    // Persist updated bucket
    const ttl = Math.ceil(secondsUntilReset) + 60; // Add 60 second buffer
    await redis.setex(rateKey, ttl, JSON.stringify(bucket));

    // Calculate current usage in window
    const used = capacity - bucket.tokens;

    return {
      allowed,
      current: Math.round(used),
      limit: capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      resetAt,
      retryAfter: allowed ? undefined : Math.ceil(secondsUntilReset),
    };
  } catch (error) {
    // On Redis error, fail open (allow request)
    console.error('Rate limit check failed:', error);
    return {
      allowed: true,
      current: 0,
      limit: capacity,
      remaining: capacity,
      resetAt: new Date(now + 60000),
    };
  }
}

/**
 * Check AI endpoint rate limit (60 queries/hour per user)
 * @param userId - User ID
 * @returns Rate limit check result
 */
export async function checkAIQueryLimit(userId: string): Promise<RateLimitResult> {
  const key = `ai-query:${userId}`;
  const capacity = RATE_LIMITS.AI_QUERIES_PER_HOUR;
  const refillRate = capacity / RATE_LIMITS.AI_QUERY_WINDOW_SECONDS;

  return checkRateLimit(key, capacity, refillRate);
}

/**
 * Check API endpoint rate limit
 * @param ipAddress - Client IP address
 * @param authenticated - Whether request is authenticated
 * @returns Rate limit check result
 */
export async function checkApiRateLimit(
  ipAddress: string,
  authenticated: boolean
): Promise<RateLimitResult> {
  const capacity = authenticated
    ? RATE_LIMITS.API_AUTHED_PER_MINUTE
    : RATE_LIMITS.API_UNAUTHED_PER_MINUTE;

  const key = authenticated ? `api-authed:${ipAddress}` : `api-unauthed:${ipAddress}`;
  const refillRate = capacity / RATE_LIMITS.API_WINDOW_SECONDS;

  return checkRateLimit(key, capacity, refillRate);
}

/**
 * Check assessment submission rate limit (5 per day per user)
 * @param userId - User ID
 * @returns Rate limit check result
 */
export async function checkAssessmentLimit(userId: string): Promise<RateLimitResult> {
  const key = `assessment:${userId}`;
  const capacity = RATE_LIMITS.ASSESSMENT_PER_DAY;
  const refillRate = capacity / RATE_LIMITS.ASSESSMENT_WINDOW_SECONDS;

  return checkRateLimit(key, capacity, refillRate);
}

/**
 * Check plan generation rate limit (10 per day per user)
 * @param userId - User ID
 * @returns Rate limit check result
 */
export async function checkPlanGenerationLimit(userId: string): Promise<RateLimitResult> {
  const key = `plan-generation:${userId}`;
  const capacity = RATE_LIMITS.PLAN_GENERATION_PER_DAY;
  const refillRate = capacity / RATE_LIMITS.PLAN_GENERATION_WINDOW_SECONDS;

  return checkRateLimit(key, capacity, refillRate);
}

/**
 * Check file upload rate limit (100 per hour per user)
 * @param userId - User ID
 * @returns Rate limit check result
 */
export async function checkFileUploadLimit(userId: string): Promise<RateLimitResult> {
  const key = `file-upload:${userId}`;
  const capacity = RATE_LIMITS.FILE_UPLOADS_PER_HOUR;
  const refillRate = capacity / RATE_LIMITS.FILE_UPLOADS_WINDOW_SECONDS;

  return checkRateLimit(key, capacity, refillRate);
}

/**
 * Consume multiple tokens at once
 * Used for batch operations
 * @param key - Rate limit key
 * @param capacity - Max tokens
 * @param refillRate - Tokens per second
 * @param tokensToConsume - Number of tokens to consume
 * @returns Rate limit check result
 */
export async function consumeTokens(
  key: string,
  capacity: number,
  refillRate: number,
  tokensToConsume: number
): Promise<RateLimitResult> {
  return checkRateLimit(key, capacity, refillRate, tokensToConsume);
}

/**
 * Reset rate limit for a key
 * Used for testing or admin operations
 * @param key - Rate limit key
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const rateKey = `ratelimit:${key}`;
    await redis.del(rateKey);
  } catch (error) {
    console.error('Failed to reset rate limit:', error);
  }
}

/**
 * Get current rate limit status for debugging
 * @param key - Rate limit key
 * @param capacity - Max capacity
 * @param refillRate - Tokens per second
 * @returns Current bucket state
 */
export async function getRateLimitStatus(
  key: string,
  capacity: number,
  refillRate: number
): Promise<{
  tokensRemaining: number;
  capacity: number;
  usage: number;
  resetAt: Date;
}> {
  try {
    const redis = getRedisClient();
    const rateKey = `ratelimit:${key}`;
    const bucketData = await redis.get(rateKey);

    if (!bucketData) {
      return {
        tokensRemaining: capacity,
        capacity,
        usage: 0,
        resetAt: new Date(),
      };
    }

    const bucket = TokenBucketSchema.parse(JSON.parse(bucketData as string));
    const now = Date.now();

    // Recalculate tokens with refill
    const elapsedSeconds = (now - bucket.lastRefillAt) / 1000;
    const tokensToAdd = elapsedSeconds * refillRate;
    const currentTokens = Math.min(capacity, bucket.tokens + tokensToAdd);

    const tokensNeeded = Math.max(0, capacity - currentTokens);
    const secondsUntilReset = tokensNeeded / refillRate;
    const resetAt = new Date(now + secondsUntilReset * 1000);

    return {
      tokensRemaining: Math.floor(currentTokens),
      capacity,
      usage: Math.ceil(capacity - currentTokens),
      resetAt,
    };
  } catch (error) {
    console.error('Failed to get rate limit status:', error);
    return {
      tokensRemaining: capacity,
      capacity,
      usage: 0,
      resetAt: new Date(),
    };
  }
}

/**
 * Create rate limit response headers
 * @param result - Rate limit check result
 * @returns Headers object
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.floor(result.resetAt.getTime() / 1000).toString(),
    ...(result.retryAfter && { 'Retry-After': result.retryAfter.toString() }),
  };
}

/**
 * Check if rate limit exceeded
 * Returns 429 response if limit exceeded
 * @param result - Rate limit check result
 * @returns Response object or null if allowed
 */
export function getRateLimitErrorResponse(result: RateLimitResult): Response | null {
  if (result.allowed) {
    return null;
  }

  const headers = new Headers();
  Object.entries(createRateLimitHeaders(result)).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(
    JSON.stringify({
      error: 'Rate limit exceeded',
      message: `Too many requests. Try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers,
    }
  );
}
