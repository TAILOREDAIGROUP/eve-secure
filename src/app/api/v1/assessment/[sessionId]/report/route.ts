import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { routeAndCall } from '@/lib/ai/router';
import { hybridSearch } from '@/lib/ai/rag/pipeline';
import { getAssessmentPrompt } from '@/lib/ai/prompts/system';
import type { AssessmentReportData } from '@/lib/pdf/assessment-report';


/**
 * NIST CSF 2.0 categories for scoring
 */
const NIST_CATEGORIES = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'] as const;

/**
 * Calculate category score and tier from response count and quality signals.
 * Uses response count as a proxy for coverage depth.
 */
function scoreCategoryFromResponses(
  responses: any[],
  category: string
): { score: number; tier: number; questionCount: number; status: 'critical' | 'needs-improvement' | 'adequate' | 'strong' } {
  const catResponses = responses.filter((r: any) => r.section === category);
  const questionCount = catResponses.length;

  // Score heuristic: more responses = deeper coverage = higher score
  // Base: 20 + 15 per response, capped at 95
  const rawScore = Math.min(95, 20 + questionCount * 15);
  const score = questionCount === 0 ? 0 : rawScore;

  // Map score to tier
  const tier = score >= 80 ? 4 : score >= 60 ? 3 : score >= 30 ? 2 : score > 0 ? 1 : 0;

  // Status
  const status = score === 0 ? 'critical'
    : score < 40 ? 'needs-improvement'
    : score < 70 ? 'adequate'
    : 'strong';

  return { score, tier, questionCount, status };
}

/**
 * Extract findings from assessment responses and gaps.
 */
function extractFindings(
  responses: any[],
  gaps: any[],
  sector: string
): AssessmentReportData['findings'] {
  const findings: AssessmentReportData['findings'] = [];
  let id = 1;

  // Generate findings from categories with low coverage
  for (const category of NIST_CATEGORIES) {
    const catResponses = responses.filter((r: any) => r.section === category);
    if (catResponses.length === 0) {
      findings.push({
        id: id++,
        title: `No assessment data for ${category} function`,
        category,
        severity: 'critical',
        description: `The ${category} function of NIST CSF 2.0 was not assessed. This represents a significant blind spot in security posture visibility.`,
        complianceTags: [`NIST CSF 2.0 — ${category}`],
        recommendation: `Complete the ${category} section of the assessment to identify specific gaps and remediation priorities.`,
      });
    } else if (catResponses.length < 2) {
      findings.push({
        id: id++,
        title: `Incomplete assessment of ${category} function`,
        category,
        severity: 'high',
        description: `Only ${catResponses.length} question(s) answered in the ${category} function. Deeper assessment needed for accurate posture evaluation.`,
        complianceTags: [`NIST CSF 2.0 — ${category}`],
        recommendation: `Continue the assessment in the ${category} section to achieve comprehensive coverage.`,
      });
    }
  }

  // Add gap-driven findings
  if (Array.isArray(gaps)) {
    for (const gap of gaps.slice(0, 5)) {
      if (typeof gap === 'object' && gap?.section) {
        findings.push({
          id: id++,
          title: gap.title ?? `Gap in ${gap.section}`,
          category: gap.section,
          severity: gap.severity ?? 'medium',
          description: gap.description ?? `Identified gap in the ${gap.section} function based on assessment responses.`,
          complianceTags: gap.complianceTags ?? [`NIST CSF ${gap.section}`],
          recommendation: gap.recommendation ?? 'Address this gap as part of the remediation plan.',
        });
      }
    }
  }

  // Add sector-specific common findings
  if (sector === 'healthcare' && !findings.some(f => f.title.includes('HIPAA'))) {
    findings.push({
      id: id++,
      title: 'HIPAA Security Risk Assessment may be overdue',
      category: 'IDENTIFY',
      severity: 'high',
      description: 'HIPAA requires periodic security risk assessments (45 CFR 164.308(a)(1)). Based on assessment responses, it is unclear if a formal risk assessment has been completed recently.',
      complianceTags: ['HIPAA 164.308(a)(1)', 'NIST CSF ID.RA', 'OCR Audit Protocol'],
      recommendation: 'Conduct or update a formal HIPAA Security Risk Assessment within the next 90 days.',
    });
  }

  if (sector === 'legal' && !findings.some(f => f.title.includes('privilege'))) {
    findings.push({
      id: id++,
      title: 'Attorney-client privilege protection controls should be verified',
      category: 'PROTECT',
      severity: 'high',
      description: 'Law firms have heightened obligations to protect client confidential information and privileged communications (ABA Rule 1.6, Formal Opinion 477R).',
      complianceTags: ['ABA Rule 1.6', 'ABA Formal Opinion 477R', 'NIST CSF PR.DS'],
      recommendation: 'Verify that access controls, encryption, and audit logging are in place for all client matter files and privileged communications.',
    });
  }

  return findings.sort((a, b) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
  });
}

