import { NextRequest } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { hybridSearch } from '@/lib/ai/rag/pipeline';
import { getAssessmentPrompt, getPlanningPrompt, getSystemPrompt } from '@/lib/ai/prompts/system';
import { getSectorPrompt } from '@/lib/ai/prompts/sector-prompts';
import { routeAndStream } from '@/lib/ai/router';
import { buildConversationContext } from '@/lib/ai/conversation-state';
import type { StreamEvent } from '@/lib/ai/litellm';

/**
 * GET /api/v1/sse
 * Server-Sent Events streaming endpoint.
 * Query params:
 *   sessionId (required) — assessment session ID
 *   query (optional) — user query for RAG; if absent, generates next assessment question
 *   mode (optional) — 'assess' | 'plan' | 'general' (default: 'assess')
 *
 * Streams real LLM responses via Anthropic streaming API with RAG context.
 * Falls back to template responses if LLM is unavailable.
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const userQuery = searchParams.get('query');
    const mode = (searchParams.get('mode') ?? 'assess') as 'assess' | 'plan' | 'general';

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'Validation Error', message: 'sessionId query parameter is required', errorId: requestId }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getSupabaseAdmin();

    // Verify session belongs to tenant
    const { data: assessmentSession, error: sessionError } = await db
      .from('assessment_sessions')
      .select('id, tenant_id, current_section, status')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (sessionError || !assessmentSession) {
      return new Response(
        JSON.stringify({ error: 'Not Found', message: 'Assessment session not found', errorId: requestId }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Load org profile for sector context
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'your organization';
    const section = assessmentSession.current_section ?? 'GOVERN';

    // Build query: use provided query or generate assessment question prompt
    const effectiveQuery = userQuery
      ?? `Generate the next cybersecurity assessment question for ${orgName} (${sector} sector) in the ${section} section of NIST CSF 2.0. The question should be specific, actionable, and tailored to their sector. Include relevant regulatory citations.`;

    // Build system prompt based on mode
    let systemPrompt: string;
    switch (mode) {
      case 'plan':
        systemPrompt = getPlanningPrompt();
        break;
      case 'assess':
        systemPrompt = getAssessmentPrompt();
        break;
      default:
        systemPrompt = getSystemPrompt();
    }

    // Enrich with sector context
    if (orgProfile) {
      const sectorContext = getSectorPrompt(sector, {
        id: orgProfile.id,
        tenantId: orgProfile.tenant_id,
        legalName: orgName,
        description: '',
        website: '',
        sector: sector as any,
        employees: orgProfile.employee_count ?? 0,
        annualRevenue: 0,
        headquartersState: orgProfile.state as any,
        dataHandlingCategory: 'none',
        criticality: 'medium',
        industryCompliance: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      systemPrompt = `${systemPrompt}\n\n${sectorContext}`;
    }

    // Build conversation context for continuity
    const conversationCtx = await buildConversationContext(
      sessionId,
      tenantId,
      section as any
    );

    // Retrieve RAG context via hybrid search
    const searchResult = await hybridSearch(effectiveQuery, 6);
    const ragContext = searchResult.items.length > 0
      ? `\n\n## Retrieved Knowledge Context\n\n${searchResult.items.map((item, idx) =>
          `### Source ${idx + 1}: ${item.source} (${(item.similarity * 100).toFixed(1)}% match)\n**Type:** ${item.type}\n**Content:** ${item.content}`
        ).join('\n\n')}`
      : '';

    // Combine conversation history + RAG context + query
    const fullQuery = [
      conversationCtx.context ? `## Prior Assessment Context\n${conversationCtx.context}` : '',
      ragContext,
      `\n## Current Query\n${effectiveQuery}`,
      '\n---\n**Note:** Base your response ONLY on the provided context. Cite sources. If context is insufficient, state knowledge gaps.',
    ].filter(Boolean).join('\n');

    logger.info('SSE streaming initiated', {
      requestId,
      sessionId,
      mode,
      section,
      sector,
      ragResults: searchResult.items.length,
      conversationTokens: conversationCtx.tokenCount,
      userId: user.id,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let aborted = false;

        request.signal.addEventListener('abort', () => {
          aborted = true;
          try { controller.close(); } catch { /* already closed */ }
          logger.info('SSE client disconnected', { requestId, sessionId });
        });

        try {
          // Send start event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'start',
            sessionId,
            section,
            requestId,
            ragSources: searchResult.items.length,
            generatedBy: 'llm',
          })}\n\n`));

          let fullText = '';
          let model = '';
          let inputTokens = 0;
          let outputTokens = 0;
          let cost = 0;

          const streamGen = routeAndStream({
            query: fullQuery,
            systemPrompt,
            tenantId,
            conversationId: sessionId,
          });

          for await (const event of streamGen) {
            if (aborted) break;

            switch (event.type) {
              case 'start':
                model = event.model;
                break;

              case 'delta':
                fullText += event.content;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'chunk',
                  content: event.content,
                })}\n\n`));
                break;

              case 'complete':
                inputTokens = event.inputTokens;
                outputTokens = event.outputTokens;
                cost = event.cost;
                break;

              case 'error':
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: event.message,
                  errorId: event.errorId,
                })}\n\n`));
                break;
            }
          }

          if (!aborted) {
            // Send complete event with metadata
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'complete',
              fullText,
              model,
              inputTokens,
              outputTokens,
              cost: parseFloat(cost.toFixed(6)),
              ragSources: searchResult.items.length,
              citations: searchResult.items.map(i => i.source),
              generatedBy: 'llm',
            })}\n\n`));

            controller.close();
          }
        } catch (error) {
          logger.error('SSE streaming error', {
            requestId,
            sessionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });

          if (!aborted) {
            // Fall back to template response
            const templateChunks = [
              `Based on your responses regarding the ${section} function, `,
              `I can see that your organization has taken some initial steps. `,
              `Let me highlight a few areas where we can strengthen your posture. `,
              `First, consider formalizing your policies and documenting current procedures. `,
              `This will provide a foundation for measurable improvement.`,
            ];

            for (const chunk of templateChunks) {
              if (aborted) break;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'chunk',
                content: chunk,
              })}\n\n`));
            }

            if (!aborted) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                fullText: templateChunks.join(''),
                generatedBy: 'template',
              })}\n\n`));
              controller.close();
            }
          }
        }
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
    if (error instanceof AuthError) {
      return new Response(
        JSON.stringify({ error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId }),
        { status: error.statusCode, headers: { 'Content-Type': 'application/json' } }
      );
    }
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
