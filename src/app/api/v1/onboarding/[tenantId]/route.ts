import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/onboarding/[tenantId]
 * Return org profile for current tenant only
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const requestId = uuidv4();

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const { tenantId } = params;

    // Verify tenant ownership via user's clerk_id
    const db = getSupabaseAdmin();
    const { data: user } = await db
      .from('users')
      .select('tenant_id')
      .eq('clerk_id', session.userId)
      .single();

    if (!user || user.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Access denied to this organization', errorId: requestId },
        { status: 403 }
      );
    }

    const { data: profile, error } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (error || !profile) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Organization profile not found', errorId: requestId },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: profile });
  } catch (error) {
    logger.error('Get org profile error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}

const UpdateProfileSchema = z.object({
  orgName: z.string().min(1).max(255).optional(),
  employeeCount: z.number().int().min(1).max(100000).optional(),
  itBudgetRange: z.enum(['0-50k', '50k-100k', '100k-500k', '500k-1m', '1m+']).optional(),
  currentTools: z.array(z.string()).optional(),
  hasCyberInsurance: z.boolean().optional(),
  carrierName: z.string().optional(),
  ehrSystem: z.string().optional(),
  dmsSystem: z.string().optional(),
});

/**
 * PUT /api/v1/onboarding/[tenantId]
 * Update org profile fields
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const requestId = uuidv4();

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const { tenantId } = params;
    const db = getSupabaseAdmin();

    // Verify tenant ownership
    const { data: user } = await db
      .from('users')
      .select('tenant_id')
      .eq('clerk_id', session.userId)
      .single();

    if (!user || user.tenant_id !== tenantId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Access denied to this organization', errorId: requestId },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = UpdateProfileSchema.parse(body);

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (validated.orgName !== undefined) updates.org_name = validated.orgName;
    if (validated.employeeCount !== undefined) updates.employee_count = validated.employeeCount;
    if (validated.itBudgetRange !== undefined) updates.it_budget_range = validated.itBudgetRange;
    if (validated.currentTools !== undefined) updates.current_tools = validated.currentTools;
    if (validated.hasCyberInsurance !== undefined) updates.cyber_insurance = validated.hasCyberInsurance;
    if (validated.carrierName !== undefined) updates.carrier = validated.carrierName;
    if (validated.ehrSystem !== undefined) updates.ehr_system = validated.ehrSystem;
    if (validated.dmsSystem !== undefined) updates.dms_system = validated.dmsSystem;

    const { data: updated, error } = await db
      .from('org_profiles')
      .update(updates)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Update Failed', message: error.message, errorId: requestId },
        { status: 500 }
      );
    }

    await db.from('audit_events').insert({
      tenant_id: tenantId,
      user_id: user.tenant_id,
      event_type: 'org_profile_updated',
      event_data: { fields: Object.keys(validated), requestId },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    logger.error('Update org profile error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
