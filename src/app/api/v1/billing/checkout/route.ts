import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStripe, getStripePriceIds, type SubscriptionTier } from '@/lib/billing/stripe';


const CheckoutSchema = z.object({
  tier: z.enum(['professional', 'enterprise']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

/**
 * POST /api/v1/billing/checkout
 * Create a Stripe Checkout session for upgrading to a paid tier.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const body = await request.json();
    const parseResult = CheckoutSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    const { tier, successUrl, cancelUrl } = parseResult.data;
    const priceIds = getStripePriceIds();
    const priceId = priceIds[tier as SubscriptionTier];

    if (!priceId) {
      return NextResponse.json(
        { error: 'Configuration Error', message: `Stripe price not configured for ${tier} tier`, errorId: requestId },
        { status: 500 }
      );
    }

    const stripe = getStripe();
    const db = getSupabaseAdmin();

    // Get or create Stripe customer for this tenant
    const { data: tenant } = await (db
      .from('tenants')
      .select('stripe_customer_id, name') as any)
      .eq('id', tenantId)
      .single();

    let customerId = tenant?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { tenantId, userId: user.id },
        name: tenant?.name ?? undefined,
        email: user.email ?? undefined,
      });
      customerId = customer.id;

      await db.from('tenants').update({
        stripe_customer_id: customerId,
      } as any).eq('id', tenantId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { tenantId, tier },
    });

    logger.info('Stripe checkout session created', {
      requestId,
      tenantId,
      tier,
      sessionId: session.id,
    });

    return NextResponse.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in POST /billing/checkout', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