/**
 * Generate default next steps based on tier rating and sector.
 */
function getDefaultNextSteps(tierRating: number, sector: string): string[] {
  const steps: string[] = [];

  if (tierRating <= 2) {
    steps.push('Schedule a follow-up session to complete any incomplete assessment sections within 30 days.');
    steps.push('Implement the top 3 remediation actions from the plan (starting with MFA deployment).');
    steps.push('Establish a quarterly security review cadence with designated personnel.');
  }

  if (sector === 'healthcare') {
    steps.push('Ensure a current HIPAA Security Risk Assessment is on file — required annually by OCR.');
    steps.push('Review Business Associate Agreements (BAAs) with all vendors accessing ePHI.');
  } else if (sector === 'legal') {
    steps.push('Review and document technology competence obligations under ABA Model Rule 1.1 Comment 8.');
    steps.push('Verify ethical wall controls and audit logging on document management systems.');
  }

  steps.push('Share this report with executive leadership and the board (or equivalent governance body).');
  steps.push('Contact EVE Secure to schedule a reassessment in 90 days to measure improvement.');

  return steps;
}

/**
 * Generate executive summary via LLM. Falls back to template.
 */
async function generateReportSummary(args: {
  orgName: string;
  sector: string;
  tierRating: number;
  overallScore: number;
  findingCount: number;
  criticalCount: number;
  tenantId: string;
}): Promise<{ summary: string; generatedBy: 'llm' | 'template' }> {
  const { orgName, sector, tierRating, overallScore, findingCount, criticalCount, tenantId } = args;

  try {
    const searchResult = await hybridSearch(`${sector} cybersecurity assessment report executive summary`, 4);
    const ragContext = searchResult.items.map(i => `[${i.source}] ${i.content}`).join('\n');

    const prompt = `Write a 4-5 sentence executive summary for a cybersecurity assessment report for ${orgName} (${sector} sector).

Key metrics:
- Overall score: ${overallScore}/100
- NIST CSF Tier: ${tierRating}/4
- Total findings: ${findingCount} (${criticalCount} critical)

${ragContext ? `Context:\n${ragContext}\n` : ''}

The summary must:
1. State the overall security posture in business terms
2. Highlight the most significant risk area
3. Quantify the gap between current and target state
4. Close with the recommended course of action
5. Be written for a non-technical executive audience

Respond with ONLY the summary text.`;

    const result = await routeAndCall({
      query: prompt,
      systemPrompt: getAssessmentPrompt(),
      tenantId,
    });

    if (!result.degraded && result.content.length > 80) {
      return { summary: result.content.trim(), generatedBy: 'llm' };
    }
    throw new Error('LLM response insufficient');
  } catch {
    const summary = `${orgName} currently operates at NIST Cybersecurity Framework Tier ${tierRating} out of 4, with an overall security posture score of ${overallScore}/100. The assessment identified ${findingCount} findings, including ${criticalCount} critical issues requiring immediate attention. ${tierRating <= 2 ? 'The organization has significant gaps in foundational security controls that leave it vulnerable to common attack vectors.' : 'While foundational controls are in place, there are opportunities to strengthen detection and response capabilities.'} We recommend prioritizing the top 3 remediation actions in the accompanying plan and scheduling a reassessment within 90 days to measure improvement.`;
    return { summary, generatedBy: 'template' };
  }
}

