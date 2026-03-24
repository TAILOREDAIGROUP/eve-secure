import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /\{\{.*\}\}/,
  /\$\{.*\}/,
  /<iframe/i,
  /<object/i,
  /<embed/i,
];

function containsDangerousInput(value: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(value));
}

const DocumentGenerateSchema = z.object({
  sessionId: z.string().uuid(),
  docType: z.enum(['cost_of_inaction', 'assessment_report']),
});

/**
 * Generate cost-of-inaction content from assessment data.
 */
function generateCostOfInactionContent(
  gaps: any[],
  orgProfile: any,
  tierRating: number | null
): Record<string, any> {
  const topGaps = (Array.isArray(gaps) ? gaps : []).slice(0, 3).map((g: any) => ({
    section: g?.section ?? 'Unknown',
    title: g?.title ?? 'Identified gap',
    description: g?.description ?? 'Gap identified during assessment',
    riskLevel: g?.severity ?? 'high',
  }));

  const sector = orgProfile?.sector ?? 'general';
  const employeeCount = orgProfile?.employee_count ?? 50;

  // Estimated breach cost based on sector and size (IBM Cost of a Data Breach 2024 averages)
  const baseCostPerRecord = sector === 'healthcare' ? 10.93 : sector === 'legal' ? 9.48 : 4.88;
  const estimatedRecords = employeeCount * 500; // rough records-per-employee multiplier
  const estimatedBreachCost = Math.round(baseCostPerRecord * estimatedRecords);

  const regulatoryPenalties: Record<string, string> = {
    healthcare: 'HIPAA violations: $100-$50,000 per violation, up to $1.5M per category per year. OCR has levied multi-million dollar settlements.',
    legal: 'State bar disciplinary action, malpractice liability, potential disbarment for failure to protect client data per ABA Rules 1.1 and 1.6.',
    general: 'State breach notification costs ($1-$3 per record), potential FTC enforcement actions, state AG investigations.',
  };

  const insuranceImplications: Record<string, string> = {
    healthcare: 'Cyber insurance carriers increasingly require baseline controls. Failure to maintain MFA, backups, and IR plans may void coverage or trigger policy exclusions.',
    legal: 'Legal malpractice and cyber liability policies may deny claims if reasonable security measures were not in place. Trust account fraud coverage often conditional.',
    general: 'Premium increases of 50-300% at renewal. Coverage denial for known unaddressed vulnerabilities. Sub-limit reductions on ransomware coverage.',
  };

  return {
    title: 'Cost of Inaction Analysis',
    generatedAt: new Date().toISOString(),
    tierRating: tierRating ?? 1,
    topGaps,
    financialImpact: {
      estimatedBreachCost,
      costPerRecord: baseCostPerRecord,
      estimatedRecordsAtRisk: estimatedRecords,
      averageDowntimeDays: tierRating && tierRating >= 3 ? 5 : 21,
      downtimeCostPerDay: Math.round(employeeCount * 500),
    },
    regulatoryExposure: regulatoryPenalties[sector] ?? regulatoryPenalties.general,
    insuranceImplications: insuranceImplications[sector] ?? insuranceImplications.general,
    recommendation: 'Immediate action on the identified gaps will significantly reduce financial exposure and improve insurability.',
  };
}

/**
 * Generate assessment report content from assessment data.
 */
function generateAssessmentReportContent(
  assessmentSession: any,
  gaps: any[],
  orgProfile: any
): Record<string, any> {
  const sector = orgProfile?.sector ?? 'general';
  const tierRating = assessmentSession.tier_rating ?? 1;
  const tierLabels: Record<number, string> = {
    1: 'Partial — Significant gaps in cybersecurity posture',
    2: 'Risk Informed — Basic controls in place, notable gaps remain',
    3: 'Repeatable — Established processes with room for improvement',
    4: 'Adaptive — Mature, proactive cybersecurity program',
  };

  const complianceMapping: Record<string, string[]> = {
    healthcare: ['HIPAA Security Rule', 'HIPAA Privacy Rule', 'HITECH Act', 'NIST CSF 2.0', 'OCR Audit Protocol'],
    legal: ['ABA Model Rules 1.1, 1.6', 'ABA Formal Opinions 477R, 483', 'State Bar Ethics Rules', 'NIST CSF 2.0'],
    general: ['NIST CSF 2.0', 'CIS Controls v8', 'FTC Safeguards Rule'],
  };

  const gapList = (Array.isArray(gaps) ? gaps : []).map((g: any) => ({
    section: g?.section ?? 'Unknown',
    title: g?.title ?? 'Identified gap',
    description: g?.description ?? 'Gap identified during assessment',
    severity: g?.severity ?? 'medium',
    recommendation: g?.recommendation ?? 'Address this gap as part of remediation planning.',
  }));

  const actionItems = gapList.map((g, i) => ({
    priority: i + 1,
    title: `Remediate: ${g.title}`,
    section: g.section,
    severity: g.severity,
  }));

  return {
    title: 'Cybersecurity Assessment Report',
    generatedAt: new Date().toISOString(),
    executiveSummary: {
      organization: orgProfile?.name ?? 'Organization',
      sector,
      assessmentDate: assessmentSession.started_at,
      completedDate: assessmentSession.completed_at,
      overallTier: tierRating,
      tierDescription: tierLabels[tierRating] ?? tierLabels[1],
      totalGapsIdentified: gapList.length,
      criticalGaps: gapList.filter((g) => g.severity === 'critical' || g.severity === 'high').length,
    },
    tierRating: {
      current: tierRating,
      description: tierLabels[tierRating] ?? tierLabels[1],
      target: Math.min(4, tierRating + 1),
    },
    gaps: gapList,
    complianceMapping: complianceMapping[sector] ?? complianceMapping.general,
    actionItems,
    methodology: 'Assessment conducted using NIST Cybersecurity Framework 2.0 functions: Govern, Identify, Protect, Detect, Respond, Recover.',
  };
}

