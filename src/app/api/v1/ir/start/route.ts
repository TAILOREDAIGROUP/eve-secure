import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { logger } from '@/lib/logger';


const IRStartSchema = z.object({
  incidentType: z.string().min(1).max(200),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(1).max(5000),
});

/**
 * Generate initial intake questions based on incident type and severity.
 */
function generateIntakeQuestions(
  incidentType: string,
  severity: string,
  sector: string | null
): { questions: any[]; containmentChecklist: string[] } {
  const questions: any[] = [
    {
      id: 'ir_q1',
      section: 'IR_INTAKE',
      question: 'When was the incident first detected? Please provide the date and approximate time.',
      required: true,
      type: 'text',
    },
    {
      id: 'ir_q2',
      section: 'IR_INTAKE',
      question: 'Who initially discovered or reported the incident?',
      required: true,
      type: 'text',
    },
    {
      id: 'ir_q3',
      section: 'IR_INTAKE',
      question: 'What systems, networks, or data appear to be affected?',
      required: true,
      type: 'text',
    },
    {
      id: 'ir_q4',
      section: 'IR_INTAKE',
      question: 'Is the incident still actively occurring, or has it been contained?',
      required: true,
      type: 'select',
      options: ['Actively occurring', 'Partially contained', 'Fully contained', 'Unknown'],
    },
    {
      id: 'ir_q5',
      section: 'IR_INTAKE',
      question: 'Have any external parties (customers, partners, regulators) been notified?',
      required: true,
      type: 'select',
      options: ['Yes', 'No', 'In progress'],
    },
  ];

  // Severity-specific questions
  if (severity === 'critical' || severity === 'high') {
    questions.push(
      {
        id: 'ir_q6',
        section: 'IR_INTAKE',
        question: 'Has executive leadership been notified?',
        required: true,
        type: 'select',
        options: ['Yes', 'No', 'In progress'],
      },
      {
        id: 'ir_q7',
        section: 'IR_INTAKE',
        question: 'Has your cyber insurance carrier been contacted?',
        required: true,
        type: 'select',
        options: ['Yes', 'No', 'Not applicable'],
      },
      {
        id: 'ir_q8',
        section: 'IR_INTAKE',
        question: 'Is there evidence of data exfiltration or unauthorized access to sensitive data?',
        required: true,
        type: 'select',
        options: ['Confirmed exfiltration', 'Suspected exfiltration', 'No evidence of exfiltration', 'Under investigation'],
      }
    );
  }

  // Incident-type-specific questions
  const lowerType = incidentType.toLowerCase();
  if (lowerType.includes('ransomware')) {
    questions.push(
      {
        id: 'ir_q_ransom1',
        section: 'IR_INTAKE',
        question: 'Has a ransom demand been received? If so, what is the amount and deadline?',
        required: true,
        type: 'text',
      },
      {
        id: 'ir_q_ransom2',
        section: 'IR_INTAKE',
        question: 'Are offline/immutable backups available and verified as uncompromised?',
        required: true,
        type: 'select',
        options: ['Yes, verified clean', 'Yes, not yet verified', 'No offline backups', 'Unknown'],
      }
    );
  } else if (lowerType.includes('phishing') || lowerType.includes('email')) {
    questions.push(
      {
        id: 'ir_q_phish1',
        section: 'IR_INTAKE',
        question: 'How many users received or interacted with the phishing message?',
        required: true,
        type: 'text',
      },
      {
        id: 'ir_q_phish2',
        section: 'IR_INTAKE',
        question: 'Did any users enter credentials or download attachments?',
        required: true,
        type: 'select',
        options: ['Yes — credentials entered', 'Yes — attachment downloaded', 'Both', 'No interaction confirmed', 'Under investigation'],
      }
    );
  }

  // Healthcare / HIPAA breach determination questions
  if (sector === 'healthcare') {
    questions.push(
      {
        id: 'ir_q_hipaa1',
        section: 'IR_INTAKE',
        question: 'Does this incident involve protected health information (PHI) or electronic PHI (ePHI)?',
        required: true,
        type: 'select',
        options: ['Yes — confirmed PHI involved', 'Possibly — under investigation', 'No PHI involved'],
      },
      {
        id: 'ir_q_hipaa2',
        section: 'IR_INTAKE',
        question: 'How many patient records are potentially affected?',
        required: true,
        type: 'text',
      },
      {
        id: 'ir_q_hipaa3',
        section: 'IR_INTAKE',
        question: 'Was the PHI encrypted at rest and in transit at the time of the incident? (Encryption is a safe harbor under HIPAA breach notification.)',
        required: true,
        type: 'select',
        options: ['Fully encrypted', 'Partially encrypted', 'Not encrypted', 'Unknown'],
      },
      {
        id: 'ir_q_hipaa4',
        section: 'IR_INTAKE',
        question: 'Has the HIPAA Privacy Officer been notified to initiate the breach determination process per 45 CFR 164.402?',
        required: true,
        type: 'select',
        options: ['Yes', 'No', 'Not applicable'],
      }
    );
  }

  // Legal sector — client notification and privilege considerations
  if (sector === 'legal') {
    questions.push(
      {
        id: 'ir_q_legal1',
        section: 'IR_INTAKE',
        question: 'Does this incident potentially affect client files or attorney-client privileged communications?',
        required: true,
        type: 'select',
        options: ['Yes — confirmed client data affected', 'Possibly — under investigation', 'No client data involved'],
      },
      {
        id: 'ir_q_legal2',
        section: 'IR_INTAKE',
        question: 'Are there any active matters with court-ordered data preservation obligations that may be impacted?',
        required: true,
        type: 'select',
        options: ['Yes', 'No', 'Under review'],
      },
      {
        id: 'ir_q_legal3',
        section: 'IR_INTAKE',
        question: 'Has outside counsel (separate from the firm) been engaged to maintain privilege over the IR investigation?',
        required: true,
        type: 'select',
        options: ['Yes', 'No — planning to engage', 'No — not needed', 'Under consideration'],
      },
      {
        id: 'ir_q_legal4',
        section: 'IR_INTAKE',
        question: 'Do any affected clients require individual notification under state bar ethics rules or engagement letter terms?',
        required: true,
        type: 'select',
        options: ['Yes', 'Under review', 'No'],
      }
    );
  }

  // Containment checklist based on severity
  const containmentChecklist: string[] = [
    'Isolate affected systems from the network',
    'Preserve forensic evidence (do NOT reboot or wipe affected systems)',
    'Change credentials for all potentially compromised accounts',
    'Review and save relevant log files',
    'Document all actions taken with timestamps',
  ];

  if (severity === 'critical' || severity === 'high') {
    containmentChecklist.push(
      'Notify executive leadership and legal counsel immediately',
      'Contact cyber insurance carrier breach hotline',
      'Engage external forensics firm if not already retained',
      'Prepare initial regulatory notification drafts',
      'Activate out-of-band communication channel for IR team'
    );
  }

  if (severity === 'critical') {
    containmentChecklist.push(
      'Consider full network isolation if lateral movement is confirmed',
      'Prepare public communication / holding statement',
      'Brief the board of directors or governing body'
    );
  }

  return { questions, containmentChecklist };
}

