import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

const PlanGenerateInputSchema = z.object({
  sessionId: z.string().uuid(),
});

interface ActionItem {
  rank: number;
  title: string;
  description: string;
  estimatedCost: number;
  difficulty: 'easy' | 'medium' | 'hard';
  timeToImplement: string;
  complianceTags: string[];
  insuranceTags: string[];
  businessImpact: string;
  status: 'not_started' | 'in_progress' | 'complete';
}

/**
 * Generate template action items based on assessment gaps and org profile.
 * The "Four Fundamentals" always appear as top 4 for Tier 1/2 orgs.
 */
function generateTemplateActionItems(
  gaps: any[],
  sector: string,
  tierRating: number | null,
  budgetRange: string | null
): { items: ActionItem[]; totalCost: number } {
  const tier = tierRating ?? 1;
  const items: ActionItem[] = [];

  // Four Fundamentals — always top 4 for Tier 1/2 orgs
  if (tier <= 2) {
    items.push(
      {
        rank: 1,
        title: 'Deploy Multi-Factor Authentication (MFA)',
        description: 'Enable MFA on all user accounts, starting with administrative and privileged accounts. Covers email, VPN, cloud services, and critical business applications.',
        estimatedCost: 2500,
        difficulty: 'easy',
        timeToImplement: '1-2 weeks',
        complianceTags: ['NIST CSF PR.AA', 'HIPAA 164.312(d)', 'ABA Rule 1.6'],
        insuranceTags: ['Required by 90% of cyber insurance carriers', 'Premium reduction eligible'],
        businessImpact: 'Blocks 99.9% of automated account compromise attacks. Single highest-ROI security control.',
        status: 'not_started',
      },
      {
        rank: 2,
        title: 'Implement Advanced Email Filtering',
        description: 'Deploy email security gateway with anti-phishing, attachment sandboxing, and impersonation detection. Configure DMARC, DKIM, and SPF records.',
        estimatedCost: 3600,
        difficulty: 'easy',
        timeToImplement: '1-2 weeks',
        complianceTags: ['NIST CSF PR.DS', 'NIST CSF DE.CM'],
        insuranceTags: ['Email security commonly required', 'Reduces phishing claim likelihood'],
        businessImpact: 'Phishing is the #1 attack vector for small organizations. Blocks 95%+ of malicious emails.',
        status: 'not_started',
      },
      {
        rank: 3,
        title: 'Establish Offline/Immutable Backups',
        description: 'Implement 3-2-1 backup strategy with at least one offline or immutable copy. Test restoration quarterly. Include critical databases, file shares, and configurations.',
        estimatedCost: 4800,
        difficulty: 'medium',
        timeToImplement: '2-4 weeks',
        complianceTags: ['NIST CSF PR.DS', 'NIST CSF RC.RP', 'HIPAA 164.308(a)(7)'],
        insuranceTags: ['Offline backups required by most carriers', 'Ransomware recovery prerequisite'],
        businessImpact: 'Enables recovery from ransomware without paying ransom. Reduces downtime from days to hours.',
        status: 'not_started',
      },
      {
        rank: 4,
        title: 'Create Incident Response Plan',
        description: 'Document IR procedures including detection, containment, eradication, recovery, and post-incident review. Define roles, communication chains, and external contacts (legal, forensics, insurance).',
        estimatedCost: 5000,
        difficulty: 'medium',
        timeToImplement: '2-4 weeks',
        complianceTags: ['NIST CSF RS.MA', 'HIPAA 164.308(a)(6)', 'ABA Formal Opinion 483'],
        insuranceTags: ['Required by virtually all cyber insurance policies', 'May reduce deductible'],
        businessImpact: 'Reduces breach cost by 58% (IBM Cost of a Data Breach 2024). Required for regulatory compliance.',
        status: 'not_started',
      }
    );
  }

  // Add sector-specific items
  if (sector === 'healthcare') {
    items.push(
      {
        rank: items.length + 1,
        title: 'Conduct HIPAA Security Risk Assessment',
        description: 'Perform a comprehensive risk assessment per 45 CFR 164.308(a)(1)(ii)(A). Document all ePHI data flows, identify threats and vulnerabilities, and assess current safeguards.',
        estimatedCost: 8000,
        difficulty: 'medium',
        timeToImplement: '4-6 weeks',
        complianceTags: ['HIPAA 164.308(a)(1)', 'NIST CSF ID.RA', 'OCR Audit Protocol'],
        insuranceTags: ['Risk assessment documentation supports claims', 'Demonstrates due diligence'],
        businessImpact: 'Required by HIPAA. OCR has levied $1M+ fines for failure to conduct. Foundation for all other controls.',
        status: 'not_started',
      },
      {
        rank: items.length + 2,
        title: 'Implement ePHI Encryption',
        description: 'Encrypt all electronic Protected Health Information at rest (AES-256) and in transit (TLS 1.2+). Includes laptops, servers, databases, and removable media.',
        estimatedCost: 6000,
        difficulty: 'medium',
        timeToImplement: '3-5 weeks',
        complianceTags: ['HIPAA 164.312(a)(2)(iv)', 'HIPAA 164.312(e)(1)', 'NIST CSF PR.DS'],
        insuranceTags: ['Encryption is a safe harbor under breach notification', 'Reduces claim exposure'],
        businessImpact: 'Encrypted data breaches are exempt from HIPAA breach notification requirements (safe harbor provision).',
        status: 'not_started',
      }
    );
  } else if (sector === 'legal') {
    items.push(
      {
        rank: items.length + 1,
        title: 'Secure Client File Access Controls',
        description: 'Implement role-based access controls on all client matter files. Enforce ethical walls where required. Enable audit logging on document management system.',
        estimatedCost: 7000,
        difficulty: 'medium',
        timeToImplement: '3-5 weeks',
        complianceTags: ['ABA Rule 1.6', 'ABA Formal Opinion 477R', 'NIST CSF PR.AA'],
        insuranceTags: ['Access controls required for legal malpractice coverage', 'Privilege protection'],
        businessImpact: 'Protects attorney-client privilege. Unauthorized access to client files can result in disbarment and malpractice claims.',
        status: 'not_started',
      },
      {
        rank: items.length + 2,
        title: 'Implement Trust Account Data Protection',
        description: 'Deploy enhanced security controls for IOLTA/trust account systems including dedicated MFA, transaction monitoring, and segregated backups.',
        estimatedCost: 5500,
        difficulty: 'medium',
        timeToImplement: '2-4 weeks',
        complianceTags: ['ABA Rule 1.15', 'State bar trust account rules', 'NIST CSF PR.DS'],
        insuranceTags: ['Trust account fraud coverage often conditional on controls', 'Wire fraud prevention'],
        businessImpact: 'Business email compromise targeting trust accounts is the #1 financial crime against law firms.',
        status: 'not_started',
      }
    );
  }

  // Add gap-driven items if gaps exist
  if (Array.isArray(gaps) && gaps.length > 0) {
    for (const gap of gaps.slice(0, 3)) {
      const gapSection = typeof gap === 'object' && gap?.section ? gap.section : 'GOVERN';
      items.push({
        rank: items.length + 1,
        title: `Address ${gapSection} gap: ${typeof gap === 'object' && gap?.title ? gap.title : 'Identified deficiency'}`,
        description: typeof gap === 'object' && gap?.description ? gap.description : `Remediate identified gap in the ${gapSection} function based on assessment findings.`,
        estimatedCost: 5000,
        difficulty: 'medium',
        timeToImplement: '3-6 weeks',
        complianceTags: [`NIST CSF ${gapSection}`],
        insuranceTags: ['Gap remediation demonstrates continuous improvement'],
        businessImpact: 'Addresses specific weakness identified during assessment.',
        status: 'not_started',
      });
    }
  }

  const totalCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);
  return { items, totalCost };
}