/**
 * GET /api/v1/assessment/[sessionId]/report
 * Generate assessment report data for PDF rendering.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();
    const { sessionId } = params;
    const db = getSupabaseAdmin();

    // Fetch session with tenant verification
    const { data: session, error: sessionError } = await db
      .from('assessment_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Assessment session not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Fetch all responses
    const { data: responses } = await db
      .from('assessment_responses')
      .select('id, section, question_text, response_text, created_at')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    // Fetch org profile
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    // Fetch action plan if exists
    const { data: plan } = await db
      .from('action_plans')
      .select('recommendations, total_cost_estimate')
      .eq('session_id', sessionId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'Organization';
    const allResponses = responses ?? [];
    const gaps = Array.isArray(session.gaps) ? session.gaps : [];

    // Calculate category scores
    const categoryScores = NIST_CATEGORIES.map(category => {
      const result = scoreCategoryFromResponses(allResponses, category);
      return { category, ...result };
    });

    // Overall score = weighted average of category scores
    const answeredCategories = categoryScores.filter(c => c.questionCount > 0);
    const overallScore = answeredCategories.length > 0
      ? Math.round(answeredCategories.reduce((sum, c) => sum + c.score, 0) / answeredCategories.length)
      : 0;

    const tierRating = session.tier_rating ?? (overallScore >= 80 ? 4 : overallScore >= 60 ? 3 : overallScore >= 30 ? 2 : 1);

    // Extract findings
    const findings = extractFindings(allResponses, gaps, sector);
    const criticalCount = findings.filter(f => f.severity === 'critical').length;

    // Build remediation plan from action_plans table
    const recommendations = Array.isArray(plan?.recommendations) ? plan.recommendations as any[] : [];
    const remediationPlan = recommendations.map((item: any, idx: number) => ({
      rank: idx + 1,
      title: item.title ?? `Action ${idx + 1}`,
      estimatedCost: item.estimatedCost ?? 0,
      timeToImplement: item.timeToImplement ?? 'TBD',
      difficulty: item.difficulty ?? 'medium',
      complianceTags: Array.isArray(item.complianceTags) ? item.complianceTags : [],
    }));

    // Generate executive summary
    const { summary: executiveSummary, generatedBy } = await generateReportSummary({
      orgName,
      sector,
      tierRating,
      overallScore,
      findingCount: findings.length,
      criticalCount,
      tenantId,
    });

    const assessmentDate = session.started_at
      ? new Date(session.started_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : 'N/A';
    const completedDate = session.completed_at
      ? new Date(session.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const reportData: AssessmentReportData = {
      organizationName: orgName,
      sector,
      assessmentDate,
      completedDate,
      tierRating,
      overallScore,
      executiveSummary,
      categoryScores,
      findings,
      remediationPlan,
      nextSteps: getDefaultNextSteps(tierRating, sector),
      generatedBy,
    };

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'assessment_report.generated',
      event_data: {
        sessionId,
        overallScore,
        tierRating,
        findingCount: findings.length,
        criticalCount,
        generatedBy,
      } as any,
    } as any);

    logger.info('Assessment report generated', {
      requestId,
      sessionId,
      overallScore,
      tierRating,
      findingCount: findings.length,
      criticalCount,
      generatedBy,
    });

    return NextResponse.json(reportData);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /assessment/[sessionId]/report', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
