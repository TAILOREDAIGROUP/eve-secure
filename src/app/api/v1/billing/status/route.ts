import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';
import { getTenantTier, TIER_LIMITS } from '@/lib/billing/stripe';


/**
 * GET /api/v1/billing/status
 * Return current subscription tier, limits, and usage for the authenticated tenant.
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const tierInfo = await getTenantTier(tenantId);
    const limits = TIER_LIMITS[tierInfo.tier];

    logger.info('Billing status checked', {
      requestId,
      tenantId,
      tier: tierInfo.tier,
    });

    return NextResponse.json({
      tier: tierInfo.tier,
      limits,
      subscription: {
        stripeCustomerId: tierInfo.stripeCustomerId,
        stripeSubscriptionId: tierInfo.stripeSubscriptionId,
        currentPeriodEnd: tierInfo.currentPeriodEnd,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /billing/status', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
