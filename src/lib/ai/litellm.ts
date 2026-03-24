import { createClient } from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { db } from "@/lib/db";

/**
 * Query classification for intelligent model routing
 */
type QueryClassification = "simple" | "assessment" | "complex" | "planning";

/**
 * Model routing configuration
 */
interface ModelRoute {
  primary: string;
  secondary: string;
  tertiary: string;
}

/**
 * Model call result with telemetry
 */
interface ModelCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latency: number;
  cost: number;
  classification: QueryClassification;
}

/**
 * Routing table: classification → model priority
 */
const ROUTING_TABLE: Record<QueryClassification, ModelRoute> = {
  simple: {
    primary: "claude-3-5-haiku-20241022",
    secondary: "claude-3-5-sonnet-20241022",
    tertiary: "claude-3-5-opus-20241022",
  },
  assessment: {
    primary: "claude-3-5-sonnet-20241022",
    secondary: "claude-3-5-opus-20241022",
    tertiary: "claude-3-5-haiku-20241022",
  },
  planning: {
    primary: "claude-3-5-sonnet-20241022",
    secondary: "claude-3-5-opus-20241022",
    tertiary: "claude-3-5-haiku-20241022",
  },
  complex: {
    primary: "claude-3-5-opus-20241022",
    secondary: "claude-3-5-sonnet-20241022",
    tertiary: "claude-3-5-haiku-20241022",
  },
};

/**
 * Token cost per model (in USD)
 * Prices as of Claude 3.5 generation
 */
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "claude-3-5-haiku-20241022": {
    input: 0.8 / 1_000_000,
    output: 4.0 / 1_000_000,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0 / 1_000_000,
    output: 15.0 / 1_000_000,
  },
  "claude-3-5-opus-20241022": {
    input: 15.0 / 1_000_000,
    output: 75.0 / 1_000_000,
  },
};

/**
 * Classify query by content analysis
 * Returns query classification to drive model routing
 */
export function classifyQuery(query: string): QueryClassification {
  const lowerQuery = query.toLowerCase();

  // Simple pattern: lookup queries, definitions, yes/no
  const simplePatterns = [
    /^what is|^define|^explain the difference|^when should|^where is|^who is/i,
    /^\?|^yes|^no|^true|^false/i,
    /\b(password|port|standard|cve-?\d{4}-\d{4}|rfc\s?\d{3,4})\b/i,
  ];

  if (simplePatterns.some((p) => p.test(lowerQuery)) && query.length < 150) {
    return "simple";
  }

  // Assessment patterns: evaluation, audit, risk, compliance check
  const assessmentPatterns = [
    /assessment|audit|evaluation|review|scan|analysis|maturity|compliance check|posture/i,
    /\b(find|identify|discover|measure|evaluate)\b.*\b(risks?|vulnerabilities?|gaps?|issues?)\b/i,
  ];

  if (assessmentPatterns.some((p) => p.test(lowerQuery))) {
    return "assessment";
  }

  // Planning patterns: strategy, roadmap, implementation, plan
  const planningPatterns = [
    /plan|strategy|roadmap|implementation|framework|program|initiative/i,
    /\b(how to|steps to|process|procedure|workflow)\b/i,
  ];

  if (planningPatterns.some((p) => p.test(lowerQuery))) {
    return "planning";
  }

  // Complex: cross-domain, multi-faceted, regulatory + technical
  const complexPatterns = [
    /integration|tradeoff|balance|cross-|multi-|interaction between/i,
    /\b(framework|architecture|design|alignment)\b/i,
  ];

  if (
    complexPatterns.some((p) => p.test(lowerQuery)) ||
    query.length > 300 ||
    query.split("\n").length > 5
  ) {
    return "complex";
  }

  return "assessment"; // Default to middle-ground model
}

/**
 * Route query to optimal model based on classification
 * Returns primary model, with fallback chain defined
 */
export function routeToModel(classification: QueryClassification): string {
  return ROUTING_TABLE[classification].primary;
}

/**
 * Calculate cost for a model call
 */
function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COSTS[model];
  if (!costs) {
    logger.warn(`Unknown model cost: ${model}, using Haiku as fallback`);
    const fallbackCosts = TOKEN_COSTS["claude-3-5-haiku-20241022"];
    return inputTokens * fallbackCosts.input + outputTokens * fallbackCosts.output;
  }

  return inputTokens * costs.input + outputTokens * costs.output;
}

/**
 * Make a call to Claude via LiteLLM with automatic fallback
 * Logs all calls for audit and cost tracking
 */
export async function callModel(args: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
}): Promise<ModelCallResult> {
  const { query, systemPrompt, tenantId, conversationId } = args;
  const startTime = Date.now();
  const classification = classifyQuery(query);
  const routes = ROUTING_TABLE[classification];

  const models = [routes.primary, routes.secondary, routes.tertiary];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const client = createClient();

      logger.info("Calling model", {
        model,
        classification,
        tenantId,
        conversationId,
        queryLength: query.length,
      });

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: query,
          },
        ],
      });

      const latency = Date.now() - startTime;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = calculateCost(model, inputTokens, outputTokens);

      // Extract response content
      const content =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Log the call
      logger.info("Model call success", {
        model,
        classification,
        tenantId,
        conversationId,
        inputTokens,
        outputTokens,
        latency,
        cost: cost.toFixed(6),
      });

      // Track cost per tenant
      await db.modelCalls.create({
        tenantId,
        model,
        classification,
        inputTokens,
        outputTokens,
        cost,
        latency,
        conversationId: conversationId || null,
        timestamp: new Date(),
      });

      return {
        content,
        model,
        inputTokens,
        outputTokens,
        latency,
        cost,
        classification,
      };
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Model ${model} failed, attempting fallback`, {
        error: (error as Error).message,
        tenantId,
      });
      // Continue to next model in fallback chain
    }
  }

  // All fallbacks exhausted
  logger.error("All model fallbacks exhausted", {
    classification,
    tenantId,
    originalError: lastError?.message,
  });

  throw new Error(
    `Failed to call any model in fallback chain: ${lastError?.message}`
  );
}

/**
 * Get cumulative cost for a tenant across all model calls
 */
export async function getCostForTenant(tenantId: string): Promise<number> {
  const calls = await db.modelCalls.findMany({
    where: { tenantId },
  });

  return calls.reduce((sum, call) => sum + call.cost, 0);
}

/**
 * Get cost breakdown by model for a tenant
 */
export async function getCostBreakdownByModel(
  tenantId: string
): Promise<Record<string, number>> {
  const calls = await db.modelCalls.findMany({
    where: { tenantId },
  });

  const breakdown: Record<string, number> = {};
  for (const call of calls) {
    breakdown[call.model] = (breakdown[call.model] || 0) + call.cost;
  }

  return breakdown;
}

/**
 * Get usage statistics for a tenant
 */
export async function getUsageForTenant(tenantId: string) {
  const calls = await db.modelCalls.findMany({
    where: { tenantId },
  });

  const totalInputTokens = calls.reduce((sum, c) => sum + c.inputTokens, 0);
  const totalOutputTokens = calls.reduce((sum, c) => sum + c.outputTokens, 0);
  const totalCalls = calls.length;
  const avgLatency =
    totalCalls > 0
      ? calls.reduce((sum, c) => sum + c.latency, 0) / totalCalls
      : 0;

  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    avgLatency,
    totalCost: calls.reduce((sum, c) => sum + c.cost, 0),
  };
}
