import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * Structured anchors that survive all compression levels.
 * These are the facts that downstream sections MUST be able to reference.
 */
export interface SectionAnchors {
  sectionName: string;
  score: number | null; // e.g. 3/5 maturity rating
  keyFindings: string[]; // max 5 — the "what we found"
  constraints: string[]; // user-stated: budget, timeline, staff count, tech stack
  recommendations: string[]; // max 5 — the "what to do"
}

/**
 * Section summary for token compression
 */
interface SectionSummary {
  sectionId: string;
  originalTokens: number;
  summaryTokens: number;
  summary: string;
  anchors: SectionAnchors;
  timestamp: Date;
}

/**
 * Context window state
 */
interface ContextWindow {
  currentTokens: number;
  maxTokens: number;
  currentSection: {
    full: boolean;
    tokens: number;
    questions: Array<{
      query: string;
      response: string;
      tokens: number;
    }>;
  };
  priorSections: SectionSummary[];
  knowledgeContext: {
    tokens: number;
    count: number;
    preserved: boolean; // Never truncate knowledge
  };
  metadata: {
    assessmentId: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Token budget configuration
 */
const CONFIG = {
  maxContextWindow: 32000, // Claude max context
  maxSectionSize: 8000, // Keep current section under this
  summaryRatio: 0.25, // Compress to 25% of original
  minKnowledgeAllocation: 4000, // Always reserve this for knowledge
  bufferTokens: 1000, // Safety buffer for output
  maxAnchorsPerField: 5, // Cap anchors arrays
};

/**
 * Estimate token count (rough: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract structured anchors from Q&A pairs.
 * Anchors capture the durable facts — scores, findings, constraints, recommendations —
 * that downstream sections need to reference.
 */
export function extractAnchors(
  questions: Array<{ query: string; response: string }>,
  sectionName?: string
): SectionAnchors {
  const findings: string[] = [];
  const constraints: string[] = [];
  const recommendations: string[] = [];
  let score: number | null = null;

  for (const qa of questions) {
    const text = `${qa.query}\n${qa.response}`;

    // Extract score/maturity rating
    if (score === null) {
      const scoreMatch = text.match(
        /(?:score|rating|maturity|level)[\s:]*(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5)/i
      );
      if (scoreMatch) {
        score = parseFloat(scoreMatch[1]!);
      }
    }

    // Extract constraints (user-stated limitations)
    const constraintPatterns = [
      /(?:budget|funding)[\s:]*(?:is|of|around|approximately|about)?\s*\$?[\d,]+[kKmM]?/gi,
      /(?:timeline|deadline|by|before|within)\s+(?:is\s+)?(?:Q[1-4]\s*\d{4}|\d+\s*(?:month|week|day|year)s?|end of \w+)/gi,
      /(?:staff|team|headcount|personnel|employees?)[\s:]*(?:is|of|only|just)?\s*\d+/gi,
      /(?:we (?:don't|cannot|can't|do not) have|no|lack(?:ing)?|without)\s+[^.]{5,60}/gi,
      /(?:compliance|regulatory|must comply|required by)\s+[^.]{5,60}/gi,
    ];

    for (const pattern of constraintPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const m of matches.slice(0, 2)) {
          const trimmed = m.trim().substring(0, 120);
          if (!constraints.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
            constraints.push(trimmed);
          }
        }
      }
    }

    // Extract recommendations from responses
    const recPatterns = [
      /(?:recommend|should|advise|suggest|priority|action item)[\s:]+[^.]{10,120}\./gi,
      /(?:\d+\.\s+\*\*[^*]+\*\*)[^.]*\./g, // Numbered bold items (markdown lists)
    ];

    for (const pattern of recPatterns) {
      const matches = qa.response.match(pattern);
      if (matches) {
        for (const m of matches.slice(0, 2)) {
          const trimmed = m.trim().substring(0, 150);
          if (!recommendations.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
            recommendations.push(trimmed);
          }
        }
      }
    }

    // Extract key findings from responses
    const findingPatterns = [
      /(?:found|detected|identified|observed|noted|gap|weakness|strength|risk)[\s:]+[^.]{10,120}\./gi,
      /(?:Confidence:\s*(?:HIGH|MEDIUM|LOW))\s*[-–—]\s*[^.]{10,120}\./gi,
    ];

    for (const pattern of findingPatterns) {
      const matches = qa.response.match(pattern);
      if (matches) {
        for (const m of matches.slice(0, 2)) {
          const trimmed = m.trim().substring(0, 150);
          if (!findings.some((f) => f.toLowerCase() === trimmed.toLowerCase())) {
            findings.push(trimmed);
          }
        }
      }
    }
  }

