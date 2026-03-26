import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


/**
 * GET /api/v1/admin/tenants/[tenantId]
 * Read-only detail view of a tenant's assessment results.
 * Requires super_admin role (or tenant_admin for own tenant).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId: authTenantId } = await requireAuth();
    const { tenantId: targetTenantId } = params;

    // Access control: super_admin can view any, tenant_admin only own
    if (user.role !== 'super_admin') {
      if (user.role === 'tenant_admin' && authTenantId === targetTenantId) {
        // OK — viewing own tenant
      } else {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Admin access required', errorId: requestId },
          { status: 403 }
        );
      }
    }

    const db = getSupabaseAdmin();

    // Fetch tenant
    const { data: tenant, error: tenantError } = await db
      .from('tenants')
      .select('*')
      .eq('id', targetTenantId)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Tenant not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Fetch org profile
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .single();

    // Fetch users
    const { data: users } = await db
      .from('users')
      .select('id, email, role, created_at, last_sign_in_at')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false });

    // Fetch assessment sessions
    const { data: sessions } = await db
      .from('assessment_sessions')
      .select('id, status, current_section, progress_pct, tier_rating, started_at, completed_at, created_at')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false });

    // Fetch action plans
    const { data: plans } = await db
      .from('action_plans')
      .select('id, session_id, total_cost_estimate, budget_constraint, created_at')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false });

    // Fetch recent audit events (last 20)
    const { data: auditEvents } = await db
      .from('audit_events')
      .select('id, event_type, event_data, created_at')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false })
      .limit(20);

    // For each completed session, count responses per section
    const sessionDetails = await Promise.all(
      (sessions ?? []).map(async (session: any) => {
        const { data: responses } = await db
          .from('assessment_responses')
          .select('section')
          .eq('session_id', session.id)
          .eq('tenant_id', targetTenantId);

        // Group by section
        const sectionCounts: Record<string, number> = {};
        for (const r of responses ?? []) {
          sectionCounts[r.section] = (sectionCounts[r.section] ?? 0) + 1;
        }

        return {
          ...session,
          responseCount: responses?.length ?? 0,
          sectionBreakdown: sectionCounts,
        };
      })
    );

    logger.info('Admin tenant detail loaded', {
      requestId,
      targetTenantId,
      sessionCount: sessions?.length ?? 0,
      planCount: plans?.length ?? 0,
    });

    return NextResponse.json({
      tenant,
      orgProfile: orgProfile ?? null,
      users: users ?? [],
      sessions: sessionDetails,
      plans: plans ?? [],
      recentActivity: auditEvents ?? [],
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /admin/tenants/[tenantId]', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
