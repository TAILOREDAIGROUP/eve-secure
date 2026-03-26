import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { routeAndCall } from '@/lib/ai/router';
import { hybridSearch } from '@/lib/ai/rag/pipeline';
import { getSystemPrompt } from '@/lib/ai/prompts/system';
import type { COIBriefData } from '@/lib/pdf/coi-brief';


/**
 * Sector-specific financial exposure defaults (USD).
 * Based on IBM Cost of a Data Breach 2024, Ponemon Institute, and HHS OCR data.
 */
const SECTOR_FINANCIAL_DEFAULTS: Record<string, {
  avgBreachCost: number;
  maxRegulatoryPenalty: number;
  avgDowntimeCost: number;
  avgReputationCost: number;
  insuranceNote: string;
}> = {
  healthcare: {
    avgBreachCost: 10_930_000,
    maxRegulatoryPenalty: 2_000_000,
    avgDowntimeCost: 1_200_000,
    avgReputationCost: 3_500_000,
    insuranceNote: 'Healthcare organizations without MFA, encryption, and documented incident response plans face 30-50% higher cyber insurance premiums. Some carriers now require all three as prerequisites for coverage. HIPAA breach notification costs ($50-150 per affected individual) are excluded from many standard policies.',
  },
  legal: {
    avgBreachCost: 5_720_000,
    maxRegulatoryPenalty: 500_000,
    avgDowntimeCost: 800_000,
    avgReputationCost: 4_000_000,
    insuranceNote: 'Law firms face elevated premiums due to high-value client data and privilege exposure. Carriers increasingly require email security, MFA, and documented policies. A breach involving attorney-client privileged data can result in malpractice claims that exceed standard E&O coverage limits.',
  },
  default: {
    avgBreachCost: 4_880_000,
    maxRegulatoryPenalty: 250_000,
    avgDowntimeCost: 500_000,
    avgReputationCost: 1_500_000,
    insuranceNote: 'Organizations without basic security controls (MFA, backups, incident response plan) face significantly higher cyber insurance premiums and may be denied coverage entirely. Proactive security investments reduce both premium costs and claim likelihood.',
  },
};

/**
 * Generate executive summary via LLM with RAG context.
 * Falls back to template if LLM fails.
 */
async function generateExecutiveSummary(args: {
  orgName: string;
  sector: string;
  tierRating: number;
  topGaps: COIBriefData['topGaps'];
  totalExposure: number;
  tenantId: string;
}): Promise<{ summary: string; generatedBy: 'llm' | 'template' }> {
  const { orgName, sector, tierRating, topGaps, totalExposure, tenantId } = args;

  try {
    const searchResult = await hybridSearch(`${sector} cybersecurity risk financial exposure breach cost`, 4);
    const ragContext = searchResult.items.map(i => `[${i.source}] ${i.content}`).join('\n');

    const prompt = `Write a 3-4 sentence executive summary for a Cost of Inaction Brief for ${orgName} (${sector} sector, NIST Tier ${tierRating}/4).

Top gaps: ${topGaps.map(g => g.title).join(', ')}
Total estimated annual financial exposure: $${totalExposure.toLocaleString()}

${ragContext ? `Context:\n${ragContext}\n` : ''}

The summary must:
1. Open with the organization's current risk posture level
2. Quantify the financial exposure in plain language
3. Name the single highest-priority action
4. Close with urgency appropriate to the tier rating

Write in a professional, board-ready tone. Do not use jargon. Respond with ONLY the summary text.`;

    const result = await routeAndCall({
      query: prompt,
      systemPrompt: getSystemPrompt(),
      tenantId,
    });

    if (!result.degraded && result.content.length > 50) {
      return { summary: result.content.trim(), generatedBy: 'llm' };
    }
    throw new Error('LLM response too short or degraded');
  } catch (error) {
    logger.warn('LLM executive summary failed, using template', {
      error: error instanceof Error ? error.message : String(error),
    });

    const summary = `${orgName} currently operates at NIST Cybersecurity Framework Tier ${tierRating} out of 4, indicating ${tierRating <= 1 ? 'significant' : 'moderate'} gaps in security posture. Based on industry benchmarks for the ${sector} sector, the estimated annual financial exposure from current security gaps is approximately $${totalExposure.toLocaleString()}. The highest-priority action is ${topGaps[0]?.title ?? 'implementing foundational security controls'}, which addresses the most critical vulnerability. ${tierRating <= 2 ? 'Immediate action is strongly recommended to reduce exposure before the next insurance renewal or regulatory review.' : 'Continued investment in security maturity will further reduce organizational risk.'}`;

    return { summary, generatedBy: 'template' };
  }
}

