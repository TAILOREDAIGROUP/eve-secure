import { logger } from "@/lib/logger";

/**
 * Global rate limiting for EVE Secure
 * - Production: Cloudflare Workers KV (via binding)
 * - Development: In-memory Map fallback
 *
 * Three tiers:
 *   Per-IP:     100 requests/minute
 *   Per-user:    60 requests/minute
 *   Per-tenant: 200 requests/minute
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds
}

interface BucketEntry {
  count: number;
  windowStart: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Tier configuration
// ---------------------------------------------------------------------------

export type RateLimitTier = "ip" | "user" | "tenant";

const TIER_CONFIG: Record<RateLimitTier, { limit: number; windowMs: number }> = {
  ip:     { limit: 100, windowMs: 60_000 },
  user:   { limit:  60, windowMs: 60_000 },
  tenant: { limit: 200, windowMs: 60_000 },
};

// ---------------------------------------------------------------------------
// KV adapter interface (Cloudflare Workers KV or in-memory)
// ---------------------------------------------------------------------------

interface KVAdapter {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory fallback (local dev / tests)
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, { value: string; expiresAt: number }>();

const inMemoryKV: KVAdapter = {
  async get(key: string) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },
  async put(key: string, value: string, options?: { expirationTtl?: number }) {
    const ttl = options?.expirationTtl ?? 120;
    memoryStore.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
  },
};

// ---------------------------------------------------------------------------
// KV resolution
// ---------------------------------------------------------------------------

/**
 * Resolve KV binding. In Cloudflare Workers the binding is available on the
 * global `EVE_RATE_LIMIT` namespace. Falls back to in-memory for local dev.
 */
function getKV(): KVAdapter {
  // Cloudflare Workers KV binding (set in wrangler.toml / Pages env)
  const cfKV = (globalThis as any).EVE_RATE_LIMIT as KVAdapter | undefined;
  if (cfKV && typeof cfKV.get === "function") {
    return cfKV;
  }
  return inMemoryKV;
}

// ---------------------------------------------------------------------------
// Core: sliding-window counter
// ---------------------------------------------------------------------------

async function slidingWindowCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const kv = getKV();
  const now = Date.now();
  const fullKey = `rl:${key}`;

  try {
    const raw = await kv.get(fullKey);
    let bucket: BucketEntry = raw ? JSON.parse(raw) : { count: 0, windowStart: now };

    // Reset window if expired
    if (now - bucket.windowStart >= windowMs) {
      bucket = { count: 0, windowStart: now };
    }

    bucket.count += 1;
    const allowed = bucket.count <= limit;

    // Persist (TTL = remaining window + 10 s buffer)
    const remainingWindowSec = Math.ceil((windowMs - (now - bucket.windowStart)) / 1000) + 10;
    await kv.put(fullKey, JSON.stringify(bucket), { expirationTtl: remainingWindowSec });

    const resetAt = new Date(bucket.windowStart + windowMs);
    const retryAfterSec = Math.ceil((bucket.windowStart + windowMs - now) / 1000);

    if (!allowed) {
      logger.warn("Rate limit exceeded", { key, tier: key.split(":")[0], count: bucket.count, limit });
    }

    return {
      allowed,
      current: bucket.count,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt,
      retryAfter: allowed ? undefined : retryAfterSec,
    };
  } catch (error) {
    // FAIL CLOSED — if KV is unavailable, deny the request
    logger.error("Rate limit KV error — failing closed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: false,
      current: 0,
      limit,
      remaining: 0,
      resetAt: new Date(now + windowMs),
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }
}

// ---------------------------------------------------------------------------
// Public API — tier-based helpers
// ---------------------------------------------------------------------------

export async function checkIPRateLimit(ip: string): Promise<RateLimitResult> {
  const { limit, windowMs } = TIER_CONFIG.ip;
  return slidingWindowCheck(`ip:${ip}`, limit, windowMs);
}

export async function checkUserRateLimit(userId: string): Promise<RateLimitResult> {
  const { limit, windowMs } = TIER_CONFIG.user;
  return slidingWindowCheck(`user:${userId}`, limit, windowMs);
}

export async function checkTenantRateLimit(tenantId: string): Promise<RateLimitResult> {
  const { limit, windowMs } = TIER_CONFIG.tenant;
  return slidingWindowCheck(`tenant:${tenantId}`, limit, windowMs);
}

/**
 * Generic check — caller picks the tier.
 */
export async function checkRateLimit(
  tier: RateLimitTier,
  identifier: string,
): Promise<RateLimitResult> {
  const { limit, windowMs } = TIER_CONFIG[tier];
  return slidingWindowCheck(`${tier}:${identifier}`, limit, windowMs);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.floor(result.resetAt.getTime() / 1000).toString(),
    ...(result.retryAfter != null && { "Retry-After": result.retryAfter.toString() }),
  };
}

export function getRateLimitErrorResponse(result: RateLimitResult): Response | null {
  if (result.allowed) return null;

  const headers = new Headers();
  for (const [k, v] of Object.entries(createRateLimitHeaders(result))) {
    headers.set(k, v);
  }

  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: `Too many requests. Try again in ${result.retryAfter} seconds.`,
      retryAfter: result.retryAfter,
    }),
    { status: 429, headers },
  );
}

// ---------------------------------------------------------------------------
// Testing helpers
// ---------------------------------------------------------------------------

/** Clear the in-memory store (tests only). */
export function _resetMemoryStore(): void {
  memoryStore.clear();
}
