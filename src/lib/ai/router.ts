import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';
import { callModel, type ModelCallResult } from './litellm';

/**
 * LLM Router — Dual-provider routing for compliance
 *
 * Standard path: OpenRouter (200+ models, best-for-task)
 * Regulated path: Direct Anthropic API (data stays in our infra)
 *
 * Auto-classification by sector:
 *   healthcare → regulated (HIPAA)
 *   legal → regulated (attorney-client privilege)
 *   all others → standard
 *
 * Admin override: tenant-level setting to force provider
 */

export type SensitivityLevel = 'standard' | 'regulated';
export type ProviderOverride = 'auto' | 'direct-only' | 'openrouter-only';
export type LLMProvider = 'openrouter' | 'anthropic';

/**
 * Provider configuration
 */
export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl?: string;
  modelMap: {
    fast: string;
    standard: string;
    complex: string;
  };
}

/**
 * OpenRouter provider config
 * Access to 200+ models — best model for each task type
 */
export function getOpenRouterConfig(): ProviderConfig {
  return {
    provider: 'openrouter',
    apiKey: process.env.OPENROUTER_API_KEY ?? '',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelMap: {
      fast: 'anthropic/claude-3.5-haiku',
      standard: 'anthropic/claude-3.5-sonnet',
      complex: 'anthropic/claude-3.5-opus',
    },
  };
}

/**
 * Direct Anthropic provider config
 * HIPAA-regulated path — data stays in our infra
 */
export function getAnthropicConfig(): ProviderConfig {
  return {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    modelMap: {
      fast: 'claude-3-5-haiku-20241022',
      standard: 'claude-3-5-sonnet-20241022',
      complex: 'claude-3-5-opus-20241022',
    },
  };
}

/**
 * Determine sensitivity level from tenant's sector
 */
export function classifySensitivity(sector: string | null): SensitivityLevel {
  if (!sector) return 'standard';

  const regulated = ['healthcare', 'legal'];
  return regulated.includes(sector.toLowerCase()) ? 'regulated' : 'standard';
}

/**
 * Resolve which provider to use for a given tenant
 */
export async function resolveProvider(
  tenantId: string,
  sensitivityOverride?: SensitivityLevel
): Promise<{
  provider: LLMProvider;
  config: ProviderConfig;
  sensitivity: SensitivityLevel;
  reason: string;
}> {
  const db = getSupabaseAdmin();

  // Load tenant's sector and admin override
  const { data: tenant } = await db
    .from('tenants')
    .select('sector, current_tools')
    .eq('id', tenantId)
    .single();

  // Check for admin override in tenant metadata
  // (stored in current_tools as JSON — in production would be a dedicated settings table)
  let adminOverride: ProviderOverride = 'auto';
  const tools = tenant?.current_tools;
  if (tools && typeof tools === 'object' && !Array.isArray(tools)) {
    const settings = tools as Record<string, unknown>;
    if (settings.llm_routing && typeof settings.llm_routing === 'string') {
      adminOverride = settings.llm_routing as ProviderOverride;
    }
  }

  // Determine sensitivity
  const autoSensitivity = classifySensitivity(tenant?.sector ?? null);
  const sensitivity = sensitivityOverride ?? autoSensitivity;

  // Resolve provider based on override or sensitivity
  if (adminOverride === 'direct-only') {
    return {
      provider: 'anthropic',
      config: getAnthropicConfig(),
      sensitivity,
      reason: 'Admin override: direct-only',
    };
  }

  if (adminOverride === 'openrouter-only') {
    return {
      provider: 'openrouter',
      config: getOpenRouterConfig(),
      sensitivity,
      reason: 'Admin override: openrouter-only',
    };
  }

  // Auto-route based on sensitivity
  if (sensitivity === 'regulated') {
    const regulatedProvider = process.env.LLM_REGULATED_PROVIDER ?? 'anthropic';
    return {
      provider: regulatedProvider as LLMProvider,
      config: regulatedProvider === 'openrouter' ? getOpenRouterConfig() : getAnthropicConfig(),
      sensitivity,
      reason: `Auto-classified regulated (${tenant?.sector ?? 'unknown sector'})`,
    };
  }

  // Standard path — use default provider
  const defaultProvider = process.env.LLM_DEFAULT_PROVIDER ?? 'openrouter';
  return {
    provider: defaultProvider as LLMProvider,
    config: defaultProvider === 'anthropic' ? getAnthropicConfig() : getOpenRouterConfig(),
    sensitivity,
    reason: 'Auto-classified standard',
  };
}

/**
 * Route and execute an LLM call through the appropriate provider
 * This is the top-level entry point for all AI interactions
 */
export async function routeAndCall(args: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
  sensitivityOverride?: SensitivityLevel;
}): Promise<ModelCallResult & { provider: LLMProvider; sensitivity: SensitivityLevel }> {
  const { query, systemPrompt, tenantId, conversationId, sensitivityOverride } = args;

  // Resolve provider
  const resolution = await resolveProvider(tenantId, sensitivityOverride);

  logger.info('LLM routing decision', {
    tenantId,
    provider: resolution.provider,
    sensitivity: resolution.sensitivity,
    reason: resolution.reason,
    conversationId,
    queryLength: query.length,
  });

  // Call the model through the resolved provider
  // The callModel function handles fallback chain and telemetry
  const result = await callModel({
    query,
    systemPrompt,
    tenantId,
    conversationId,
    provider: resolution.provider,
    providerConfig: resolution.config,
  });

  // Enhanced logging with provider context
  logger.info('LLM call completed', {
    tenantId,
    provider: resolution.provider,
    sensitivity: resolution.sensitivity,
    model: result.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cost: result.cost.toFixed(6),
    latency: result.latency,
    classification: result.classification,
  });

  return {
    ...result,
    provider: resolution.provider,
    sensitivity: resolution.sensitivity,
  };
}

/**
 * Route and stream an LLM call through the appropriate provider.
 * Yields StreamEvents as tokens arrive.
 */
export async function* routeAndStream(args: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
  sensitivityOverride?: SensitivityLevel;
  maxTokens?: number;
}): AsyncGenerator<import('./litellm').StreamEvent> {
  const { query, systemPrompt, tenantId, conversationId, sensitivityOverride, maxTokens } = args;

  const resolution = await resolveProvider(tenantId, sensitivityOverride);

  logger.info('LLM streaming routing decision', {
    tenantId,
    provider: resolution.provider,
    sensitivity: resolution.sensitivity,
    reason: resolution.reason,
    conversationId,
    queryLength: query.length,
  });

  const { callModelStreaming } = await import('./litellm');

  yield* callModelStreaming({
    query,
    systemPrompt,
    tenantId,
    conversationId,
    provider: resolution.provider,
    providerConfig: resolution.config,
    maxTokens,
  });
}

/**
 * Get provider info for display in admin panel
 */
export function getProviderDisplayInfo(provider: LLMProvider): {
  name: string;
  description: string;
  compliance: string[];
} {
  if (provider === 'anthropic') {
    return {
      name: 'Direct Anthropic API',
      description: 'HIPAA-compliant direct connection. Data stays in controlled infrastructure.',
      compliance: ['HIPAA BAA', 'SOC 2 Type II', 'GDPR'],
    };
  }

  return {
    name: 'OpenRouter',
    description: 'Access to 200+ AI models. Best model selected per task.',
    compliance: ['SOC 2 Type II'],
  };
}
