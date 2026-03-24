import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * NIST CSF 2.0 Assessment Sections (in order)
 */
export const CSF_SECTIONS = ['GOVERN', 'IDENTIFY', 'PROTECT', 'DETECT', 'RESPOND', 'RECOVER'] as const;
export type CSFSection = typeof CSF_SECTIONS[number];

/**
 * Progress ranges per section (each ~16.7% of total)
 */
export const SECTION_PROGRESS: Record<CSFSection, { start: number; end: number }> = {
  GOVERN: { start: 0, end: 16 },
  IDENTIFY: { start: 17, end: 33 },
  PROTECT: { start: 34, end: 50 },
  DETECT: { start: 51, end: 66 },
  RESPOND: { start: 67, end: 83 },
  RECOVER: { start: 84, end: 100 },
};

/**
 * Calculate overall progress based on section and question count
 */
export function calculateProgress(section: CSFSection, questionsInSection: number): number {
  const range = SECTION_PROGRESS[section];
  if (!range) return 0;
  // Within a section, estimate progress based on typical 5-8 questions
  const sectionProgress = Math.min(questionsInSection / 6, 1);
  return Math.round(range.start + (range.end - range.start) * sectionProgress);
}

/**
 * Get next section after current
 */
export function getNextSection(current: CSFSection): CSFSection | null {
  const idx = CSF_SECTIONS.indexOf(current);
  if (idx === -1 || idx >= CSF_SECTIONS.length - 1) return null;
  return CSF_SECTIONS[idx + 1]!;
}

/**
 * Token budget constants
 */
const MAX_CONTEXT_TOKENS = 8000; // Leave room for response within model limit
const SUMMARY_TARGET_TOKENS = 500;

/**
 * Estimate token count (rough: 1 token ≈ 4 chars)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build conversation context for LLM, managing token budget
 * Rolling window: full Q&A for current section + summaries of previous
 */
export async function buildConversationContext(
  sessionId: string,
  tenantId: string,
  currentSection: CSFSection
): Promise<{
  context: string;
  tokenCount: number;
  summaries: Record<string, string>;
}> {
  const db = getSupabaseAdmin();

  // Load all responses for this session
  const { data: responses } = await db
    .from('assessment_responses')
    .select('section, question_text, response_text, created_at')
    .eq('session_id', sessionId)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true });

  if (!responses || responses.length === 0) {
    return { context: '', tokenCount: 0, summaries: {} };
  }

  // Group by section
  const bySection: Record<string, typeof responses> = {};
  for (const r of responses) {
    const sec = r.section;
    if (!bySection[sec]) bySection[sec] = [];
    bySection[sec]!.push(r);
  }

  // Build context: summaries for past sections, full Q&A for current
  const summaries: Record<string, string> = {};
  let contextParts: string[] = [];
  let totalTokens = 0;

  for (const section of CSF_SECTIONS) {
    const sectionResponses = bySection[section];
    if (!sectionResponses || sectionResponses.length === 0) continue;

    if (section === currentSection) {
      // Full Q&A for current section
      const fullQA = sectionResponses.map((r) =>
        `Q: ${r.question_text}\nA: ${r.response_text ?? '(no response)'}`
      ).join('\n\n');
      const tokens = estimateTokens(fullQA);

      if (totalTokens + tokens < MAX_CONTEXT_TOKENS) {
        contextParts.push(`## ${section} (Current Section)\n${fullQA}`);
        totalTokens += tokens;
      } else {
        // Even current section is too large — truncate oldest
        const recent = sectionResponses.slice(-4);
        const truncated = recent.map((r) =>
          `Q: ${r.question_text}\nA: ${r.response_text ?? '(no response)'}`
        ).join('\n\n');
        contextParts.push(`## ${section} (Current, truncated)\n${truncated}`);
        totalTokens += estimateTokens(truncated);
      }
    } else {
      // Summary for past sections
      const summary = `${section}: ${sectionResponses.length} questions answered. ` +
        `Key topics: ${sectionResponses.slice(0, 3).map((r) => r.question_text.slice(0, 60)).join('; ')}`;
      summaries[section] = summary;
      const tokens = estimateTokens(summary);

      if (totalTokens + tokens < MAX_CONTEXT_TOKENS) {
        contextParts.push(`## ${section} (Summary)\n${summary}`);
        totalTokens += tokens;
      }
    }
  }

  // Save updated state
  await db
    .from('conversation_state')
    .update({
      context_summary: contextParts.join('\n\n'),
      token_count: totalTokens,
      updated_at: new Date().toISOString(),
    } as any)
    .eq('session_id', sessionId)
    .eq('tenant_id', tenantId);

  return {
    context: contextParts.join('\n\n'),
    tokenCount: totalTokens,
    summaries,
  };
}

/**
 * Generate sector-adapted assessment question (template mode)
 * Will be replaced by actual LLM call when API keys are configured
 */
