import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import type { ProviderConfig, LLMProvider } from "./router";

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
      });

      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
      });

      const latency = Date.now() - startTime;
      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const cost = calculateCost(model, inputTokens, outputTokens);

      const firstBlock = response.content[0];
      const content = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";

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
      logger.warn(`Model ${model} (${provider}) failed, trying next`, {
        error: (error as Error).message,
        tenantId,
        provider,
      });
    }
  }

  logger.error("All model fallbacks exhausted", {
    classification,
    tenantId,
    provider,
    originalError: lastError?.message,
  });

  throw new Error(`Failed to call any model via ${provider}: ${lastError?.message}`);
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
