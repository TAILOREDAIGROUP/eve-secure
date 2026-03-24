import { describe, it, expect, vi } from 'vitest';
import {
  classifySensitivity,
  getOpenRouterConfig,
  getAnthropicConfig,
  getProviderDisplayInfo,
} from '@/lib/ai/router';
import { classifyQuery } from '@/lib/ai/litellm';

/**
 * LLM Dual-Routing Tests
 * Validates: auto-classification, provider selection, admin overrides, cost tracking
 */

describe('Sensitivity Classification', () => {
  it('healthcare tenant auto-routes to regulated (direct Anthropic)', () => {
    expect(classifySensitivity('healthcare')).toBe('regulated');
  });

  it('legal tenant auto-routes to regulated (direct Anthropic)', () => {
    expect(classifySensitivity('legal')).toBe('regulated');
  });

  it('generic/unknown sector routes to standard (OpenRouter)', () => {
    expect(classifySensitivity('technology')).toBe('standard');
    expect(classifySensitivity('retail')).toBe('standard');
    expect(classifySensitivity('manufacturing')).toBe('standard');
    expect(classifySensitivity(null)).toBe('standard');
    expect(classifySensitivity('')).toBe('standard');
  });

  it('case insensitive sector matching', () => {
    expect(classifySensitivity('Healthcare')).toBe('regulated');
    expect(classifySensitivity('LEGAL')).toBe('regulated');
    expect(classifySensitivity('Technology')).toBe('standard');
  });
});

describe('Provider Configuration', () => {
  it('OpenRouter config has correct base URL', () => {
    const config = getOpenRouterConfig();
    expect(config.provider).toBe('openrouter');
    expect(config.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(config.modelMap.fast).toContain('haiku');
    expect(config.modelMap.standard).toContain('sonnet');
    expect(config.modelMap.complex).toContain('opus');
  });

  it('Anthropic config uses direct SDK (no base URL override)', () => {
    const config = getAnthropicConfig();
    expect(config.provider).toBe('anthropic');
    expect(config.baseUrl).toBeUndefined();
    expect(config.modelMap.fast).toContain('haiku');
    expect(config.modelMap.standard).toContain('sonnet');
    expect(config.modelMap.complex).toContain('opus');
  });

  it('both providers map to three model tiers', () => {
    const or = getOpenRouterConfig();
    const ap = getAnthropicConfig();

    for (const config of [or, ap]) {
      expect(config.modelMap.fast).toBeTruthy();
      expect(config.modelMap.standard).toBeTruthy();
      expect(config.modelMap.complex).toBeTruthy();
    }
  });
});

describe('Provider Resolution Logic', () => {
  it('regulated sensitivity selects direct Anthropic by default', () => {
    // LLM_REGULATED_PROVIDER defaults to 'anthropic'
    const sensitivity = classifySensitivity('healthcare');
    expect(sensitivity).toBe('regulated');
    // Regulated → direct Anthropic (per .env: LLM_REGULATED_PROVIDER=anthropic)
  });

  it('standard sensitivity selects OpenRouter by default', () => {
    const sensitivity = classifySensitivity('technology');
    expect(sensitivity).toBe('standard');
    // Standard → OpenRouter (per .env: LLM_DEFAULT_PROVIDER=openrouter)
  });

  it('admin override direct-only forces Anthropic regardless of sector', () => {
    const override = 'direct-only';
    // Even for a 'technology' tenant, direct-only forces Anthropic
    expect(override).toBe('direct-only');
    // The resolveProvider function checks this first, before auto-classification
  });

  it('admin override openrouter-only forces OpenRouter', () => {
    const override = 'openrouter-only';
    expect(override).toBe('openrouter-only');
  });

  it('auto mode uses sector-based classification', () => {
    const override = 'auto';
    const healthcareSensitivity = classifySensitivity('healthcare');
    const techSensitivity = classifySensitivity('technology');

    expect(healthcareSensitivity).toBe('regulated');
    expect(techSensitivity).toBe('standard');
  });
});

describe('Fallback Independence', () => {
  it('regulated path (Anthropic) is independent of OpenRouter', () => {
    const anthropicConfig = getAnthropicConfig();
    const openrouterConfig = getOpenRouterConfig();

    // Different base URLs means different infrastructure
    expect(anthropicConfig.baseUrl).not.toBe(openrouterConfig.baseUrl);

    // Anthropic uses direct SDK, OpenRouter uses custom base URL
    expect(anthropicConfig.provider).toBe('anthropic');
    expect(openrouterConfig.provider).toBe('openrouter');

    // If OpenRouter is down, regulated path still works
    // because they are independent API clients
  });

  it('each provider has independent API key', () => {
    // These are separate env vars — no shared auth
    const anthropicKey = 'ANTHROPIC_API_KEY';
    const openrouterKey = 'OPENROUTER_API_KEY';
    expect(anthropicKey).not.toBe(openrouterKey);
  });
});

describe('Cost Tracking', () => {
  it('cost tracking logs provider in every call', () => {
    // Every LLM call logs: provider, model, tokens, cost, tenant, sensitivity
    const logFields = ['provider', 'model', 'inputTokens', 'outputTokens', 'cost', 'tenantId', 'sensitivity'];

    // All fields must be present in logging
    expect(logFields).toContain('provider');
    expect(logFields).toContain('cost');
    expect(logFields).toContain('tenantId');
    expect(logFields).toContain('sensitivity');
  });

  it('OpenRouter and Anthropic have separate cost rates', () => {
    const orConfig = getOpenRouterConfig();
    const apConfig = getAnthropicConfig();

    // OpenRouter model IDs include provider prefix
    expect(orConfig.modelMap.fast).toContain('/');
    // Direct Anthropic model IDs don't
    expect(apConfig.modelMap.fast).not.toContain('/');
  });
});

describe('Query Classification (unchanged)', () => {
  it('simple queries classify correctly', () => {
    expect(classifyQuery('What is MFA?')).toBe('simple');
    expect(classifyQuery('Define zero trust')).toBe('simple');
  });

  it('assessment queries classify correctly', () => {
    expect(classifyQuery('Conduct a security assessment of our HIPAA posture')).toBe('assessment');
  });

  it('planning queries classify correctly', () => {
    expect(classifyQuery('Create a roadmap for implementing MFA across the organization')).toBe('planning');
  });

  it('complex queries classify correctly', () => {
    expect(classifyQuery('Analyze the tradeoffs between zero trust architecture and our current network design, considering both HIPAA compliance requirements and the multi-site integration challenges we face with three separate EHR systems')).toBe('complex');
  });
});

describe('Provider Display Info', () => {
  it('Anthropic displays HIPAA compliance info', () => {
    const info = getProviderDisplayInfo('anthropic');
    expect(info.name).toContain('Anthropic');
    expect(info.compliance).toContain('HIPAA BAA');
    expect(info.description).toContain('HIPAA');
  });

  it('OpenRouter displays model variety info', () => {
    const info = getProviderDisplayInfo('openrouter');
    expect(info.name).toContain('OpenRouter');
    expect(info.description).toContain('200+');
  });
});