  return {
    sectionName: sectionName || `Section ${Date.now()}`,
    score,
    keyFindings: findings.slice(0, CONFIG.maxAnchorsPerField),
    constraints: constraints.slice(0, CONFIG.maxAnchorsPerField),
    recommendations: recommendations.slice(0, CONFIG.maxAnchorsPerField),
  };
}

/**
 * Serialize anchors into a compact, readable string
 */
function serializeAnchors(anchors: SectionAnchors): string {
  const lines: string[] = [`[Section: ${anchors.sectionName}]`];

  if (anchors.score !== null) {
    lines.push(`[Score: ${anchors.score}/5]`);
  }

  if (anchors.keyFindings.length > 0) {
    lines.push(`[Findings: ${anchors.keyFindings.join("; ")}]`);
  }

  if (anchors.constraints.length > 0) {
    lines.push(`[Constraints: ${anchors.constraints.join("; ")}]`);
  }

  if (anchors.recommendations.length > 0) {
    lines.push(`[Recommendations: ${anchors.recommendations.join("; ")}]`);
  }

  return lines.join(" ");
}

/**
 * Summarize a Q&A section using anchored iterative summarization.
 *
 * Compression cascade:
 *   Level 0: Full text (no compression)
 *   Level 1: Anchors + narrative summary (default)
 *   Level 2: Anchors only (narrative dropped, anchors NEVER dropped)
 */