/**
 * GET /api/v1/documents
 * List generated documents for the current tenant with pagination.
 */
export async function GET(request: NextRequest) {
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

    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for clerk_id', { requestId, clerkId: session.userId });
      return NextResponse.json(
        { error: 'Forbidden', message: 'User record not found', errorId: requestId },
        { status: 403 }
      );
    }

    // Pagination params
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));
    const offset = (page - 1) * pageSize;

    // Count total for this tenant
    const { count, error: countError } = await db
      .from('generated_documents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', user.tenant_id);

    if (countError) {
      logger.error('Failed to count documents', { requestId, error: countError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve documents', errorId: requestId },
        { status: 500 }
      );
    }

    // Fetch page
    const { data: documents, error: docsError } = await db
      .from('generated_documents')
      .select('id, tenant_id, session_id, doc_type, status, file_name, s3_key, created_at, updated_at')
      .eq('tenant_id', user.tenant_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (docsError) {
      logger.error('Failed to fetch documents', { requestId, error: docsError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve documents', errorId: requestId },
        { status: 500 }
      );
    }

    logger.info('Listed documents', {
      requestId,
      tenantId: user.tenant_id,
      page,
      pageSize,
      total: count,
    });

    return NextResponse.json({
      items: documents,
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    logger.error('Unhandled error in GET /documents', {
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
 * POST /api/v1/documents
 * Generate a document (cost_of_inaction or assessment_report) from an assessment session.
 */
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

    // Resolve tenant
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for clerk_id', { requestId, clerkId: session.userId });
      return NextResponse.json(
        { error: 'Forbidden', message: 'User record not found', errorId: requestId },
        { status: 403 }
      );
    }

    // Validate input
    const body = await request.json();
    const parseResult = DocumentGenerateSchema.safeParse(body);
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

    const { sessionId, docType } = parseResult.data;

    // Input sanitization
    const rawValues = [sessionId, docType];
    for (const val of rawValues) {
      if (containsDangerousInput(val)) {
        logger.warn('Dangerous input detected in document generation', { requestId, value: val });
        return NextResponse.json(
          { error: 'Validation Error', message: 'Input contains disallowed characters or patterns', errorId: requestId },
          { status: 400 }
        );
      }
    }

    // Verify session belongs to tenant
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

    // Load gaps for this session
    const gaps = Array.isArray(assessmentSession.gaps) ? assessmentSession.gaps : [];

    // Load org profile
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', user.tenant_id)
      .single();

    // Generate content based on docType
    let content: Record<string, any>;
    let fileName: string;
    const dateStr = new Date().toISOString().split('T')[0];

    if (docType === 'cost_of_inaction') {
      content = generateCostOfInactionContent(gaps, orgProfile, assessmentSession.tier_rating);
      fileName = `cost-of-inaction-${dateStr}.pdf`;
    } else {
      content = generateAssessmentReportContent(assessmentSession, gaps, orgProfile);
      fileName = `assessment-report-${dateStr}.pdf`;
    }

    // Store document record
    const docId = uuidv4();
    const { data: doc, error: docError } = await db
      .from('generated_documents')
      .insert({
        id: docId,
        tenant_id: user.tenant_id,
        session_id: sessionId,
        doc_type: docType,
        status: 'generating',
        file_name: fileName,
        s3_key: `documents/${user.tenant_id}/${docId}/${fileName}`,
        content_json: content as any,
      } as any)
      .select()
      .single();

    if (docError) {
      logger.error('Failed to create document record', { requestId, error: docError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create document', errorId: requestId },
        { status: 500 }
      );
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'document.generation_started',
      event_data: { docId, sessionId, docType } as any,
    } as any);

    logger.info('Document generation started', {
      requestId,
      docId,
      sessionId,
      docType,
      tenantId: user.tenant_id,
    });

    return NextResponse.json(
      {
        id: docId,
        sessionId,
        docType,
        status: 'generating',
        fileName,
        createdAt: doc?.created_at ?? new Date().toISOString(),
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('Unhandled error in POST /documents', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