/**
 * GET /api/v1/plan/[planId]/coi-brief
 * Generate a Cost of Inaction Brief PDF for the given action plan.
 * Returns JSON data for the brief (PDF rendering happens client-side or via separate endpoint).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { planId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const { planId } = params;
    const db = getSupabaseAdmin();

    // Fetch plan with tenant verification
    const { data: plan, error: planError } = await db
      .from('action_plans')
      .select('*')
      .eq('id', planId)
      .eq('tenant_id', tenantId)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Action plan not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Fetch assessment session for tier rating and gaps
    const { data: session } = await db
      .from('assessment_sessions')
      .select('tier_rating, gaps, completed_at')
      .eq('id', plan.session_id)
      .eq('tenant_id', tenantId)
      .single();

    // Fetch org profile
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const orgName = orgProfile?.org_name ?? 'Organization';
    const tierRating = session?.tier_rating ?? 1;
    const assessmentDate = session?.completed_at
      ? new Date(session.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    // Extract top 3 gaps from plan recommendations
    const recommendations = Array.isArray(plan.recommendations) ? plan.recommendations as any[] : [];
    const topGaps: COIBriefData['topGaps'] = recommendations.slice(0, 3).map((item: any, idx: number) => ({
      rank: idx + 1,
      title: item.title ?? `Gap ${idx + 1}`,
      description: item.description ?? '',
      complianceTags: Array.isArray(item.complianceTags) ? item.complianceTags : [],
      estimatedCost: item.estimatedCost ?? 5000,
    }));

    // Calculate financial exposure
    const sectorDefaults = SECTOR_FINANCIAL_DEFAULTS[sector] ?? SECTOR_FINANCIAL_DEFAULTS['default']!;

    // Scale breach cost by tier (lower tier = higher risk multiplier)
    const tierMultiplier = tierRating <= 1 ? 1.0 : tierRating === 2 ? 0.7 : tierRating === 3 ? 0.4 : 0.2;

    const financialExposure: COIBriefData['financialExposure'] = {
      estimatedBreachCost: Math.round(sectorDefaults.avgBreachCost * tierMultiplier),
      regulatoryPenalties: Math.round(sectorDefaults.maxRegulatoryPenalty * tierMultiplier),
      businessDowntimeCost: Math.round(sectorDefaults.avgDowntimeCost * tierMultiplier),
      reputationDamage: Math.round(sectorDefaults.avgReputationCost * tierMultiplier),
      totalAnnualExposure: 0,
    };
    financialExposure.totalAnnualExposure =
      financialExposure.estimatedBreachCost +
      financialExposure.regulatoryPenalties +
      financialExposure.businessDowntimeCost +
      financialExposure.reputationDamage;

    // Generate executive summary via LLM
    const { summary: llmExecutiveSummary, generatedBy } = await generateExecutiveSummary({
      orgName,
      sector,
      tierRating,
      topGaps,
      totalExposure: financialExposure.totalAnnualExposure,
      tenantId,
    });

    const briefData: COIBriefData = {
      organizationName: orgName,
      sector,
      assessmentDate,
      tierRating,
      topGaps,
      financialExposure,
      insuranceImpact: sectorDefaults.insuranceNote,
      llmExecutiveSummary,
      generatedBy,
    };

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'coi_brief.generated',
      event_data: {
        planId,
        totalExposure: financialExposure.totalAnnualExposure,
        topGapCount: topGaps.length,
        generatedBy,
      } as any,
    } as any);

    logger.info('COI Brief generated', {
      requestId,
      planId,
      sector,
      tierRating,
      totalExposure: financialExposure.totalAnnualExposure,
      generatedBy,
    });

    return NextResponse.json(briefData);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /plan/[planId]/coi-brief', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
