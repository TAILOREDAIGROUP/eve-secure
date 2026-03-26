import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { logger } from '@/lib/logger';
import { hybridSearch } from '@/lib/ai/rag/pipeline';
import { getSystemPrompt } from '@/lib/ai/prompts/system';
import { routeAndCall } from '@/lib/ai/router';
import { sanitizeInput } from '@/lib/ai/guardrails/input-sanitizer';


/**
 * Operational Resilience Assessment sections
 */
const RESILIENCE_SECTIONS = [
  'RTO_RPO',
  'BACKUP_STRATEGY',
  'INCIDENT_RESPONSE',
  'DISASTER_RECOVERY',
  'CONTINUITY_PLANNING',
] as const;
type ResilienceSection = typeof RESILIENCE_SECTIONS[number];

const SECTION_LABELS: Record<ResilienceSection, string> = {
  RTO_RPO: 'Recovery Objectives (RTO/RPO)',
  BACKUP_STRATEGY: 'Backup Strategy',
  INCIDENT_RESPONSE: 'Incident Response Readiness',
  DISASTER_RECOVERY: 'Disaster Recovery',
  CONTINUITY_PLANNING: 'Business Continuity Planning',
};

const SECTION_PROGRESS: Record<ResilienceSection, { min: number; max: number }> = {
  RTO_RPO:              { min: 0,  max: 20 },
  BACKUP_STRATEGY:      { min: 21, max: 40 },
  INCIDENT_RESPONSE:    { min: 41, max: 60 },
  DISASTER_RECOVERY:    { min: 61, max: 80 },
  CONTINUITY_PLANNING:  { min: 81, max: 100 },
};

/**
 * Template questions for each resilience section, by sector.
 */
function getTemplateQuestions(section: ResilienceSection, sector: string, orgName: string): string[] {
  const sectorSuffix = sector === 'healthcare'
    ? ' Include ePHI systems and HIPAA contingency plan requirements.'
    : sector === 'legal'
    ? ' Include client matter data and trust account systems.'
    : '';

  const questions: Record<ResilienceSection, string[]> = {
    RTO_RPO: [
      `What is ${orgName}'s defined Recovery Time Objective (RTO) for critical business systems? How long can operations be down before it causes significant harm?${sectorSuffix}`,
      `What is your Recovery Point Objective (RPO)? How much data loss (in hours) is acceptable for your most critical systems?${sectorSuffix}`,
      `Have you documented RTO/RPO targets for each tier of business-critical systems? Are these targets tested and validated?`,
    ],
    BACKUP_STRATEGY: [
      `Describe ${orgName}'s current backup strategy. Do you follow the 3-2-1 rule (3 copies, 2 media types, 1 offsite)?`,
      `Are your backups immutable or air-gapped? Can ransomware that compromises your network also encrypt or delete your backups?`,
      `When was the last time ${orgName} tested a full backup restoration? What was the result?${sectorSuffix}`,
    ],
    INCIDENT_RESPONSE: [
      `Does ${orgName} have a documented incident response plan? When was it last reviewed or updated?`,
      `Who are the key members of your incident response team? Are roles and escalation paths clearly defined?`,
      `What external resources (forensics firm, legal counsel, insurance carrier) are pre-identified for incident response?${sectorSuffix}`,
    ],
    DISASTER_RECOVERY: [
      `Does ${orgName} have a disaster recovery plan that covers total site loss (e.g., natural disaster, ransomware destroying all systems)?`,
      `What is your failover strategy for critical systems? Do you have hot, warm, or cold standby environments?`,
      `When was your last disaster recovery drill or tabletop exercise? What lessons were learned?${sectorSuffix}`,
    ],
    CONTINUITY_PLANNING: [
      `How does ${orgName} ensure critical business functions continue during extended IT outages (manual procedures, alternate sites)?`,
      `What communication plan exists for notifying employees, clients, and stakeholders during a major disruption?${sectorSuffix}`,
      `Does your business continuity plan account for supply chain dependencies and third-party service outages?`,
    ],
  };

  return questions[section];
}

/**
 * Generate next resilience question via LLM with RAG context.
 * Falls back to template.
 */
