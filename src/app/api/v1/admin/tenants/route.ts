import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

export const runtime = 'edge';

/**
 * GET /api/v1/admin/tenants
 * Role-based tenant list.
 * - super_admin: all tenants with stats
 * - tenant_admin: own tenant only
 * - regular user: 403
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    // Regular users cannot access admin tenant list
    if (user.role !== 'super_admin' && user.role !== 'tenant_admin') {
      logger.warn('Insufficient role for admin/tenants', { requestId, userId: user.id, role: user.role });
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    // tenant_admin: return only their own tenant
    if (user.role === 'tenant_admin') {
      const { data: tenant, error: tenantError } = await db
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single();

      if (tenantError || !tenant) {
        logger.error('Tenant not found', { requestId, tenantId: tenantId });
        return NextResponse.json(
          { error: 'Internal Server Error', message: 'Tenant record not found', errorId: requestId },
          { status: 500 }
        );
      }

      // Get user count for this tenant
      const { count: userCount } = await db
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      // Get assessment count for this tenant
      const { count: assessmentCount } = await db
        .from('assessment_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);

      logger.info('Tenant admin listed own tenant', { requestId, tenantId: tenantId });

      return NextResponse.json({
        items: [
          {
            ...tenant,
            userCount: userCount ?? 0,
            assessmentCount: assessmentCount ?? 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 1,
      });
    }

    // super_admin: list all tenants with stats
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));
    const offset = (page - 1) * pageSize;

    // Total tenant count
    const { count: totalCount, error: countError } = await db
      .from('tenants')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      logger.error('Failed to count tenants', { requestId, error: countError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve tenants', errorId: requestId },
        { status: 500 }
      );
    }

    // Fetch tenants page
    const { data: tenants, error: tenantsError } = await db
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (tenantsError) {
      logger.error('Failed to fetch tenants', { requestId, error: tenantsError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve tenants', errorId: requestId },
        { status: 500 }
      );
    }

    // Enrich each tenant with stats
    const enrichedTenants = await Promise.all(
      (tenants ?? []).map(async (tenant: any) => {
        const { count: userCount } = await db
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);

        const { count: assessmentCount } = await db
          .from('assessment_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id);

        return {
          ...tenant,
          userCount: userCount ?? 0,
          assessmentCount: assessmentCount ?? 0,
        };
      })
    );

    logger.info('Super admin listed tenants', {
      requestId,
      page,
      pageSize,
      total: totalCount,
    });

    return NextResponse.json({
      items: enrichedTenants,
      total: totalCount ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /admin/tenants', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
