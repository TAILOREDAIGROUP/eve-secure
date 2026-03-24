import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/lib/logger';

// Clerk webhook secret from environment
const CLERK_WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET || '';

/**
 * POST /api/webhooks/clerk
 * Clerk user events webhook handler
 * Handles: user.created, user.updated, user.deleted
 * No rate limit (webhook endpoint)
 */
export async function POST(request: NextRequest) {
  try {
    // TODO: In production
    // - Verify webhook signature using CLERK_WEBHOOK_SECRET
    // - Use svix library: https://github.com/svix/svix-webhooks/blob/main/examples/nodejs-express/src/index.ts
    // Example signature verification:
    // import { Webhook } from 'svix';
    // const wh = new Webhook(CLERK_WEBHOOK_SECRET);
    // const payload = await wh.verify(body, headers);

    const body = await request.json();
    const { type, data } = body;

    switch (type) {
      case 'user.created':
        // Handle new user sign-up
        // - Create user profile in database
        // - Initialize notification preferences
        // - Send welcome email
        logger.info('Webhook: new user created', { userId: data.id });
        break;

      case 'user.updated':
        // Handle user profile updates
        // - Update user profile in database
        // - Sync metadata changes
        logger.info('Webhook: user updated', { userId: data.id });
        break;

      case 'user.deleted':
        // Handle user deletion
        // - Invalidate sessions for this user
        // - Archive user data (compliance)
        // - Clean up temporary files
        // - Log deletion for audit trail
        logger.info('Webhook: user deleted', { userId: data.id });
        // Invalidate all sessions for this user
        // TODO: Query and delete/invalidate sessions in database
        break;

      default:
        // Ignore other webhook events
        logger.debug('Webhook: unhandled event type', { type });
    }

    return NextResponse.json(
      { received: true },
      { status: 200 }
    );
  } catch (error) {
    logger.error('Error processing Clerk webhook', { error: error instanceof Error ? error.message : String(error) });
    // Always return 200 to prevent Clerk retry storms
    // Log error for investigation
    return NextResponse.json(
      { received: false, error: 'Processing error' },
      { status: 200 }
    );
  }
}
