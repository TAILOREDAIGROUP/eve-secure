import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { logger } from '@/lib/logger';
import { hybridSearch } from '@/lib/ai/rag/pipeline';
import { getAssessmentPrompt } from '@/lib/ai/prompts/system';
import { getSectorPrompt } from '@/lib/ai/prompts/sector-prompts';
import { routeAndCall } from '@/lib/ai/router';
import { buildConversationContext, type CSFSection } from '@/lib/ai/conversation-state';
import { sanitizeInput } from '@/lib/ai/guardrails/input-sanitizer';
import type { OrgProfile } from '@/types';


/**
 * NIST CSF 2.0 sections in assessment order with progress ranges.
 */
const NIST_SECTIONS = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'] as const;
type NistSection = typeof NIST_SECTIONS[number];

const SECTION_PROGRESS: Record<NistSection, { min: number; max: number }> = {
  GOVERN:   { min: 0,  max: 16 },
  IDENTIFY: { min: 17, max: 33 },
  PROTECT:  { min: 34, max: 50 },
  DETECT:   { min: 51, max: 66 },
  RESPOND:  { min: 67, max: 83 },
  RECOVER:  { min: 84, max: 100 },
};

const RespondInputSchema = z.object({
  section: z.enum(NIST_SECTIONS),
  responseText: z.string().min(1).max(10000),
  questionId: z.string().optional(),
});

/**
 * Generate a sector-adapted follow-up question based on org profile and section.
 * Template fallback — used when LLM is unavailable.
 */
function generateTemplateQuestion(
  section: NistSection,
  sector: string,
  orgName: string,
  responseCount: number
): { questionText: string; citations: string[] } {
  const sectionQuestions: Record<NistSection, string[]> = {
    GOVERN: [
      `How does ${orgName} currently define cybersecurity roles and responsibilities within your organization?`,
      `What policies or frameworks guide your cybersecurity risk management decisions?`,
      `How do you communicate cybersecurity expectations to third-party vendors and partners?`,
      `Describe your process for reviewing and updating cybersecurity policies.`,
    ],
    IDENTIFY: [
      `What methods does ${orgName} use to maintain an inventory of hardware and software assets?`,
      `How do you identify and classify sensitive data across your systems?`,
      `What is your process for conducting risk assessments?`,
      `How do you track and manage vulnerabilities in your environment?`,
    ],
    PROTECT: [
      `What access control mechanisms are in place for sensitive systems and data?`,
      `Describe your approach to security awareness training for staff.`,
      `How do you protect data at rest and in transit?`,
      `What endpoint protection solutions are deployed across ${orgName}?`,
    ],
    DETECT: [
      `What monitoring tools or services does ${orgName} use to detect security events?`,
      `How are security alerts triaged and escalated?`,
      `Do you perform regular vulnerability scans or penetration tests?`,
      `How do you detect unauthorized access or anomalous behavior?`,
    ],
    RESPOND: [
      `Does ${orgName} have a documented incident response plan?`,
      `How do you coordinate incident response across teams?`,
      `Describe your process for containing and eradicating threats once detected.`,
      `How do you handle communication during a security incident?`,
    ],
    RECOVER: [
      `What is your business continuity and disaster recovery plan?`,
      `How frequently are backups tested for restoration?`,
      `What is your process for conducting post-incident reviews?`,
      `How do you communicate recovery progress to stakeholders?`,
    ],
  };

  let sectorSuffix = '';
  const citations: string[] = [];

  if (sector === 'healthcare') {
    const hipaaFollowUps: Record<NistSection, string> = {
      GOVERN:   ' Consider HIPAA Security Rule administrative safeguards (45 CFR 164.308).',
      IDENTIFY: ' Include ePHI data flows and Business Associate inventory per HIPAA requirements.',
      PROTECT:  ' Address HIPAA technical safeguards including access controls and audit controls (45 CFR 164.312).',
      DETECT:   ' Include HIPAA-required audit log review and monitoring of ePHI access.',
      RESPOND:  ' Include HIPAA Breach Notification Rule requirements (45 CFR 164.404-410).',
      RECOVER:  ' Address HIPAA contingency plan requirements (45 CFR 164.308(a)(7)).',
    };
    sectorSuffix = hipaaFollowUps[section];
    citations.push('HIPAA Security Rule (45 CFR Part 164)', 'NIST SP 800-66r2');
  } else if (sector === 'legal') {
    const legalFollowUps: Record<NistSection, string> = {
      GOVERN:   ' Consider ABA Model Rule 1.6 (Confidentiality) and Formal Opinion 477R on technology competence.',
      IDENTIFY: ' Include classification of client privileged data and matter management systems.',
      PROTECT:  ' Address ABA Model Rule 1.1 Comment 8 requiring competence in relevant technology.',
      DETECT:   ' Include monitoring for unauthorized access to client files and privileged communications.',
      RESPOND:  ' Include state bar notification requirements and client communication obligations.',
      RECOVER:  ' Address trust account data recovery and court filing continuity.',
    };
    sectorSuffix = legalFollowUps[section];
    citations.push('ABA Model Rules of Professional Conduct', 'ABA Formal Opinion 477R');
  }

  citations.push(`NIST CSF 2.0 — ${section} Function`);

  const questions = sectionQuestions[section];
  const questionIndex = responseCount % questions.length;
  const questionText = questions[questionIndex] + sectorSuffix;

  return { questionText, citations };
}