async function generateResilienceQuestion(args: {
  section: ResilienceSection;
  sector: string;
  orgName: string;
  tenantId: string;
  sessionId: string;
  responseText: string;
  responseCount: number;
}): Promise<{ questionText: string; citations: string[]; generatedBy: 'llm' | 'template' }> {
  const { section, sector, orgName, tenantId, sessionId, responseText, responseCount } = args;

  try {
    const searchQuery = `${SECTION_LABELS[section]} ${sector} business continuity disaster recovery`;
    const searchResult = await hybridSearch(searchQuery, 4);
    const ragContext = searchResult.items.map((i, idx) => `[${i.source}] ${i.content}`).join('\n');

    const prompt = `You are conducting an Operational Resilience Assessment for ${orgName} (${sector} sector).

## Current Section: ${SECTION_LABELS[section]}
## Questions Answered: ${responseCount}
## User's Latest Response:
"${responseText.substring(0, 800)}"

${ragContext ? `## Knowledge Context:\n${ragContext}\n` : ''}

Generate the NEXT assessment question for ${SECTION_LABELS[section]}. The question must:
1. Build on the user's previous response — probe deeper on gaps or move to next sub-topic
2. Be specific to ${sector} sector requirements
3. Focus on measurable, testable resilience capabilities
4. Reference specific standards (NIST CSF RC.RP, HIPAA contingency plan, ABA business continuity) where applicable

Respond with ONLY the question text.`;

    const result = await routeAndCall({
      query: prompt,
      systemPrompt: getSystemPrompt(),
      tenantId,
      conversationId: sessionId,
    });

    if (!result.degraded && result.content.length > 30) {
      return {
        questionText: result.content.trim(),
        citations: searchResult.items.map(i => i.source),
        generatedBy: 'llm',
      };
    }
    throw new Error('LLM degraded');
  } catch {
    const templates = getTemplateQuestions(section, sector, orgName);
    const idx = responseCount % templates.length;
    return {
      questionText: templates[idx]!,
      citations: [`NIST CSF 2.0 — ${section}`, sector === 'healthcare' ? 'HIPAA 164.308(a)(7)' : 'Business Continuity Standards'],
      generatedBy: 'template',
    };
  }
}

const RespondSchema = z.object({
  section: z.enum(RESILIENCE_SECTIONS),
  responseText: z.string().min(1).max(10000),
  questionId: z.string().optional(),
});

/**
 * POST /api/v1/assessment/resilience
 * Start a new operational resilience assessment session.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();
    const db = getSupabaseAdmin();

    const sessionId = uuidv4();
    const now = new Date().toISOString();

    // Create assessment session with resilience type
    const { data: newSession, error: sessionError } = await db
      .from('assessment_sessions')
      .insert({
        id: sessionId,
        tenant_id: tenantId,
        user_id: user.id,
        status: 'in_progress',
        current_section: 'RTO_RPO',
        progress_pct: 0,
        gaps: [] as any,
        started_at: now,
        assessment_type: 'resilience',
      } as any)
      .select()
      .single();

    if (sessionError) {
      logger.error('Failed to create resilience session', { requestId, error: sessionError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create session', errorId: requestId },
        { status: 500 }
      );
    }

    // Create conversation state
    await db.from('conversation_state').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      session_id: sessionId,
      context_summary: null,
      current_section_qa: [] as any,
      retrieved_knowledge_ids: [],
      token_count: 0,
    } as any);

    // Load org profile for initial question
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('sector, org_name')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'your organization';

    // Generate first question
    const templates = getTemplateQuestions('RTO_RPO', sector, orgName);
    const firstQuestion = templates[0]!;

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'resilience_assessment.started',
      event_data: { sessionId, section: 'RTO_RPO' } as any,
    } as any);

    logger.info('Resilience assessment session created', {
      requestId,
      sessionId,
      tenantId,
    });

    return NextResponse.json({
      session: newSession,
      firstQuestion,
      section: 'RTO_RPO',
      sectionLabel: SECTION_LABELS['RTO_RPO'],
      sections: RESILIENCE_SECTIONS.map(s => ({ id: s, label: SECTION_LABELS[s] })),
    }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in POST /assessment/resilience', {
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
 * PUT /api/v1/assessment/resilience
 * Submit a response to the current resilience assessment question and get the next one.
 */
export async function PUT(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();
    const db = getSupabaseAdmin();

    const body = await request.json();
    const parseResult = RespondSchema.safeParse(body);
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

    const { section, responseText, questionId } = parseResult.data;
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'sessionId query parameter required', errorId: requestId },
        { status: 400 }
      );
    }

    // Verify session
    const { data: session, error: sessionError } = await db
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Session not found', errorId: requestId },
        { status: 404 }
      );
    }

    if (session.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Conflict', message: `Session is ${session.status}`, errorId: requestId },
        { status: 409 }
      );
    }

    // Sanitize input
    const sanitized = sanitizeInput(responseText);

    // Save response
    const responseId = uuidv4();
    await db.from('assessment_responses').insert({
      id: responseId,
      tenant_id: tenantId,
      session_id: sessionId,
      question_id: questionId ?? null,
      section,
      question_text: `Resilience: ${SECTION_LABELS[section]}`,
      response_text: sanitized.sanitized,
      metadata: { requestId, assessmentType: 'resilience' } as any,
    } as any);

    // Load org profile
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('sector, org_name')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'your organization';

    // Count section responses
    const { count } = await db
      .from('assessment_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('section', section);

    const sectionResponses = count ?? 1;

    // Generate next question
    const { questionText, citations, generatedBy } = await generateResilienceQuestion({
      section,
      sector,
      orgName,
      tenantId,
      sessionId,
      responseText: sanitized.sanitized,
      responseCount: sectionResponses,
    });

    // Calculate progress
    const range = SECTION_PROGRESS[section];
    const questionsPerSection = 3;
    const withinProgress = Math.min(sectionResponses / questionsPerSection, 1);
    const progress = Math.round(range.min + withinProgress * (range.max - range.min));

    // Update session
    await db.from('assessment_sessions').update({
      current_section: section,
      progress_pct: progress,
    } as any).eq('id', sessionId);

    logger.info('Resilience response processed', {
      requestId,
      sessionId,
      section,
      progress,
      generatedBy,
    });

    return NextResponse.json({
      responseId,
      nextQuestion: questionText,
      section,
      sectionLabel: SECTION_LABELS[section],
      progress,
      citations,
      generatedBy,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in PUT /assessment/resilience', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