export function generateTemplateQuestion(
  section: CSFSection,
  sector: string,
  questionIndex: number,
  orgName: string
): {
  question: string;
  citations: string[];
  generatedBy: 'template';
} {
  const sectorQuestions: Record<string, Record<CSFSection, string[]>> = {
    healthcare: {
      GOVERN: [
        `How does ${orgName} align cybersecurity risk management with its mission to deliver patient care? [NIST CSF GV.OC-01]`,
        `What governance structure oversees cybersecurity decisions at ${orgName}? Who is ultimately accountable for HIPAA Security Rule compliance? [GV.RR-01, 45 CFR §164.308(a)(2)]`,
        `How does ${orgName} manage cybersecurity risks from third-party vendors with access to ePHI? [GV.SC-01, HIPAA §164.314]`,
      ],
      IDENTIFY: [
        `Does ${orgName} maintain a current inventory of all systems that create, receive, maintain, or transmit ePHI? [ID.AM-01, HIPAA §164.310(d)]`,
        `How does ${orgName} conduct risk assessments? When was the last HIPAA Security Risk Assessment performed? [ID.RA-01, §164.308(a)(1)(ii)(A)]`,
        `What are the top 3 cybersecurity risks ${orgName} has identified in the past 12 months? [ID.RA-03]`,
      ],
      PROTECT: [
        `How does ${orgName} control access to systems containing ePHI? Is multi-factor authentication required? [PR.AA-01, §164.312(d)]`,
        `What security awareness training does ${orgName} provide to workforce members with ePHI access? [PR.AT-01, §164.308(a)(5)]`,
        `How does ${orgName} encrypt ePHI at rest and in transit? [PR.DS-01, §164.312(a)(2)(iv), §164.312(e)(2)(ii)]`,
      ],
      DETECT: [
        `What monitoring does ${orgName} have in place to detect unauthorized access to ePHI? [DE.CM-01, §164.312(b)]`,
        `How quickly can ${orgName} detect a potential breach of patient records? [DE.AE-01]`,
      ],
      RESPOND: [
        `Does ${orgName} have a documented incident response plan that covers HIPAA breach notification? [RS.MA-01, §164.308(a)(6)]`,
        `How does ${orgName} determine whether a security incident triggers the HIPAA Breach Notification Rule? [RS.AN-01, §164.402]`,
        `What is your process for notifying HHS OCR and affected individuals after a confirmed breach? [RS.CO-01, §164.404-408]`,
      ],
      RECOVER: [
        `What is ${orgName}'s backup and disaster recovery plan for systems containing ePHI? [RC.RP-01, §164.308(a)(7)]`,
        `How does ${orgName} test its disaster recovery procedures? When was the last test? [RC.RP-02]`,
      ],
    },
    legal: {
      GOVERN: [
        `How does ${orgName} balance cybersecurity investment with its ethical obligation to protect client confidentiality? [GV.OC-01, ABA Model Rule 1.6(c)]`,
        `Who at ${orgName} is responsible for overseeing cybersecurity and ensuring compliance with state bar requirements? [GV.RR-01]`,
        `How does ${orgName} vet technology vendors with access to client data and attorney-client privileged communications? [GV.SC-01, ABA Formal Opinion 477R]`,
      ],
      IDENTIFY: [
        `Does ${orgName} maintain an inventory of all systems that store client confidential information and privileged communications? [ID.AM-01]`,
        `When did ${orgName} last assess cybersecurity risks to client data? What methodology was used? [ID.RA-01, ABA Model Rule 1.6 Comment 18]`,
        `What are the primary cyber threats to ${orgName}'s client data? (e.g., ransomware, BEC, insider threat) [ID.RA-03]`,
      ],
      PROTECT: [
        `How does ${orgName} restrict access to client files and matter management systems? Is role-based access enforced? [PR.AA-01, ABA Formal Opinion 483]`,
        `What cybersecurity training do attorneys and staff receive? How often? [PR.AT-01]`,
        `Are client documents and privileged communications encrypted at rest and in transit in your DMS? [PR.DS-01]`,
      ],
      DETECT: [
        `What monitoring does ${orgName} have for detecting unauthorized access to client files? [DE.CM-01]`,
        `How would ${orgName} detect if an attorney's email account was compromised? [DE.AE-01]`,
      ],
      RESPOND: [
        `Does ${orgName} have an incident response plan that accounts for attorney-client privilege implications? [RS.MA-01]`,
        `How does ${orgName} determine notification obligations under state data breach laws for each client's jurisdiction? [RS.CO-01]`,
        `What is your process for notifying affected clients and relevant bar authorities after a breach? [RS.CO-02]`,
      ],
      RECOVER: [
        `What is ${orgName}'s business continuity plan for maintaining client services during a cyber incident? [RC.RP-01]`,
        `How does ${orgName} ensure trust account and IOLTA records can be recovered after a ransomware attack? [RC.RP-02]`,
      ],
    },
  };

  const questions = sectorQuestions[sector]?.[section] ?? sectorQuestions['healthcare']![section]!;
  const idx = questionIndex % questions.length;
  const question = questions[idx]!;

  // Extract citations from brackets
  const citationMatch = question.match(/\[([^\]]+)\]/g) ?? [];
  const citations = citationMatch.map((c) => c.replace(/[\[\]]/g, ''));

  return {
    question,
    citations,
    generatedBy: 'template',
  };
}