/**
 * Generate next assessment question using RAG + LLM.
 * Falls back to template if LLM fails.
 */
async function generateLLMQuestion(args: {
  section: NistSection;
  sector: string;
  orgName: string;
  tenantId: string;
  sessionId: string;
  responseText: string;
  responseCount: number;
  orgProfile: any;
}): Promise<{ questionText: string; citations: string[]; generatedBy: 'llm' | 'template' }> {
  const { section, sector, orgName, tenantId, sessionId, responseText, responseCount, orgProfile } = args;

  try {
    // Build conversation context for continuity
    const conversationCtx = await buildConversationContext(
      sessionId,
      tenantId,
      section as CSFSection
    );

    // Search knowledge base for section-relevant context
    const searchQuery = `${section} cybersecurity assessment ${sector} organization security controls`;
    const searchResult = await hybridSearch(searchQuery, 5);

    const ragContext = searchResult.items.length > 0
      ? searchResult.items.map((item, idx) =>
          `[Source ${idx + 1}: ${item.source}] ${item.content}`
        ).join('\n\n')
      : '';

    // Build the question generation prompt
    const questionPrompt = `You are conducting a NIST CSF 2.0 cybersecurity assessment for ${orgName}, a ${sector} organization.

## Current Section: ${section}
## Questions Answered in This Section: ${responseCount}
## User's Latest Response:
"${responseText.substring(0, 1000)}"

${conversationCtx.context ? `## Prior Assessment Context:\n${conversationCtx.context}\n` : ''}
${ragContext ? `## Relevant Knowledge Base Context:\n${ragContext}\n` : ''}

## Your Task:
Generate the NEXT assessment question for the ${section} function. The question must:
1. Be specific to ${orgName}'s ${sector} sector
2. Build on the user's previous response — probe deeper or move to the next sub-area within ${section}
3. Reference specific regulatory requirements (HIPAA, ABA rules, NIST subcategories) where applicable
4. Be actionable and answerable by a non-technical business leader
5. Include the relevant NIST CSF subcategory reference in brackets (e.g., [GV.OC-01])

Respond with ONLY the question text. Do not add preamble, numbering, or explanation.`;

    // Build sector-aware system prompt
    let systemPrompt = getAssessmentPrompt();
    if (orgProfile) {
      const orgProfileTyped: OrgProfile = {
        id: orgProfile.id,
        tenantId: orgProfile.tenant_id,
        legalName: orgName,
        description: '',
        website: '',
        sector: sector as OrgProfile['sector'],
        employees: orgProfile.employee_count ?? 0,
        annualRevenue: 0,
        headquartersState: orgProfile.state as OrgProfile['headquartersState'],
        dataHandlingCategory: 'none',
        criticality: 'medium',
        industryCompliance: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const sectorContext = getSectorPrompt(sector, orgProfileTyped);
      systemPrompt = `${systemPrompt}\n\n${sectorContext}`;
    }

    // Call LLM via routed provider
    const result = await routeAndCall({
      query: questionPrompt,
      systemPrompt,
      tenantId,
      conversationId: sessionId,
    });

    if (result.degraded) {
      throw new Error('LLM returned degraded response');
    }

    // Extract citations from RAG sources
    const citations = searchResult.items.map(item => item.source);
    citations.push(`NIST CSF 2.0 — ${section} Function`);

    logger.info('LLM question generated', {
      section,
      sector,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cost: result.cost.toFixed(6),
    });

    return {
      questionText: result.content.trim(),
      citations,
      generatedBy: 'llm',
    };
  } catch (error) {
    logger.warn('LLM question generation failed, falling back to template', {
      error: error instanceof Error ? error.message : String(error),
      section,
      sector,
    });

    const template = generateTemplateQuestion(section, sector, orgName, responseCount);
    return { ...template, generatedBy: 'template' };
  }
}

/**
 * Calculate progress percentage based on section and response count within section.
 */
function calculateProgress(section: NistSection, sectionResponseCount: number): number {
  const range = SECTION_PROGRESS[section];
  const questionsPerSection = 4;
  const withinSectionProgress = Math.min(sectionResponseCount / questionsPerSection, 1);
  return Math.round(range.min + withinSectionProgress * (range.max - range.min));
}

/**
 * POST /api/v1/assessment/[sessionId]/respond
 * Accept user response to current assessment question, generate EVE's next question via RAG + LLM.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const requestId = uuidv4();

  try {
    // 1. Auth
    const { user, tenantId } = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const { sessionId } = params;
    const db = getSupabaseAdmin();

    // Verify session ownership
    const { data: assessmentSession, error: sessionError } = await db
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (sessionError || !assessmentSession) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Assessment session not found', errorId: requestId },
        { status: 404 }
      );
    }

    if (assessmentSession.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Conflict', message: `Session is ${assessmentSession.status}, cannot accept responses`, errorId: requestId },
        { status: 409 }
      );
    }

    // 2. Validate input
    const body = await request.json();
    const parseResult = RespondInputSchema.safeParse(body);
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

    // 3. Sanitize user response
    const sanitized = sanitizeInput(responseText);
    const safeResponseText = sanitized.sanitized;

    // 3. Save user's response
    const responseId = uuidv4();
    const { error: insertError } = await db
      .from('assessment_responses')
      .insert({
        id: responseId,
        tenant_id: tenantId,
        session_id: sessionId,
        question_id: questionId ?? null,
        section,
        question_text: `User response to ${section} question`,
        response_text: safeResponseText,
        metadata: {
          requestId,
          piiDetected: sanitized.piiDetected.some(Boolean),
          injectionDetected: sanitized.injectionDetected,
        } as any,
      } as any);

    if (insertError) {
      logger.error('Failed to save assessment response', { requestId, error: insertError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to save response', errorId: requestId },
        { status: 500 }
      );
    }

    // 4. Load org profile for sector context
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'your organization';

    // 5. Count responses in current section for progress
    const { count: sectionResponseCount } = await db
      .from('assessment_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('section', section);

    const totalSectionResponses = sectionResponseCount ?? 1;

    // 6. Generate next question via RAG + LLM (falls back to template)
    const { questionText: nextQuestion, citations, generatedBy } = await generateLLMQuestion({
      section,
      sector,
      orgName,
      tenantId,
      sessionId,
      responseText: safeResponseText,
      responseCount: totalSectionResponses,
      orgProfile,
    });

    // 7. Calculate progress
    const progress = calculateProgress(section, totalSectionResponses);

    // 8. Update session progress and section
    const { error: updateSessionError } = await db
      .from('assessment_sessions')
      .update({
        current_section: section,
        progress_pct: progress,
      } as any)
      .eq('id', sessionId);

    if (updateSessionError) {
      logger.error('Failed to update session progress', { requestId, error: updateSessionError.message });
    }

    // 9. Update conversation state
    const { error: updateStateError } = await db
      .from('conversation_state')
      .update({
        context_summary: `Last response in ${section}: ${safeResponseText.substring(0, 200)}...`,
        current_section_qa: {
          section,
          lastResponse: safeResponseText.substring(0, 500),
          responseCount: totalSectionResponses,
        } as any,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId);

    if (updateStateError) {
      logger.warn('Failed to update conversation state', { requestId, error: updateStateError.message });
    }

    logger.info('Assessment response processed', {
      requestId,
      sessionId,
      section,
      progress,
      responseId,
      generatedBy,
    });

    return NextResponse.json({
      responseId,
      nextQuestion,
      section,
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
    logger.error('Unhandled error in POST /assessment/[sessionId]/respond', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
