import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


/**
 * Tenant overview with assessment and plan status.
 */
interface TenantOverview {
  id: string;
  name: string;
  sector: string | null;
  status: string;
  createdAt: string;
  userCount: number;
  assessmentStatus: 'not_started' | 'in_progress' | 'completed';
  assessmentCount: number;
  latestAssessmentDate: string | null;
  planStatus: 'not_generated' | 'generated';
  planCount: number;
  lastActivityDate: string | null;
}

/**
 * GET /api/v1/admin/dashboard
 * Aggregated admin dashboard with per-tenant assessment/plan status.
 * Requires super_admin or tenant_admin role.
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    if (user.role !== 'super_admin' && user.role !== 'tenant_admin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    const db = getSupabaseAdmin();

    // Determine scope: super_admin sees all, tenant_admin sees own
    const isSuperAdmin = user.role === 'super_admin';

    // Fetch tenants
    let tenantsQuery = db.from('tenants').select('*').order('created_at', { ascending: false });
    if (!isSuperAdmin) {
      tenantsQuery = tenantsQuery.eq('id', tenantId);
    }
    const { data: tenants, error: tenantsError } = await tenantsQuery;

    if (tenantsError) {
      logger.error('Failed to fetch tenants for dashboard', { requestId, error: tenantsError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to load dashboard', errorId: requestId },
        { status: 500 }
      );
    }

    // Enrich each tenant with assessment and plan status
    const tenantOverviews: TenantOverview[] = await Promise.all(
      (tenants ?? []).map(async (tenant: any) => {
        // User count
        const { count: userCount } = await db
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);

        // Assessment sessions for this tenant
        const { data: sessions } = await db
          .from('assessment_sessions')
          .select('id, status, started_at, completed_at, created_at')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false });

        const assessmentCount = sessions?.length ?? 0;
        const latestSession = sessions?.[0];
        const hasCompleted = sessions?.some((s: any) => s.status === 'completed');
        const hasInProgress = sessions?.some((s: any) => s.status === 'in_progress');

        const assessmentStatus: TenantOverview['assessmentStatus'] =
          hasCompleted ? 'completed' : hasInProgress ? 'in_progress' : 'not_started';

        const latestAssessmentDate = latestSession?.created_at ?? null;

        // Plan count
        const { count: planCount } = await db
          .from('action_plans')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);

        const planStatus: TenantOverview['planStatus'] =
          (planCount ?? 0) > 0 ? 'generated' : 'not_generated';

        // Last activity: most recent of session, plan, or audit event
        const { data: latestAudit } = await db
          .from('audit_events')
          .select('created_at')
          .eq('tenant_id', tenant.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const activityDates = [
          latestSession?.created_at,
          latestAudit?.[0]?.created_at,
          tenant.updated_at,
        ].filter(Boolean) as string[];

        const lastActivityDate = activityDates.length > 0
          ? activityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]!
          : null;

        // Fetch org profile for sector
        const { data: orgProfile } = await db
          .from('org_profiles')
          .select('sector')
          .eq('tenant_id', tenant.id)
          .single();

        return {
          id: tenant.id,
          name: tenant.name ?? tenant.id.slice(0, 8),
          sector: orgProfile?.sector ?? null,
          status: tenant.status ?? 'active',
          createdAt: tenant.created_at,
          userCount: userCount ?? 0,
          assessmentStatus,
          assessmentCount,
          latestAssessmentDate,
          planStatus,
          planCount: planCount ?? 0,
          lastActivityDate,
        };
      })
    );

    // Aggregate stats
    const totalTenants = tenantOverviews.length;
    const totalUsers = tenantOverviews.reduce((sum, t) => sum + t.userCount, 0);
    const totalAssessments = tenantOverviews.reduce((sum, t) => sum + t.assessmentCount, 0);
    const completedAssessments = tenantOverviews.filter(t => t.assessmentStatus === 'completed').length;
    const inProgressAssessments = tenantOverviews.filter(t => t.assessmentStatus === 'in_progress').length;
    const totalPlans = tenantOverviews.reduce((sum, t) => sum + t.planCount, 0);

    logger.info('Admin dashboard loaded', {
      requestId,
      totalTenants,
      totalAssessments,
      completedAssessments,
      isSuperAdmin,
    });

    return NextResponse.json({
      summary: {
        totalTenants,
        totalUsers,
        totalAssessments,
        completedAssessments,
        inProgressAssessments,
        notStartedAssessments: totalTenants - completedAssessments - inProgressAssessments,
        totalPlans,
      },
      tenants: tenantOverviews,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /admin/dashboard', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