/**
 * Parse budget range string into a numeric value (upper bound).
 */
function parseBudgetConstraint(budgetRange: string | null): number | null {
  if (!budgetRange) return null;
  // Patterns like "$10,000-$25,000" or "25000" or "$50k"
  const cleaned = budgetRange.replace(/[$,k]/gi, '').trim();
  const parts = cleaned.split('-');
  const upper = parts[parts.length - 1]!.trim();
  const value = parseFloat(upper);
  if (isNaN(value)) return null;
  // If original had 'k', multiply
  if (budgetRange.toLowerCase().includes('k')) return value * 1000;
  return value;
}

/**
 * GET /api/v1/plan
 * List action plans for the current tenant.
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    const { data: plans, error: plansError } = await db
      .from('action_plans')
      .select('id, tenant_id, session_id, total_cost_estimate, budget_constraint, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (plansError) {
      logger.error('Failed to fetch action plans', { requestId, error: plansError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve plans', errorId: requestId },
        { status: 500 }
      );
    }

    logger.info('Listed action plans', { requestId, tenantId, count: plans?.length });

    return NextResponse.json({ items: plans ?? [] });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /plan', {
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
 * POST /api/v1/plan
 * Generate an action plan from a completed assessment session.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    // Validate input
    const body = await request.json();
    const parseResult = PlanGenerateInputSchema.safeParse(body);
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

    const { sessionId } = parseResult.data;

    // Verify assessment exists, belongs to tenant, and is completed
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

    if (assessmentSession.status !== 'completed') {
      return NextResponse.json(
        {
          error: 'Conflict',
          message: `Assessment must be completed before generating a plan. Current status: ${assessmentSession.status}`,
          errorId: requestId,
        },
        { status: 409 }
      );
    }

    // Load org profile for budget context
    const { data: orgProfile } = await db
      .from('org_profiles')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    const sector = orgProfile?.sector ?? 'healthcare';
    const budgetRange = orgProfile?.it_budget_range ?? null;
    const budgetConstraint = parseBudgetConstraint(budgetRange);

    // Extract gaps from session
    const gaps = Array.isArray(assessmentSession.gaps) ? assessmentSession.gaps : [];
    const tierRating = assessmentSession.tier_rating;

    // Generate template action items
    const { items, totalCost } = generateTemplateActionItems(gaps, sector, tierRating, budgetRange);

    // Store plan
    const planId = uuidv4();
    const { data: plan, error: planError } = await db
      .from('action_plans')
      .insert({
        id: planId,
        tenant_id: tenantId,
        session_id: sessionId,
        recommendations: items as any,
        total_cost_estimate: totalCost,
        budget_constraint: budgetConstraint,
      } as any)
      .select()
      .single();

    if (planError) {
      logger.error('Failed to create action plan', { requestId, error: planError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create plan', errorId: requestId },
        { status: 500 }
      );
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: tenantId,
      user_id: user.id,
      event_type: 'plan.generated',
      event_data: { planId, sessionId, itemCount: items.length, totalCost } as any,
    } as any);

    logger.info('Action plan generated', {
      requestId,
      planId,
      sessionId,
      itemCount: items.length,
      totalCost,
      budgetConstraint,
    });

    return NextResponse.json(
      {
        ...plan,
        recommendations: items,
        generatedBy: 'template',
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
    logger.error('Unhandled error in POST /plan', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
