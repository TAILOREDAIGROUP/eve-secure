import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


const UpdateItemStatusSchema = z.object({
  itemIndex: z.number().int().min(0),
  status: z.enum(['not_started', 'in_progress', 'complete']),
});

/**
 * GET /api/v1/plan/[planId]
 * Return full plan with all action items.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { planId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const { planId } = params;
    const db = getSupabaseAdmin();

    // Fetch plan with tenant verification
    const { data: plan, error: planError } = await db
      .from('action_plans')
      .select('*')
      .eq('id', planId)
      .eq('tenant_id', tenantId)
      .single();

    if (planError || !plan) {
      logger.warn('Plan not found or access denied', { requestId, planId, tenantId });
      return NextResponse.json(
        { error: 'Not Found', message: 'Action plan not found', errorId: requestId },
        { status: 404 }
      );
    }

    logger.info('Fetched action plan detail', { requestId, planId });

    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /plan/[planId]', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/plan/[planId]
 * Update action item status within the plan's JSONB recommendations array.
 * Accepts { itemIndex, status } where status is 'not_started' | 'in_progress' | 'complete'.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { planId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const { planId } = params;
    const db = getSupabaseAdmin();

    // Validate input
    const body = await request.json();
    const parseResult = UpdateItemStatusSchema.safeParse(body);
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

    const { itemIndex, status: newStatus } = parseResult.data;

    // Fetch existing plan with tenant verification
    const { data: plan, error: planError } = await db
      .from('action_plans')
      .select('*')
      .eq('id', planId)
      .eq('tenant_id', tenantId)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Action plan not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Parse recommendations and update the specific item
    const recommendations = Array.isArray(plan.recommendations)
      ? [...(plan.recommendations as any[])]
      : [];

    if (itemIndex >= recommendations.length) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: `Item index ${itemIndex} is out of bounds. Plan has ${recommendations.length} items.`,
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    const previousStatus = recommendations[itemIndex].status;
    recommendations[itemIndex] = {
      ...recommendations[itemIndex],
      status: newStatus,
    };

    // Update the plan
    const { data: updated, error: updateError } = await db
      .from('action_plans')
      .update({
        recommendations: recommendations as any,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', planId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      logger.error('Failed to update action plan item', { requestId, error: updateError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to update plan', errorId: requestId },
        { status: 500 }
      );
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'plan.item_updated',
      event_data: {
        planId,
        itemIndex,
        itemTitle: recommendations[itemIndex].title,
        previousStatus,
        newStatus,
      } as any,
    } as any);

    logger.info('Action plan item status updated', {
      requestId,
      planId,
      itemIndex,
      previousStatus,
      newStatus,
    });

    return NextResponse.json({
      ...updated,
      recommendations,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in PUT /plan/[planId]', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