/**
 * POST /api/v1/ir/start
 * Start an Incident Response walkthrough session.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    // Auth — Supabase Auth with explicit verification
    const { user, tenantId } = await requireAuth();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const db = getSupabaseAdmin();

    // Validate input
    const body = await request.json();
    const parseResult = IRStartSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    const { incidentType, severity, description } = parseResult.data;

    // Load org profile for sector-specific questions
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('sector')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? null;

    // Create assessment session for the IR walkthrough
    const irSessionId = uuidv4();
    const now = new Date().toISOString();

    const { data: irSession, error: sessionCreateError } = await db
      .from('assessment_sessions')
      .insert({
        id: irSessionId,
        tenant_id: tenantId,
        user_id: user.id,
        status: 'in_progress',
        current_section: 'IR_INTAKE',
        progress_pct: 0,
        gaps: [] as any,
        started_at: now,
        metadata: {
          type: 'ir_walkthrough',
          incidentType,
          severity,
          description,
        } as any,
      } as any)
      .select()
      .single();

    if (sessionCreateError) {
      logger.error('Failed to create IR session', { requestId, error: sessionCreateError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create IR session', errorId: requestId },
        { status: 500 }
      );
    }

    // Generate intake questions and containment checklist
    const { questions, containmentChecklist } = generateIntakeQuestions(incidentType, severity, sector);

    // Log audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'ir_walkthrough_started',
      event_data: {
        irSessionId,
        incidentType,
        severity,
        sector,
        questionCount: questions.length,
      } as any,
    } as any);

    logger.info('IR walkthrough session started', {
      requestId,
      irSessionId,
      tenantId: tenantId,
      incidentType,
      severity,
      sector,
    });

    return NextResponse.json(
      {
        sessionId: irSessionId,
        status: 'in_progress',
        currentSection: 'IR_INTAKE',
        incidentType,
        severity,
        description,
        startedAt: now,
        questions,
        containmentChecklist,
        phases: [
          { phase: 'Intake & Triage', status: 'active' },
          { phase: 'Containment', status: 'pending' },
          { phase: 'Eradication & Recovery', status: 'pending' },
          { phase: 'Post-Incident Review', status: 'pending' },
        ],
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in POST /ir/start', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
