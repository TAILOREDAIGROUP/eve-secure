import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { generateTemplateQuestion, type CSFSection } from '@/lib/ai/conversation-state';

/**
 * Onboarding context data used to seed the first assessment.
 */
export interface OnboardingContext {
  orgName: string;
  sector: string;
  employeeCount: number;
  state: string;
  currentTools: string[];
  itBudgetRange: string;
  hasCyberInsurance: boolean;
  carrierName?: string;
  ehrSystem?: string; // Healthcare
  dmsSystem?: string; // Legal
}

/**
 * Assessment seed result — contains the first question and session.
 */
export interface AssessmentSeedResult {
  sessionId: string;
  firstQuestion: string;
  firstSection: CSFSection;
  citations: string[];
  contextSummary: string;
}

/**
 * Build a context summary from onboarding data.
 * This seeds the assessment so the LLM has org context from the first question.
 */
export function buildOnboardingContextSummary(ctx: OnboardingContext): string {
  const parts: string[] = [];

  parts.push(`Organization: ${ctx.orgName}`);
  parts.push(`Sector: ${ctx.sector}`);
  parts.push(`Size: ${ctx.employeeCount} employees`);
  parts.push(`Location: ${ctx.state}`);
  parts.push(`IT Budget: ${ctx.itBudgetRange}`);

  if (ctx.currentTools.length > 0) {
    parts.push(`Current Security Tools: ${ctx.currentTools.join(', ')}`);
  } else {
    parts.push('Current Security Tools: None reported');
  }

  parts.push(`Cyber Insurance: ${ctx.hasCyberInsurance ? `Yes (${ctx.carrierName ?? 'carrier not specified'})` : 'No'}`);

  if (ctx.sector === 'healthcare' && ctx.ehrSystem) {
    parts.push(`EHR System: ${ctx.ehrSystem}`);
  }

  if (ctx.sector === 'legal' && ctx.dmsSystem) {
    parts.push(`Document Management System: ${ctx.dmsSystem}`);
  }

  // Add sector-specific risk flags
  if (ctx.sector === 'healthcare') {
    parts.push('\nRegulatory Context: HIPAA Security Rule applies. ePHI handling likely.');
    if (!ctx.hasCyberInsurance) {
      parts.push('Risk Flag: No cyber insurance — increased financial exposure from breaches.');
    }
  } else if (ctx.sector === 'legal') {
    parts.push('\nRegulatory Context: ABA Model Rules apply. Attorney-client privileged data likely.');
    if (!ctx.hasCyberInsurance) {
      parts.push('Risk Flag: No cyber insurance — malpractice exposure from data breaches.');
    }
  }

  if (ctx.employeeCount <= 50 && ctx.currentTools.length === 0) {
    parts.push('Risk Flag: Small organization with no reported security tools — likely Tier 1 baseline.');
  }

  return parts.join('\n');
}

/**
 * Seed a new assessment session with onboarding context.
 * Creates the session, conversation state, and generates the first question.
 */
export async function seedAssessmentFromOnboarding(
  tenantId: string,
  userId: string,
  ctx: OnboardingContext
): Promise<AssessmentSeedResult> {
  const db = getSupabaseAdmin();
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  const firstSection: CSFSection = 'GOVERN';

  // Build context summary
  const contextSummary = buildOnboardingContextSummary(ctx);

  // Create assessment session
  const { error: sessionError } = await db
    .from('assessment_sessions')
    .insert({
      id: sessionId,
      tenant_id: tenantId,
      user_id: userId,
      status: 'in_progress',
      current_section: firstSection,
      progress_pct: 0,
      gaps: [] as any,
      started_at: now,
    } as any);

  if (sessionError) {
    logger.error('Failed to seed assessment session', { tenantId, error: sessionError.message });
    throw new Error('Failed to create assessment session');
  }

  // Create conversation state pre-loaded with onboarding context
  const { error: stateError } = await db
    .from('conversation_state')
    .insert({
      id: uuidv4(),
      tenant_id: tenantId,
      session_id: sessionId,
      context_summary: contextSummary,
      current_section_qa: [] as any,
      retrieved_knowledge_ids: [],
      token_count: Math.ceil(contextSummary.length / 4), // Rough token estimate
    } as any);

  if (stateError) {
    logger.warn('Failed to create conversation state with onboarding context', {
      tenantId,
      error: stateError.message,
    });
  }

  // Generate first question using template (sector-aware from the start)
  const firstQ = generateTemplateQuestion(
    firstSection,
    ctx.sector,
    0,
    ctx.orgName
  );

  // Audit event
  await db.from('audit_events').insert({
    id: uuidv4(),
    tenant_id: tenantId,
    user_id: userId,
    event_type: 'assessment.seeded_from_onboarding',
    event_data: {
      sessionId,
      sector: ctx.sector,
      employeeCount: ctx.employeeCount,
      toolCount: ctx.currentTools.length,
      hasCyberInsurance: ctx.hasCyberInsurance,
    } as any,
  } as any);

  logger.info('Assessment seeded from onboarding', {
    tenantId,
    sessionId,
    sector: ctx.sector,
    contextLength: contextSummary.length,
  });

  return {
    sessionId,
    firstQuestion: firstQ.question,
    firstSection,
    citations: firstQ.citations,
    contextSummary,
  };
}
