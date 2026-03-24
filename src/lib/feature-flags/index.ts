import { Redis } from '@upstash/redis';
import { logger } from '../logging/logger';

/**
 * Feature flag metadata
 */
export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  rolloutPercentage?: number; // 0-100 for gradual rollout
  targetedTenants?: string[]; // Specific tenants to enable for
  targetedUsers?: string[]; // Specific users to enable for
}

/**
 * Redis cache for feature flags (2 minute TTL)
 */
const CACHE_TTL = 120;
const CACHE_KEY_PREFIX = 'feature-flags:';

/**
 * Initialize Redis client
 */
function getRedisClient(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  });
}

/**
 * Hash a value for consistent bucketing in rollout percentages
 */
function hashForBucketing(value: string, max: number = 100): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % max;
}

/**
 * Check if feature is enabled for a specific context
 *
 * Evaluation order:
 * 1. Check targeted users list
 * 2. Check targeted tenants list
 * 3. Check rollout percentage (consistent hashing)
 * 4. Check feature enabled status
 */
export async function isFeatureEnabled(
  flagId: string,
  options?: {
    userId?: string;
    tenantId?: string;
  }
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const cacheKey = `${CACHE_KEY_PREFIX}${flagId}`;

    // Try to get from cache
    let flagData = await redis.get(cacheKey);
    let flag: FeatureFlag | null = null;

    if (flagData) {
      flag = typeof flagData === 'string' ? JSON.parse(flagData) : flagData as FeatureFlag;
    } else {
      // Query from database if not in cache
      flag = await getFeatureFlagFromDB(flagId);

      if (flag) {
        // Cache the result
        await redis.set(cacheKey, JSON.stringify(flag), { ex: CACHE_TTL });
      }
    }

    // upstash/redis is stateless, no disconnect needed

    if (!flag) {
      logger.warn('Feature flag not found', { flagId });
      return false;
    }

    // Check targeted users
    if (options?.userId && flag.targetedUsers?.includes(options.userId)) {
      return flag.enabled;
    }

    // Check targeted tenants
    if (options?.tenantId && flag.targetedTenants?.includes(options.tenantId)) {
      return flag.enabled;
    }

    // Check rollout percentage (consistent hashing)
    if (flag.rolloutPercentage !== undefined) {
      if (!flag.enabled) return false;

      const bucketing =
        options?.userId ||
        options?.tenantId ||
        'anonymous';
      const bucket = hashForBucketing(bucketing, 100);
      const enabled = bucket < flag.rolloutPercentage;

      logger.debug('Feature flag rollout check', {
        flagId,
        bucketing,
        bucket,
        rolloutPercentage: flag.rolloutPercentage,
        enabled,
      });

      return enabled;
    }

    // Return global enabled status
    return flag.enabled;
  } catch (error) {
    logger.error('Error checking feature flag', {
      flagId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Fail closed (return false) on errors
    return false;
  }
}

/**
 * Get all feature flags for caching/admin views
 */
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  try {
    const redis = getRedisClient();
    const cacheKey = 'feature-flags:all';

    // Try cache first
    let cached = await redis.get(cacheKey);
    if (cached) {
      const flags = typeof cached === 'string' ? JSON.parse(cached) : cached;
      // upstash/redis is stateless, no disconnect needed
      return flags;
    }

    // Fetch from database
    const flags = await getAllFeatureFlagsFromDB();

    // Cache the result
    await redis.set(cacheKey, JSON.stringify(flags), { ex: CACHE_TTL });
    // upstash/redis is stateless, no disconnect needed

    return flags;
  } catch (error) {
    logger.error('Error fetching feature flags', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Set feature flag status
 */
export async function setFeatureFlag(
  flagId: string,
  enabled: boolean,
  options?: {
    rolloutPercentage?: number;
    targetedTenants?: string[];
    targetedUsers?: string[];
  }
): Promise<boolean> {
  try {
    // Validate inputs
    if (options?.rolloutPercentage !== undefined) {
      if (options.rolloutPercentage < 0 || options.rolloutPercentage > 100) {
        logger.warn('Invalid rollout percentage', {
          flagId,
          rolloutPercentage: options.rolloutPercentage,
        });
        return false;
      }
    }

    // Update database
    const success = await updateFeatureFlagInDB(flagId, {
      enabled,
      rolloutPercentage: options?.rolloutPercentage,
      targetedTenants: options?.targetedTenants,
      targetedUsers: options?.targetedUsers,
    });

    if (success) {
      // Invalidate cache
      const redis = getRedisClient();
      await redis.del(`${CACHE_KEY_PREFIX}${flagId}`);
      await redis.del('feature-flags:all');
      // upstash/redis is stateless, no disconnect needed

      logger.info('Feature flag updated', {
        flagId,
        enabled,
        options,
      });
    }

    return success;
  } catch (error) {
    logger.error('Error setting feature flag', {
      flagId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Clear feature flag cache
 */
export async function clearFeatureFlagCache(): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${CACHE_KEY_PREFIX}*`);

    if (keys.length > 0) {
      await redis.del(...keys);
      logger.info('Feature flag cache cleared', { keysCleared: keys.length });
    }

    // upstash/redis is stateless, no disconnect needed
  } catch (error) {
    logger.error('Error clearing feature flag cache', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Helper: Get feature flag from database
 * TODO: Implement actual database query
 */
async function getFeatureFlagFromDB(flagId: string): Promise<FeatureFlag | null> {
  // TODO: Query from database
  // const result = await db.query(
  //   'SELECT * FROM feature_flags WHERE id = ? AND deleted_at IS NULL',
  //   [flagId]
  // );
  // return result[0] || null;
  return null;
}

/**
 * Helper: Get all feature flags from database
 * TODO: Implement actual database query
 */
async function getAllFeatureFlagsFromDB(): Promise<FeatureFlag[]> {
  // TODO: Query from database
  // const results = await db.query(
  //   'SELECT * FROM feature_flags WHERE deleted_at IS NULL ORDER BY created_at DESC'
  // );
  // return results;
  return [];
}

/**
 * Helper: Update feature flag in database
 * TODO: Implement actual database update
 */
async function updateFeatureFlagInDB(
  flagId: string,
  updates: Partial<FeatureFlag>
): Promise<boolean> {
  // TODO: Update database
  // await db.query(
  //   'UPDATE feature_flags SET enabled = ?, rollout_percentage = ?, targeted_tenants = ?, targeted_users = ?, updated_at = NOW() WHERE id = ?',
  //   [updates.enabled, updates.rolloutPercentage, JSON.stringify(updates.targetedTenants), JSON.stringify(updates.targetedUsers), flagId]
  // );
  // return true;
  return false;
}

/**
 * Express middleware to attach feature flag checker to request
 */
export function featureFlagsMiddleware(req: any, res: any, next: Function) {
  req.features = {
    isEnabled: (flagId: string) =>
      isFeatureEnabled(flagId, {
        userId: req.userId,
        tenantId: req.tenantId,
      }),
  };
  next();
}
