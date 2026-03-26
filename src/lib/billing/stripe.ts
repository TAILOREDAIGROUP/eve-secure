import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Subscription tiers for EVE Secure
 */
export type SubscriptionTier = 'free' | 'professional' | 'enterprise';

/**
 * Tier limits
 */
export const TIER_LIMITS: Record<SubscriptionTier, {
  maxAssessments: number;
  reportsEnabled: boolean;
  coiBriefsEnabled: boolean;
  maxUsers: number;
  supportLevel: string;
}> = {
  free: {
    maxAssessments: 1,
    reportsEnabled: false,
    coiBriefsEnabled: false,
    maxUsers: 2,
    supportLevel: 'community',
  },
  professional: {
    maxAssessments: -1, // unlimited
    reportsEnabled: true,
    coiBriefsEnabled: true,
    maxUsers: 25,
    supportLevel: 'email',
  },
  enterprise: {
    maxAssessments: -1,
    reportsEnabled: true,
    coiBriefsEnabled: true,
    maxUsers: -1, // unlimited
    supportLevel: 'dedicated',
  },
};

/**
 * Stripe price IDs (set via environment variables)
 */
export function getStripePriceIds(): Record<SubscriptionTier, string | null> {
  return {
    free: null, // No Stripe price for free tier
    professional: process.env.STRIPE_PRICE_PROFESSIONAL ?? null,
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE ?? null,
  };
}

/**
 * Get Stripe client (singleton)
 */
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    stripeClient = new Stripe(key, { apiVersion: '2025-03-31.basil' as any });
  }
  return stripeClient;
}

/**
 * Get the current subscription tier for a tenant.
 * Checks the tenants table for stripe_subscription_id and status.
 * Returns 'free' if no active subscription.
 */
export async function getTenantTier(tenantId: string): Promise<{
  tier: SubscriptionTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
}> {
  const db = getSupabaseAdmin();

  const { data: tenant, error } = await (db
    .from('tenants')
    .select('stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_period_end') as any)
    .eq('id', tenantId)
    .single();

  if (error || !tenant) {
    logger.warn('Tenant not found for billing lookup', { tenantId });
    return { tier: 'free', stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null };
  }

  // If subscription period has ended, treat as free
  if (tenant.subscription_period_end) {
    const periodEnd = new Date(tenant.subscription_period_end);
    if (periodEnd < new Date()) {
      return {
        tier: 'free',
        stripeCustomerId: tenant.stripe_customer_id ?? null,
        stripeSubscriptionId: null,
        currentPeriodEnd: null,
      };
    }
  }

  const tier = (tenant.subscription_tier as SubscriptionTier) ?? 'free';

  return {
    tier,
    stripeCustomerId: tenant.stripe_customer_id ?? null,
    stripeSubscriptionId: tenant.stripe_subscription_id ?? null,
    currentPeriodEnd: tenant.subscription_period_end ?? null,
  };
}

/**
 * Check if a tenant can perform an action based on their tier.
 */
export async function checkTierAccess(
  tenantId: string,
  action: 'create_assessment' | 'generate_report' | 'generate_coi_brief'
): Promise<{ allowed: boolean; reason?: string; tier: SubscriptionTier }> {
  const { tier } = await getTenantTier(tenantId);
  const limits = TIER_LIMITS[tier];

  switch (action) {
    case 'create_assessment': {
      if (limits.maxAssessments === -1) {
        return { allowed: true, tier };
      }
      // Count existing assessments
      const db = getSupabaseAdmin();
      const { count } = await db
        .from('assessment_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      const used = count ?? 0;
      if (used >= limits.maxAssessments) {
        return {
          allowed: false,
          reason: `Free tier limited to ${limits.maxAssessments} assessment. Upgrade to Professional for unlimited assessments.`,
          tier,
        };
      }
      return { allowed: true, tier };
    }

    case 'generate_report':
      if (!limits.reportsEnabled) {
        return {
          allowed: false,
          reason: 'Assessment reports require a Professional or Enterprise subscription.',
          tier,
        };
      }
      return { allowed: true, tier };

    case 'generate_coi_brief':
      if (!limits.coiBriefsEnabled) {
        return {
          allowed: false,
          reason: 'Cost of Inaction briefs require a Professional or Enterprise subscription.',
          tier,
        };
      }
      return { allowed: true, tier };

    default:
      return { allowed: true, tier };
  }
}

/**
 * Update tenant subscription data from Stripe webhook event.
 */
export async function updateTenantSubscription(args: {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: SubscriptionTier;
  status: string;
  currentPeriodEnd: Date;
}): Promise<void> {
  const { stripeCustomerId, stripeSubscriptionId, tier, status, currentPeriodEnd } = args;
  const db = getSupabaseAdmin();

  // Find tenant by stripe_customer_id
  const { data: tenant, error: findError } = await db
    .from('tenants')
    .select('id')
    .eq('stripe_customer_id', stripeCustomerId)
    .single();

  if (findError || !tenant) {
    logger.error('Tenant not found for Stripe customer', { stripeCustomerId });
    return;
  }

  const updateData: Record<string, unknown> = {
    stripe_subscription_id: stripeSubscriptionId,
    subscription_tier: status === 'active' ? tier : 'free',
    subscription_period_end: currentPeriodEnd.toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await db
    .from('tenants')
    .update(updateData as any)
    .eq('id', tenant.id);

  if (updateError) {
    logger.error('Failed to update tenant subscription', {
      tenantId: tenant.id,
      error: updateError.message,
    });
    return;
  }

  logger.info('Tenant subscription updated', {
    tenantId: tenant.id,
    tier: updateData.subscription_tier,
    status,
    periodEnd: currentPeriodEnd.toISOString(),
  });
}
