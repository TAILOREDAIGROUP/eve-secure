import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * POST /api/v1/tabletop
 * Generate custom tabletop exercise from org profile + threat context
 */

const TabletopRequestSchema = z.object({
  scenarioType: z.enum(['ransomware', 'phishing', 'insider_threat', 'supply_chain', 'data_breach', 'custom']),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  duration: z.enum(['30min', '60min', '90min', '120min']),
  participants: z.array(z.string()).min(1).max(30),
  customScenario: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const db = getSupabaseAdmin();
    const { data: user } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (!user) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'User not found', errorId: requestId },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = TabletopRequestSchema.parse(body);

    // Load org profile for sector-specific scenarios
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', user.tenant_id)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'Organization';
    const tools = (orgProfile?.current_tools as string[]) ?? [];

    // Generate sector-specific tabletop exercise
    const exercise = generateTabletopExercise(
      validated.scenarioType,
      validated.difficulty,
      validated.duration,
      validated.participants,
      sector,
      orgName,
      tools,
      validated.customScenario
    );

    // Store as generated document
    const docId = uuidv4();
    await db.from('generated_documents').insert({
      id: docId,
      tenant_id: user.tenant_id,
      session_id: docId, // self-referencing for tabletops without assessment
      doc_type: 'tabletop',
      s3_key: `tabletop/${user.tenant_id}/${docId}.json`,
      file_name: `tabletop-${validated.scenarioType}-${new Date().toISOString().split('T')[0]}.json`,
    } as any);

    await db.from('audit_events').insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'tabletop_generated',
      event_data: { scenarioType: validated.scenarioType, difficulty: validated.difficulty, requestId },
    } as any);

    logger.info('Tabletop exercise generated', {
      tenantId: user.tenant_id,
      scenarioType: validated.scenarioType,
      requestId,
    });

    return NextResponse.json({ documentId: docId, exercise, generatedBy: 'template' }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation Error', message: error.errors.map((e) => `${e.path}: ${e.message}`).join('; '), errorId: requestId },
        { status: 400 }
      );
    }
    logger.error('Tabletop generation error', { error: error instanceof Error ? error.message : 'unknown', requestId });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}

