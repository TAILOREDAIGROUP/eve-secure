import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/sse
 * Server-Sent Events streaming endpoint.
 * Query params: sessionId (required)
 * Streams template responses (will be replaced by real LLM streaming later).
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    // Auth check on connect
    const session = await auth();
    if (!session.userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Authentication required', errorId: requestId }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Validation Error', message: 'sessionId query parameter is required', errorId: requestId }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getSupabaseAdmin();

    // Verify tenant ownership
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'User record not found', errorId: requestId }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify session belongs to tenant
    const { data: assessmentSession, error: sessionError } = await db
      .from('assessment_sessions')
      .select('id, tenant_id, current_section, status')
      .eq('id', sessionId)
      .eq('tenant_id', user.tenant_id)
      .single();

    if (sessionError || !assessmentSession) {
      return new Response(
        JSON.stringify({ error: 'Not Found', message: 'Assessment session not found', errorId: requestId }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info('SSE connection established', { requestId, sessionId, userId: user.id });

    const encoder = new TextEncoder();

    // Template response chunks (will be replaced by LLM streaming)
    const section = assessmentSession.current_section ?? 'GOVERN';
    const templateChunks = [
      `Based on your responses regarding the ${section} function, `,
      `I can see that your organization has taken some initial steps. `,
      `Let me highlight a few areas where we can strengthen your posture. `,
      `First, consider formalizing your policies and documenting current procedures. `,
      `This will provide a foundation for measurable improvement.`,
    ];

    const stream = new ReadableStream({
      start(controller) {
        let chunkIndex = 0;
        let aborted = false;

        // Send start event
        const startEvent = `data: ${JSON.stringify({
          type: 'start',
          sessionId,
          section,
          requestId,
          generatedBy: 'template',
        })}\n\n`;
        controller.enqueue(encoder.encode(startEvent));

        const interval = setInterval(() => {
          if (aborted) {
            clearInterval(interval);
            return;
          }

          if (chunkIndex < templateChunks.length) {
            const chunkEvent = `data: ${JSON.stringify({
              type: 'chunk',
              content: templateChunks[chunkIndex],
              index: chunkIndex,
            })}\n\n`;
            controller.enqueue(encoder.encode(chunkEvent));
            chunkIndex++;
          } else {
            // Send complete event
            const completeEvent = `data: ${JSON.stringify({
              type: 'complete',
              fullText: templateChunks.join(''),
              generatedBy: 'template',
            })}\n\n`;
            controller.enqueue(encoder.encode(completeEvent));
            clearInterval(interval);
            controller.close();
          }
        }, 300);

        // Handle client disconnect
        request.signal.addEventListener('abort', () => {
          aborted = true;
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // Stream may already be closed
          }
          logger.info('SSE client disconnected', { requestId, sessionId });
        });
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Request-Id': requestId,
      },
    });
  } catch (error) {
    logger.error('Unhandled error in GET /sse', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorEvent = `data: ${JSON.stringify({
          type: 'error',
          message: 'An unexpected error occurred',
          errorId: requestId,
        })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      },
    });

    return new Response(errorStream, {
      status: 500,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
