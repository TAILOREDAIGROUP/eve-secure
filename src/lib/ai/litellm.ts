import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import type { ProviderConfig, LLMProvider } from "./router";

const MODEL_CALL_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/**
 * Query classification for intelligent model routing
 */
type QueryClassification = "simple" | "assessment" | "complex" | "planning";

/**
 * Model call result with telemetry
 */
export interface ModelCallResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latency: number;
  cost: number;
  classification: QueryClassification;
  degraded?: boolean;
  error_id?: string;
}

/**
 * Model routing configuration
 */
interface ModelRoute {
  primary: string;
  secondary: string;
  tertiary: string;
}

/**
 * Token costs per model (USD)
 * Covers both direct Anthropic and OpenRouter pricing
 */
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  // Direct Anthropic
  "claude-3-5-haiku-20241022": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-3-5-sonnet-20241022": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-3-5-opus-20241022": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
  // OpenRouter model IDs (same pricing + small markup)
  "anthropic/claude-3.5-haiku": { input: 1.0 / 1_000_000, output: 5.0 / 1_000_000 },
  "anthropic/claude-3.5-sonnet": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "anthropic/claude-3.5-opus": { input: 15.0 / 1_000_000, output: 75.0 / 1_000_000 },
};

/**
 * Classify query by content analysis
 */
export function classifyQuery(query: string): QueryClassification {
  const lowerQuery = query.toLowerCase();

  const simplePatterns = [
    /^what is|^define|^explain the difference|^when should|^where is|^who is/i,
    /^\?|^yes|^no|^true|^false/i,
    /\b(password|port|standard|cve-?\d{4}-\d{4}|rfc\s?\d{3,4})\b/i,
  ];
  if (simplePatterns.some((p) => p.test(lowerQuery)) && query.length < 150) return "simple";

  const assessmentPatterns = [
    /assessment|audit|evaluation|review|scan|analysis|maturity|compliance check|posture/i,
    /\b(find|identify|discover|measure|evaluate)\b.*\b(risks?|vulnerabilities?|gaps?|issues?)\b/i,
  ];
  if (assessmentPatterns.some((p) => p.test(lowerQuery))) return "assessment";

  const planningPatterns = [
    /plan|strategy|roadmap|implementation|framework|program|initiative/i,
    /\b(how to|steps to|process|procedure|workflow)\b/i,
  ];
  if (planningPatterns.some((p) => p.test(lowerQuery))) return "planning";

  const complexPatterns = [
    /integration|tradeoff|balance|cross-|multi-|interaction between/i,
    /\b(framework|architecture|design|alignment)\b/i,
  ];
  if (complexPatterns.some((p) => p.test(lowerQuery)) || query.length > 300 || query.split("\n").length > 5) {
    return "complex";
  }

  return "assessment";
}

/**
 * Get model for classification from provider config
 */
function getModelForClassification(
  classification: QueryClassification,
  config: ProviderConfig
): string[] {
  const tierMap: Record<QueryClassification, ('fast' | 'standard' | 'complex')[]> = {
    simple: ['fast', 'standard', 'complex'],
    assessment: ['standard', 'complex', 'fast'],
    planning: ['standard', 'complex', 'fast'],
    complex: ['complex', 'standard', 'fast'],
  };

  return tierMap[classification].map((tier) => config.modelMap[tier]);
}

/**
 * Calculate cost for a model call
 */
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = TOKEN_COSTS[model];
  if (!costs) {
    logger.warn(`Unknown model cost: ${model}, using default`);
    return inputTokens * (3.0 / 1_000_000) + outputTokens * (15.0 / 1_000_000);
  }
  return inputTokens * costs.input + outputTokens * costs.output;
}

/**
 * Make a call to an LLM with automatic fallback
 * Supports both OpenRouter and Direct Anthropic backends
 */