function generateTabletopExercise(
  scenarioType: string,
  difficulty: string,
  duration: string,
  participants: string[],
  sector: string,
  orgName: string,
  tools: string[],
  customScenario?: string
) {
  const scenarioTemplates: Record<string, Record<string, { narrative: string; injects: Array<{ time: string; event: string; action: string }> }>> = {
    healthcare: {
      ransomware: {
        narrative: `It's Monday morning at ${orgName}. The IT help desk receives multiple calls from clinical staff reporting they cannot access the EHR system${tools.includes('Epic EHR') ? ' (Epic)' : ''}. Screens display a ransom note demanding $500,000 in Bitcoin. Patient records, lab results, and imaging systems are encrypted. The ED is currently treating 15 patients, and surgeries are scheduled to begin in 2 hours.`,
        injects: [
          { time: '0:00', event: 'EHR systems go down across all departments', action: 'Determine scope of impact and activate IR plan' },
          { time: '0:15', event: 'Local news station calls asking about "hospital computer problems"', action: 'Coordinate public communications response' },
          { time: '0:30', event: 'Attacker sends second message: "We have 50,000 patient records. Pay in 48 hours or we publish."', action: 'Assess HIPAA breach notification obligations under §164.402' },
          { time: '0:45', event: 'CMS regional office calls asking about potential impact on Medicare patients', action: 'Brief leadership on regulatory reporting requirements' },
          { time: '1:00', event: 'Backup restoration attempted — backups encrypted too (connected network share)', action: 'Evaluate offline backup availability and recovery options' },
        ],
      },
      phishing: {
        narrative: `A billing specialist at ${orgName} receives an email appearing to be from the CEO requesting an urgent wire transfer for a "confidential acquisition." The email looks legitimate but was sent from a spoofed domain. The specialist processes the $75,000 transfer before realizing the email may be fraudulent.`,
        injects: [
          { time: '0:00', event: 'Finance team discovers the wire transfer was sent to a fraudulent account', action: 'Contact bank immediately to attempt wire recall' },
          { time: '0:15', event: 'IT discovers the CEO\'s email account was compromised last week', action: 'Determine scope of email compromise and affected accounts' },
          { time: '0:30', event: 'Compromised email account had ePHI attachments in sent mail', action: 'Assess potential HIPAA breach and notification requirements' },
          { time: '0:45', event: 'Three other employees report receiving similar suspicious emails', action: 'Issue organization-wide alert and begin phishing awareness response' },
        ],
      },
    },
    legal: {
      ransomware: {
        narrative: `It's Tuesday at ${orgName}. Attorneys arrive to find the DMS${tools.includes('NetDocuments') ? ' (NetDocuments)' : ''} is inaccessible. Ransomware has encrypted client files, matter management data, and trust account records. A major trial starts in 3 days, and settlement negotiations for a $10M case are in final stages. The ransom demand is $250,000.`,
        injects: [
          { time: '0:00', event: 'DMS and email systems encrypted, all client files inaccessible', action: 'Activate IR plan and assess scope of encrypted systems' },
          { time: '0:15', event: 'Lead attorney on the $10M case needs settlement documents TODAY', action: 'Identify alternative access to critical case files' },
          { time: '0:30', event: 'Attacker threatens to publish client files from corporate M&A matters', action: 'Assess privilege implications and client notification obligations under ABA Model Rule 1.4' },
          { time: '0:45', event: 'State bar disciplinary office calls about potential ethics violations', action: 'Brief ethics counsel on disclosure obligations' },
          { time: '1:00', event: 'IOLTA/trust account records may be compromised', action: 'Contact banking partners and assess fiduciary obligations' },
        ],
      },
      phishing: {
        narrative: `A paralegal at ${orgName} clicks a link in an email appearing to be from the court e-filing system. The link installs malware that begins exfiltrating documents from the DMS. The firm handles sensitive corporate M&A, IP litigation, and family law matters.`,
        injects: [
          { time: '0:00', event: 'IT detects unusual outbound data transfers from paralegal\'s workstation', action: 'Isolate the affected workstation and begin forensic analysis' },
          { time: '0:15', event: 'Exfiltrated data includes files from active M&A due diligence matters', action: 'Assess insider trading implications and SEC notification requirements' },
          { time: '0:30', event: 'Opposing counsel in a litigation matter asks about "unusual documents" received anonymously', action: 'Assess privilege waiver risks and client notification obligations' },
          { time: '0:45', event: 'Family law client data including financial records and custody documents accessed', action: 'Determine individual notification obligations under state breach laws' },
        ],
      },
    },
  };

  const sectorScenarios = scenarioTemplates[sector] ?? scenarioTemplates['healthcare']!;
  const template = sectorScenarios[scenarioType] ?? sectorScenarios['ransomware']!;

  // Adjust injects based on duration
  const durationMinutes = parseInt(duration);
  const maxInjects = Math.min(template.injects.length, Math.floor(durationMinutes / 15));

  // Generate discussion questions
  const discussionQuestions = [
    'What was the first action you would take upon learning of this incident?',
    'Who needs to be notified within the first hour? What is the notification chain?',
    'What regulatory obligations are triggered by this scenario?',
    `How would ${orgName}'s current tools and controls have prevented or mitigated this?`,
    'Where did the response process break down? What would you do differently?',
    'What is the estimated financial impact of this incident?',
    `How would this incident affect ${orgName}'s insurance coverage and premiums?`,
  ];

  // Generate evaluation rubric
  const rubric = {
    categories: [
      { name: 'Detection Speed', weight: 20, criteria: 'How quickly was the incident identified and escalated?' },
      { name: 'Communication', weight: 20, criteria: 'Were all stakeholders notified appropriately and timely?' },
      { name: 'Technical Response', weight: 25, criteria: 'Were containment and eradication steps executed correctly?' },
      { name: 'Regulatory Compliance', weight: 20, criteria: 'Were all notification obligations identified and met?' },
      { name: 'Business Continuity', weight: 15, criteria: 'Were critical business functions maintained during response?' },
    ],
    scoringScale: '1-5 (1=Not Addressed, 2=Partially Addressed, 3=Adequately Addressed, 4=Well Addressed, 5=Excellently Addressed)',
  };

  return {
    title: `Tabletop Exercise: ${scenarioType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} Scenario`,
    organization: orgName,
    sector,
    scenarioType,
    difficulty,
    duration,
    participants,
    narrative: customScenario || template.narrative,
    injects: template.injects.slice(0, maxInjects),
    discussionQuestions,
    evaluationRubric: rubric,
    facilitatorGuide: {
      preparation: [
        'Distribute scenario narrative to participants 24 hours in advance',
        'Prepare a conference room with whiteboard and markers',
        'Print copies of the organization\'s current IR plan for reference',
        'Assign a note-taker to document all decisions and action items',
      ],
      rules: [
        'No wrong answers — this is a learning exercise',
        'Assume all events are real during the exercise',
        'Focus on process and decision-making, not technical details',
        'Designate one person to track time and introduce injects',
      ],
      debrief: [
        'What went well during the exercise?',
        'What gaps in our current plan did this reveal?',
        'What specific actions will we take to address identified gaps?',
        'When should we conduct the next exercise?',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}
