import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/assessment/[sessionId]
 * Return full session with Q&A history, progress, current section, and conversation state.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
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

    const { sessionId } = params;
    const db = getSupabaseAdmin();

    // Resolve tenant from clerk_id
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'User record not found', errorId: requestId },
        { status: 403 }
      );
    }

    // Fetch session and verify tenant ownership
    const { data: assessmentSession, error: sessionError } = await db
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (sessionError || !assessmentSession) {
      logger.warn('Assessment session not found or access denied', { requestId, sessionId, tenantId: user.tenant_id });
      return NextResponse.json(
        { error: 'Not Found', message: 'Assessment session not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Fetch responses history
    const { data: responses, error: responsesError } = await db
      .from('assessment_responses')
      .select('id, section, question_text, response_text, metadata, created_at')
      .eq('session_id', sessionId)
      .eq('tenant_id', user.tenant_id)
      .order('created_at', { ascending: true });

    if (responsesError) {
      logger.error('Failed to fetch assessment responses', { requestId, error: responsesError.message });
    }

    // Fetch conversation state
    const { data: conversationState, error: stateError } = await db
      .from('conversation_state')
      .select('context_summary, current_section_qa, token_count, updated_at')
      .eq('session_id', sessionId)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (stateError) {
      logger.warn('Conversation state not found', { requestId, sessionId });
    }

    logger.info('Fetched assessment session detail', { requestId, sessionId });

    return NextResponse.json({
      session: assessmentSession,
      responses: responses ?? [],
      conversationState: conversationState ?? null,
    });
  } catch (error) {
    logger.error('Unhandled error in GET /assessment/[sessionId]', {
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
 * DELETE /api/v1/assessment/[sessionId]
 * Cancel (abandon) an assessment session.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
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

    const { sessionId } = params;
    const db = getSupabaseAdmin();

    // Resolve tenant from clerk_id
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'User record not found', errorId: requestId },
        { status: 403 }
      );
    }

    // Verify ownership before update
    const { data: existing, error: fetchError } = await db
      .from('assessment_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Assessment session not found', errorId: requestId },
        { status: 404 }
      );
    }

    if (existing.status === 'abandoned') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Session is already abandoned', errorId: requestId },
        { status: 409 }
      );
    }

    if (existing.status === 'completed') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Cannot abandon a completed session', errorId: requestId },
        { status: 409 }
      );
    }

    // Set status to abandoned
    const { error: updateError } = await db
      .from('assessment_sessions')
      .update({ status: 'abandoned' } as any)
      .eq('id', sessionId)
      .eq('tenant_id', user.tenant_id);

    if (updateError) {
      logger.error('Failed to abandon assessment session', { requestId, error: updateError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to abandon session', errorId: requestId },
        { status: 500 }
      );
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'assessment.abandoned',
      event_data: { sessionId } as any,
    } as any);

    logger.info('Assessment session abandoned', { requestId, sessionId, tenantId: user.tenant_id });

    return NextResponse.json({ sessionId, status: 'abandoned' });
  } catch (error) {
    logger.error('Unhandled error in DELETE /assessment/[sessionId]', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
