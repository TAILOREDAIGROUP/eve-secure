import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * Section summary for token compression
 */
interface SectionSummary {
  sectionId: string;
  originalTokens: number;
  summaryTokens: number;
  summary: string;
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
};

/**
 * Estimate token count (rough: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Summarize a Q&A section using extractive summarization
 * Compresses conversation history while retaining key points
 */
export function summarizeSection(section: {
  questions: Array<{ query: string; response: string }>;
  maxTokens?: number;
}): SectionSummary {
  const { questions, maxTokens = CONFIG.summaryRatio } = section;

  if (questions.length === 0) {
    return {
      sectionId: `section-${Date.now()}`,
      originalTokens: 0,
      summaryTokens: 0,
      summary: "",
      timestamp: new Date(),
    };
  }

  try {
    // Extract key insights from each Q&A
    const summaryPoints: string[] = [];

    for (const qa of questions) {
      // Extract assertions and findings
      const responseLines = qa.response
        .split("\n")
        .filter((line) => line.length > 30)
        .slice(0, 2); // First 2 substantial lines

      // Extract key phrases
      const keyPhrases = qa.response.match(
        /\b(?:key|important|critical|significant|must|should|recommend)\b[^.]*\./gi
      );

      if (keyPhrases && keyPhrases.length > 0) {
        summaryPoints.push(
          ...keyPhrases.slice(0, 2).map((p) => p.trim())
        );
      } else if (responseLines.length > 0) {
        summaryPoints.push(`Q: ${qa.query.substring(0, 60)}`);
        summaryPoints.push(`A: ${responseLines[0].substring(0, 80)}`);
      }
    }

    // Build summary
    const originalTokens = questions.reduce(
      (sum, qa) =>
        sum + estimateTokens(qa.query) + estimateTokens(qa.response),
      0
    );

    const summary = summaryPoints.slice(0, 5).join("\n");
    const summaryTokens = estimateTokens(summary);

    logger.debug("Summarized section", {
      originalTokens,
      summaryTokens,
      ratio: (summaryTokens / originalTokens).toFixed(2),
      pointsExtracted: summaryPoints.length,
    });

    return {
      sectionId: `section-${Date.now()}`,
      originalTokens,
      summaryTokens,
      summary,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error("Section summarization failed", {
      error: error instanceof Error ? error.message : String(error),
      questionCount: questions.length,
    });

    // Return empty summary on failure
    return {
      sectionId: `section-${Date.now()}`,
      originalTokens: questions.reduce(
        (sum, qa) =>
          sum + estimateTokens(qa.query) + estimateTokens(qa.response),
        0
      ),
      summaryTokens: 0,
      summary: `[${questions.length} Q&A pairs summarized]`,
      timestamp: new Date(),
    };
  }
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
          `Compressed current section: ${currentWindow.currentSection.tokens} → ${compressed.summaryTokens} tokens`
        );
      }

      // Strategy 2: If still over budget, compress oldest prior sections
      let tokenBudget = managedWindow.currentTokens;
      let sectionIndex = 0;

      while (
        tokenBudget + totalNewTokens + CONFIG.bufferTokens >
          currentWindow.maxTokens &&
        sectionIndex < managedWindow.priorSections.length
      ) {
        const section = managedWindow.priorSections[sectionIndex];

        // Further compress by extracting key sentences
        const furtherCompressed = section.summary
          .split("\n")
          .slice(0, 2) // Keep only first 2 lines
          .join(" ");

        const compressedTokens = estimateTokens(furtherCompressed);
        const saved = section.summaryTokens - compressedTokens;

        managedWindow.priorSections[sectionIndex] = {
          ...section,
          summary: furtherCompressed,
          summaryTokens: compressedTokens,
        };

        tokenBudget -= saved;
        actions.push(
          `Further compressed section ${sectionIndex}: -${saved} tokens`
        );
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