export async function callModel(args: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
  provider?: LLMProvider;
  providerConfig?: ProviderConfig;
}): Promise<ModelCallResult> {
  const { query, systemPrompt, tenantId, conversationId } = args;
  const startTime = Date.now();
  const classification = classifyQuery(query);

  // Use provided config or fall back to direct Anthropic
  const config: ProviderConfig = args.providerConfig ?? {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    modelMap: {
      fast: 'claude-3-5-haiku-20241022',
      standard: 'claude-3-5-sonnet-20241022',
      complex: 'claude-3-5-opus-20241022',
    },
  };

  const provider = args.provider ?? 'anthropic';
  const models = getModelForClassification(classification, config);
  let lastError: Error | null = null;

  for (const model of models) {
    // Retry with exponential backoff before trying the next model
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        // Create client based on provider
        const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {};

        if (provider === 'openrouter') {
          clientConfig.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
          clientConfig.baseURL = config.baseUrl ?? 'https://openrouter.ai/api/v1';
        } else {
          clientConfig.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
        }

        const client = new Anthropic(clientConfig);

        logger.info("LLM call initiated", {
          provider,
          model,
          classification,
          tenantId,
          conversationId,
          queryLength: query.length,
          attempt,
        });

        const response = await client.messages.create(
          {
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: query }],
          },
          { timeout: MODEL_CALL_TIMEOUT_MS },
        );

        const latency = Date.now() - startTime;
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const cost = calculateCost(model, inputTokens, outputTokens);

        // Exhaustive type guard for content blocks
        let content = "";
        const firstBlock = response.content[0];
        if (firstBlock) {
          if (firstBlock.type === "text") {
            content = firstBlock.text;
          } else {
            // Non-text block (tool_use, etc.) — return structured error
            logger.warn("Non-text content block received", {
              blockType: firstBlock.type,
              model,
              tenantId,
            });
            const errorId = uuidv4();
            return {
              content: "Received an unexpected response format. Please rephrase your query.",
              model,
              inputTokens,
              outputTokens,
              latency,
              cost,
              classification,
              degraded: true,
              error_id: errorId,
            };
          }
        }

        logger.info("LLM call success", {
          provider,
          model,
          classification,
          tenantId,
          inputTokens,
          outputTokens,
          latency,
          cost: cost.toFixed(6),
        });

        return { content, model, inputTokens, outputTokens, latency, cost, classification };
      } catch (error) {
        lastError = error as Error;
        const retryDelay = RETRY_DELAYS_MS[attempt];

        if (retryDelay !== undefined) {
          logger.warn(`Model ${model} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms`, {
            error: (error as Error).message,
            tenantId,
            provider,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          logger.warn(`Model ${model} (${provider}) exhausted retries, trying next model`, {
            error: (error as Error).message,
            tenantId,
            provider,
          });
        }
      }
    }
  }

  // All models and all retries exhausted — return graceful degradation
  const errorId = uuidv4();
  const latency = Date.now() - startTime;

  logger.error("All model fallbacks exhausted — returning degraded response", {
    classification,
    tenantId,
    provider,
    errorId,
    originalError: lastError?.message,
  });

  return {
    content: "Our advisory system is temporarily unavailable. Please try again shortly.",
    model: "none",
    inputTokens: 0,
    outputTokens: 0,
    latency,
    cost: 0,
    classification,
    degraded: true,
    error_id: errorId,
  };
}

/**
 * Streaming event types emitted during model streaming
 */
export type StreamEvent =
  | { type: 'start'; model: string; classification: QueryClassification }
  | { type: 'delta'; content: string }
  | { type: 'complete'; model: string; inputTokens: number; outputTokens: number; cost: number; latency: number }
  | { type: 'error'; message: string; errorId: string; degraded: boolean };

/**
 * Stream a model call via Anthropic's streaming API with automatic fallback.
 * Yields StreamEvents as tokens arrive.
 * Falls through model tiers on failure (same logic as callModel).
 */
export async function* callModelStreaming(args: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
  provider?: LLMProvider;
  providerConfig?: ProviderConfig;
  maxTokens?: number;
}): AsyncGenerator<StreamEvent> {
  const { query, systemPrompt, tenantId, conversationId, maxTokens = 4096 } = args;
  const startTime = Date.now();
  const classification = classifyQuery(query);

  const config: ProviderConfig = args.providerConfig ?? {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    modelMap: {
      fast: 'claude-3-5-haiku-20241022',
      standard: 'claude-3-5-sonnet-20241022',
      complex: 'claude-3-5-opus-20241022',
    },
  };

  const provider = args.provider ?? 'anthropic';
  const models = getModelForClassification(classification, config);
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {};

      if (provider === 'openrouter') {
        clientConfig.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
        clientConfig.baseURL = config.baseUrl ?? 'https://openrouter.ai/api/v1';
      } else {
        clientConfig.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      }

      const client = new Anthropic(clientConfig);

      logger.info("LLM streaming call initiated", {
        provider,
        model,
        classification,
        tenantId,
        conversationId,
        queryLength: query.length,
      });

      yield { type: 'start', model, classification };

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
      });

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield { type: 'delta', content: delta.text };
          }
        }
      }

      // Get final message for usage stats
      const finalMessage = await stream.finalMessage();
      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

      const latency = Date.now() - startTime;
      const cost = calculateCost(model, inputTokens, outputTokens);

      logger.info("LLM streaming call success", {
        provider,
        model,
        classification,
        tenantId,
        inputTokens,
        outputTokens,
        latency,
        cost: cost.toFixed(6),
      });

      yield {
        type: 'complete',
        model,
        inputTokens,
        outputTokens,
        cost,
        latency,
      };

      return; // Success — don't try next model
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Streaming model ${model} (${provider}) failed, trying next model`, {
        error: (error as Error).message,
        tenantId,
        provider,
      });
    }
  }

  // All models exhausted
  const errorId = uuidv4();
  logger.error("All streaming model fallbacks exhausted", {
    classification,
    tenantId,
    provider,
    errorId,
    originalError: lastError?.message,
  });

  yield {
    type: 'error',
    message: "Our advisory system is temporarily unavailable. Please try again shortly.",
    errorId,
    degraded: true,
  };
}

/**
 * Route query to optimal model (legacy — use router.routeAndCall instead)
 */
export function routeToModel(classification: QueryClassification): string {
  const defaults: Record<QueryClassification, string> = {
    simple: 'claude-3-5-haiku-20241022',
    assessment: 'claude-3-5-sonnet-20241022',
    planning: 'claude-3-5-sonnet-20241022',
    complex: 'claude-3-5-opus-20241022',
  };
  return defaults[classification];
}

export async function getCostForTenant(tenantId: string): Promise<number> {
  logger.info("getCostForTenant called", { tenantId });
  return 0;
}

export async function getCostBreakdownByModel(tenantId: string): Promise<Record<string, number>> {
  logger.info("getCostBreakdownByModel called", { tenantId });
  return {};
}

export async function getUsageForTenant(tenantId: string) {
  logger.info("getUsageForTenant called", { tenantId });
  return { totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, avgLatency: 0, totalCost: 0 };
}
