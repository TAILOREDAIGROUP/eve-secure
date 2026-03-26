import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/billing/stripe';


/**
 * POST /api/v1/billing/portal
 * Create a Stripe Customer Portal session for managing subscription.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();
    const db = getSupabaseAdmin();

    const { data: tenant } = await (db
      .from('tenants')
      .select('stripe_customer_id') as any)
      .eq('id', tenantId)
      .single();

    if (!(tenant as any)?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'Not Found', message: 'No billing account found. Please subscribe first.', errorId: requestId },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const returnUrl = (body as any)?.returnUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? '/dashboard';

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: (tenant as any).stripe_customer_id,
      return_url: returnUrl,
    });

    logger.info('Stripe portal session created', {
      requestId,
      tenantId,
    });

    return NextResponse.json({ portalUrl: session.url });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in POST /billing/portal', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