export function summarizeSection(section: {
  questions: Array<{ query: string; response: string }>;
  sectionName?: string;
  maxTokens?: number;
}): SectionSummary {
  const { questions, sectionName } = section;

  if (questions.length === 0) {
    return {
      sectionId: `section-${Date.now()}`,
      originalTokens: 0,
      summaryTokens: 0,
      summary: "",
      anchors: {
        sectionName: sectionName || "Empty",
        score: null,
        keyFindings: [],
        constraints: [],
        recommendations: [],
      },
      timestamp: new Date(),
    };
  }

  try {
    // Step 1: Extract structured anchors (these survive all compression levels)
    const anchors = extractAnchors(questions, sectionName);

    // Step 2: Build narrative summary from key points
    const narrativePoints: string[] = [];

    for (const qa of questions) {
      // Extract sentences with substantive content
      const sentences = qa.response
        .split(/[.!?]\s+/)
        .filter((s) => s.length > 30 && s.length < 200)
        .filter(
          (s) =>
            !s.match(/^(I |Let me |Here |This |That |As |In |The following)/i)
        );

      // Take up to 2 most substantive sentences per Q&A
      const substantive = sentences
        .sort((a, b) => {
          // Prefer sentences with specific details (numbers, frameworks, actions)
          const scoreA =
            (a.match(/\d/g)?.length || 0) +
            (a.match(
              /\b(?:NIST|HIPAA|SOC|PCI|ISO|GDPR|CMMI|CIS|FedRAMP)\b/gi
            )?.length || 0) * 2;
          const scoreB =
            (b.match(/\d/g)?.length || 0) +
            (b.match(
              /\b(?:NIST|HIPAA|SOC|PCI|ISO|GDPR|CMMI|CIS|FedRAMP)\b/gi
            )?.length || 0) * 2;
          return scoreB - scoreA;
        })
        .slice(0, 2);

      narrativePoints.push(...substantive);
    }

    // Step 3: Build Level 1 summary (anchors + narrative)
    const anchorString = serializeAnchors(anchors);
    const narrative = narrativePoints.slice(0, 4).join(". ");
    const summary = narrative
      ? `${anchorString}\n${narrative}`
      : anchorString;

    const originalTokens = questions.reduce(
      (sum, qa) =>
        sum + estimateTokens(qa.query) + estimateTokens(qa.response),
      0
    );

    const summaryTokens = estimateTokens(summary);

    logger.debug("Summarized section with anchors", {
      sectionName: anchors.sectionName,
      originalTokens,
      summaryTokens,
      ratio: (summaryTokens / Math.max(originalTokens, 1)).toFixed(2),
      anchorFields: {
        score: anchors.score,
        findings: anchors.keyFindings.length,
        constraints: anchors.constraints.length,
        recommendations: anchors.recommendations.length,
      },
    });

    return {
      sectionId: `section-${Date.now()}`,
      originalTokens,
      summaryTokens,
      summary,
      anchors,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error("Section summarization failed", {
      error: error instanceof Error ? error.message : String(error),
      questionCount: questions.length,
    });

    // Fallback: still extract anchors even on error
    const anchors = extractAnchors(questions, sectionName);
    const fallbackSummary = serializeAnchors(anchors);

    return {
      sectionId: `section-${Date.now()}`,
      originalTokens: questions.reduce(
        (sum, qa) =>
          sum + estimateTokens(qa.query) + estimateTokens(qa.response),
        0
      ),
      summaryTokens: estimateTokens(fallbackSummary),
      summary: fallbackSummary,
      anchors,
      timestamp: new Date(),
    };
  }
}

/**
 * Further compress a section summary to Level 2: anchors only.
 * Drops narrative but NEVER drops structured anchors.
 */
function compressToAnchorsOnly(section: SectionSummary): SectionSummary {
  const anchorString = serializeAnchors(section.anchors);
  const summaryTokens = estimateTokens(anchorString);

  return {
    ...section,
    summary: anchorString,
    summaryTokens,
  };
}

/**
 * Build rolling context window for assessment
 * Maintains current section in full + compressed prior sections + knowledge
 */
export function buildContextWindow(args: {
  currentSection: Array<{
    query: string;
    response: string;
  }>;
  priorSections?: SectionSummary[];
  knowledgeContext: {
    items: string[];
    maxTokens?: number;
  };
  assessmentId: string;
}): ContextWindow {
  const {
    currentSection,
    priorSections = [],
    knowledgeContext,
    assessmentId,
  } = args;

  try {
    // Calculate token usage
    const currentSectionTokens = currentSection.reduce(
      (sum, qa) =>
        sum + estimateTokens(qa.query) + estimateTokens(qa.response),
      0
    );

    // Knowledge is never truncated
    const knowledgeTokens = knowledgeContext.items.reduce(
      (sum, item) => sum + estimateTokens(item),
      0
    );

    // Prior sections already summarized
    const priorSectionsTokens = priorSections.reduce(
      (sum, sec) => sum + sec.summaryTokens,
      0
    );

    const totalTokens =
      currentSectionTokens + priorSectionsTokens + knowledgeTokens;

    logger.debug("Context window calculation", {
      currentSection: currentSectionTokens,
      priorSections: priorSectionsTokens,
      knowledge: knowledgeTokens,
      total: totalTokens,
      maxAllowed: CONFIG.maxContextWindow,
    });

    // Validate constraints
    if (knowledgeTokens > CONFIG.maxContextWindow) {
      logger.warn("Knowledge context exceeds single window", {
        knowledgeTokens,
        maxContext: CONFIG.maxContextWindow,
      });
    }

    return {
      currentTokens: totalTokens,
      maxTokens: CONFIG.maxContextWindow,
      currentSection: {
        full: true,
        tokens: currentSectionTokens,
        questions: currentSection.map((qa) => ({
          ...qa,
          tokens: estimateTokens(qa.query) + estimateTokens(qa.response),
        })),
      },
      priorSections,
      knowledgeContext: {
        tokens: knowledgeTokens,
        count: knowledgeContext.items.length,
        preserved: true, // Knowledge is never truncated
      },
      metadata: {
        assessmentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };
  } catch (error) {
    logger.error("Context window building failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    throw error;
  }
}

/**
 * Manage token budget across assessment lifecycle
 * Transitions sections to summaries when necessary
 */
export function manageTokenBudget(args: {
  currentWindow: ContextWindow;
  newQuery: string;
  newResponse: string;
}): {
  window: ContextWindow;
  actions: string[];
  available: number;
  utilization: number;
} {
  const { currentWindow, newQuery, newResponse } = args;
  const actions: string[] = [];

  try {
    const newQueryTokens = estimateTokens(newQuery);
    const newResponseTokens = estimateTokens(newResponse);
    const totalNewTokens = newQueryTokens + newResponseTokens;

    // Calculate projected tokens after adding new Q&A
    const projectedTokens =
      currentWindow.currentTokens + totalNewTokens + CONFIG.bufferTokens;

    logger.debug("Token budget analysis", {
      currentTokens: currentWindow.currentTokens,
      newTokens: totalNewTokens,
      projectedTokens,
      maxTokens: currentWindow.maxTokens,
      overflow: Math.max(0, projectedTokens - currentWindow.maxTokens),
    });

    // Check if we need to manage budget
    let managedWindow = currentWindow;

    if (projectedTokens > currentWindow.maxTokens) {
      logger.warn("Token budget exceeded, triggering management", {
        overflow: projectedTokens - currentWindow.maxTokens,
        current: currentWindow.currentTokens,
      });

      // Strategy 1: Compress current section if it's large
      if (currentWindow.currentSection.tokens > CONFIG.maxSectionSize) {
        const compressed = summarizeSection({
          questions: currentWindow.currentSection.questions.map((q) => ({
            query: q.query,
            response: q.response,
          })),
        });

        // Move current section to prior sections
        managedWindow = {
          ...currentWindow,
          priorSections: [...currentWindow.priorSections, compressed],
          currentSection: {
            full: true,
            tokens: 0,
            questions: [],
          },
          currentTokens:
            currentWindow.currentTokens -
            currentWindow.currentSection.tokens +
            compressed.summaryTokens,
        };

        actions.push(
          `Compressed current section: ${currentWindow.currentSection.tokens} → ${compressed.summaryTokens} tokens (anchors preserved: ${compressed.anchors.keyFindings.length} findings, ${compressed.anchors.constraints.length} constraints, ${compressed.anchors.recommendations.length} recommendations)`
        );
      }

      // Strategy 2: Further compress oldest prior sections (Level 2: anchors only)
      let tokenBudget = managedWindow.currentTokens;
      let sectionIndex = 0;

      while (
        tokenBudget + totalNewTokens + CONFIG.bufferTokens >
          currentWindow.maxTokens &&
        sectionIndex < managedWindow.priorSections.length
      ) {
        const section = managedWindow.priorSections[sectionIndex]!;

        // Compress to anchors only — narrative is dropped, anchors survive
        const furtherCompressed = compressToAnchorsOnly(section);
        const saved = section.summaryTokens - furtherCompressed.summaryTokens;

        if (saved > 0) {
          managedWindow.priorSections[sectionIndex] = furtherCompressed;
          tokenBudget -= saved;
          actions.push(
            `Compressed section "${section.anchors.sectionName}" to anchors-only: -${saved} tokens (anchors preserved)`
          );
        }

        sectionIndex++;
      }

      // Verify knowledge preservation
      if (
        managedWindow.knowledgeContext.tokens >
        CONFIG.maxContextWindow - totalNewTokens - CONFIG.bufferTokens
      ) {
        actions.push(
          "WARNING: Knowledge context at risk of truncation (should not happen)"
        );
      }
    }

    // Add new Q&A to current section
    managedWindow.currentSection.questions.push({
      query: newQuery,
      response: newResponse,
      tokens: totalNewTokens,
    });

    managedWindow.currentSection.tokens += totalNewTokens;
    managedWindow.currentTokens += totalNewTokens;
    managedWindow.metadata.updatedAt = new Date();

    const available = Math.max(
      0,
      managedWindow.maxTokens - managedWindow.currentTokens - CONFIG.bufferTokens
    );

    const utilization = (managedWindow.currentTokens / managedWindow.maxTokens) * 100;

    logger.info("Token budget managed", {
      projectedTokens,
      available,
      utilization: utilization.toFixed(1) + "%",
      actionsCount: actions.length,
    });

    return {
      window: managedWindow,
      actions,
      available,
      utilization,
    };
  } catch (error) {
    logger.error("Token budget management failed", {
      error: error instanceof Error ? error.message : String(error),
      currentTokens: currentWindow.currentTokens,
    });

    throw error;
  }
}

/**
 * Get token budget report for assessment
 */
export function getTokenBudgetReport(window: ContextWindow): {
  summary: string;
  breakdown: {
    currentSection: number;
    priorSections: number;
    knowledge: number;
    total: number;
    available: number;
    utilization: string;
  };
} {
  const currentSection = window.currentSection.tokens;
  const priorSections = window.priorSections.reduce(
    (sum, s) => sum + s.summaryTokens,
    0
  );
  const knowledge = window.knowledgeContext.tokens;
  const total = currentSection + priorSections + knowledge;
  const available = Math.max(0, window.maxTokens - total);
  const utilization = ((total / window.maxTokens) * 100).toFixed(1);

  return {
    summary: `Assessment ${window.metadata.assessmentId}: ${utilization}% utilized (${total}/${window.maxTokens} tokens)`,
    breakdown: {
      currentSection,
      priorSections,
      knowledge,
      total,
      available,
      utilization: utilization + "%",
    },
  };
}
