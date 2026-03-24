import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/assessment
 * List assessment sessions for the current tenant with pagination.
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    // Pagination params
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    // Count total for this tenant
    const { count, error: countError } = await db
      .from('assessment_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    if (countError) {
      logger.error('Failed to count assessment sessions', { requestId, error: countError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve sessions', errorId: requestId },
        { status: 500 }
      );
    }

    // Fetch page
    const { data: sessions, error: sessionsError } = await db
      .from('assessment_sessions')
      .select('id, tenant_id, user_id, status, current_section, progress_pct, tier_rating, started_at, completed_at, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (sessionsError) {
      logger.error('Failed to fetch assessment sessions', { requestId, error: sessionsError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve sessions', errorId: requestId },
        { status: 500 }
      );
    }

    logger.info('Listed assessment sessions', {
      requestId,
      tenantId: tenantId,
      page,
      pageSize,
      total: count,
    });

    return NextResponse.json({
      items: sessions,
      total: count ?? 0,
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
    logger.error('Unhandled error in GET /assessment', {
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
 * POST /api/v1/assessment
 * Start a new assessment session. Creates assessment_session + conversation_state records.
 * Initial section is GOVERN.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    const sessionId = uuidv4();
    const now = new Date().toISOString();

    // Create assessment session
    const { data: newSession, error: sessionError } = await db
      .from('assessment_sessions')
      .insert({
        id: sessionId,
        tenant_id: tenantId,
        user_id: user.id,
        status: 'in_progress',
        current_section: 'GOVERN',
        progress_pct: 0,
        gaps: [] as any,
        started_at: now,
      } as any)
      .select()
      .single();

    if (sessionError) {
      logger.error('Failed to create assessment session', { requestId, error: sessionError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create session', errorId: requestId },
        { status: 500 }
      );
    }

    // Create conversation state
    const { error: stateError } = await db
      .from('conversation_state')
      .insert({
        id: uuidv4(),
        tenant_id: tenantId,
        session_id: sessionId,
        context_summary: null,
        current_section_qa: [] as any,
        retrieved_knowledge_ids: [],
        token_count: 0,
      } as any);

    if (stateError) {
      logger.error('Failed to create conversation state', { requestId, error: stateError.message });
      // Session was created but state failed — log but don't fail the request
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'assessment.started',
      event_data: { sessionId, section: 'GOVERN' } as any,
    } as any);

    logger.info('Assessment session created', {
      requestId,
      sessionId,
      tenantId: tenantId,
      userId: user.id,
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in POST /assessment', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
