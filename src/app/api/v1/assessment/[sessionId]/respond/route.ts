import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

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
 * Template-based — will be replaced by LLM later.
 */
function generateNextQuestion(
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

  // Sector-specific follow-up augmentations
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
 * Calculate progress percentage based on section and response count within section.
 */
function calculateProgress(section: NistSection, sectionResponseCount: number): number {
  const range = SECTION_PROGRESS[section];
  // Assume ~4 questions per section for progress scaling
  const questionsPerSection = 4;
  const withinSectionProgress = Math.min(sectionResponseCount / questionsPerSection, 1);
  return Math.round(range.min + withinSectionProgress * (range.max - range.min));
}

/**
 * POST /api/v1/assessment/[sessionId]/respond
 * Accept user response to current assessment question, generate EVE's next question.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const requestId = uuidv4();

  try {
    // 1. Auth
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const { sessionId } = params;
    const db = getSupabaseAdmin();

    // Resolve tenant
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

    // Verify session ownership
    const { data: assessmentSession, error: sessionError } = await db
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', user.tenant_id)
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

    // 3. Save user's response
    const responseId = uuidv4();
    const { error: insertError } = await db
      .from('assessment_responses')
      .insert({
        id: responseId,
        tenant_id: user.tenant_id,
        session_id: sessionId,
        question_id: questionId ?? null,
        section,
        question_text: `User response to ${section} question`,
        response_text: responseText,
        metadata: { requestId } as any,
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
      .eq('tenant_id', user.tenant_id)
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

    // 6. Generate next question (template-based)
    const { questionText: nextQuestion, citations } = generateNextQuestion(
      section,
      sector,
      orgName,
      totalSectionResponses
    );

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
        context_summary: `Last response in ${section}: ${responseText.substring(0, 200)}...`,
        current_section_qa: {
          section,
          lastResponse: responseText.substring(0, 500),
          responseCount: totalSectionResponses,
        } as any,
        updated_at: new Date().toISOString(),
      } as any)
      .eq('session_id', sessionId)
      .eq('tenant_id', user.tenant_id);

    if (updateStateError) {
      logger.warn('Failed to update conversation state', { requestId, error: updateStateError.message });
    }

    logger.info('Assessment response processed', {
      requestId,
      sessionId,
      section,
      progress,
      responseId,
    });

    return NextResponse.json({
      responseId,
      nextQuestion,
      section,
      progress,
      citations,
      generatedBy: 'template',
    });
  } catch (error) {
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
