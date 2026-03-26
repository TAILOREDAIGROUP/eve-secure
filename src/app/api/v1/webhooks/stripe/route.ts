import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { updateTenantSubscription, type SubscriptionTier } from '@/lib/billing/stripe';


/**
 * Map Stripe price ID to subscription tier.
 */
function priceToTier(priceId: string): SubscriptionTier {
  const proPriceId = process.env.STRIPE_PRICE_PROFESSIONAL;
  const entPriceId = process.env.STRIPE_PRICE_ENTERPRISE;

  if (priceId === proPriceId) return 'professional';
  if (priceId === entPriceId) return 'enterprise';
  return 'professional'; // Default to professional for unknown prices
}

/**
 * POST /api/v1/webhooks/stripe
 * Handle Stripe webhook events for subscription lifecycle.
 * Verifies signature, processes subscription events, updates tenant tier.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    logger.warn('Stripe webhook missing signature');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    logger.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: any;

  try {
    // Verify signature using Stripe SDK
    const { getStripe } = await import('@/lib/billing/stripe');
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    logger.error('Stripe webhook signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  logger.info('Stripe webhook received', {
    type: event.type,
    id: event.id,
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const subscriptionId = subscription.id as string;
        const status = subscription.status as string;
        const priceId = subscription.items?.data?.[0]?.price?.id;
        const periodEnd = new Date(subscription.current_period_end * 1000);

        const tier = priceId ? priceToTier(priceId) : 'professional';

        await updateTenantSubscription({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          tier,
          status,
          currentPeriodEnd: periodEnd,
        });

        logger.info('Subscription updated via webhook', {
          customerId,
          subscriptionId,
          tier,
          status,
          periodEnd: periodEnd.toISOString(),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;
        const subscriptionId = subscription.id as string;

        await updateTenantSubscription({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          tier: 'free',
          status: 'canceled',
          currentPeriodEnd: new Date(),
        });

        logger.info('Subscription canceled via webhook', {
          customerId,
          subscriptionId,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        logger.warn('Payment failed', {
          customerId: invoice.customer,
          invoiceId: invoice.id,
          amountDue: invoice.amount_due,
        });
        break;
      }

      default:
        logger.debug('Unhandled Stripe event', { type: event.type });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error('Stripe webhook processing error', {
      type: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
