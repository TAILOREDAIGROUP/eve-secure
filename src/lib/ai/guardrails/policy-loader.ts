import { logger } from "@/lib/logger";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

/**
 * Policy loader for externalized guardrail YAML/JSON files.
 *
 * Loads guardrail policies from guardrails/policies/ at startup,
 * validates with Zod schemas, and caches parsed results.
 *
 * In dev: reloads on file change.
 * In prod: loads once at startup.
 */

// --- Zod Schemas ---

const PatternEntrySchema = z.object({
  pattern: z.string(),
  flags: z.string().default("gi"),
});

const InjectionCategorySchema = z.object({
  description: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  patterns: z.array(PatternEntrySchema),
});

const InjectionPoliciesSchema = z.object({
  categories: z.record(z.string(), InjectionCategorySchema),
});

const HarmfulCategorySchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low"]),
  description: z.string(),
  patterns: z.array(PatternEntrySchema),
});

const OutputPIIPatternSchema = z.object({
  pattern: z.string(),
  flags: z.string().default("g"),
});

const OutputRulesSchema = z.object({
  token_limits: z.object({
    max_tokens: z.number(),
    min_tokens_for_full: z.number(),
    max_tokens_warn: z.number(),
  }),
  checks: z.object({
    citation_check_enabled: z.boolean(),
    pii_scan_enabled: z.boolean(),
    harmful_content_check_enabled: z.boolean(),
    cross_tenant_pii_scan_enabled: z.boolean(),
  }),
  harmful_content: z.record(z.string(), HarmfulCategorySchema),
  output_pii: z.object({
    description: z.string(),
    patterns: z.record(z.string(), OutputPIIPatternSchema),
  }),
  citation_validation: z.object({
    extraction_pattern: z.string(),
    extraction_flags: z.string(),
    description: z.string().optional(),
  }),
  scoring: z.object({
    description: z.string().optional(),
    short_output: z.number(),
    long_output: z.number(),
    unverified_citations: z.number(),
    harmful_critical: z.number(),
    harmful_high: z.number(),
    pii_detected: z.number(),
    cross_tenant_leak: z.number(),
  }),
});

const ModelConstraintsSchema = z.object({
  models: z.record(
    z.string(),
    z.object({
      id: z.string(),
      max_tokens_per_turn: z.number(),
      use_cases: z.array(z.string()),
      cost_per_1k_input: z.number(),
      cost_per_1k_output: z.number(),
    })
  ),
  context_window: z.object({
    max_context_tokens: z.number(),
    max_section_size: z.number(),
    summary_ratio: z.number(),
    min_knowledge_allocation: z.number(),
    buffer_tokens: z.number(),
  }),
  cost_controls: z.object({
    monthly_budget_per_tenant_usd: z.number(),
    daily_budget_per_tenant_usd: z.number(),
    max_turns_per_session: z.number(),
    cost_alert_threshold_pct: z.number(),
    hard_stop_threshold_pct: z.number(),
  }),
  rate_limits: z.object({
    requests_per_minute_per_tenant: z.number(),
    requests_per_hour_per_tenant: z.number(),
    concurrent_sessions_per_tenant: z.number(),
  }),
});

// --- Types ---

export type InjectionPolicies = z.infer<typeof InjectionPoliciesSchema>;
export type OutputRules = z.infer<typeof OutputRulesSchema>;
export type ModelConstraints = z.infer<typeof ModelConstraintsSchema>;

interface CompiledInjectionPatterns {
  categories: Map<
    string,
    {
      description: string;
      severity: "high" | "medium" | "low";
      patterns: RegExp[];
    }
  >;
  allPatterns: RegExp[];
}

interface CompiledOutputPatterns {
  harmfulPatterns: Map<
    string,
    {
      severity: "critical" | "high" | "medium" | "low";
      patterns: RegExp[];
    }
  >;
  piiPatterns: Map<string, RegExp>;
  citationPattern: RegExp;
}

// --- Cache ---

let cachedInjectionPolicies: InjectionPolicies | null = null;
let cachedOutputRules: OutputRules | null = null;
let cachedModelConstraints: ModelConstraints | null = null;
let cachedCompiledInjection: CompiledInjectionPatterns | null = null;
let cachedCompiledOutput: CompiledOutputPatterns | null = null;

/**
 * Resolve the policies directory path.
 * Works from both src/ (dev) and dist/ (prod) contexts.
 */
function getPoliciesDir(): string {
  // Try relative to project root
  const candidates = [
    path.resolve(process.cwd(), "guardrails", "policies"),
    path.resolve(__dirname, "..", "..", "..", "..", "guardrails", "policies"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  throw new Error(
    `Guardrails policies directory not found. Searched: ${candidates.join(", ")}`
  );
}

/**
 * Parse a YAML file. Uses simple key-value parsing for YAML subset we use.
 * For full YAML support, install js-yaml: npm install js-yaml @types/js-yaml
 */
function parseYAML(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf-8");

  // Use JSON.parse if it's a .json file
  if (filePath.endsWith(".json")) {
    return JSON.parse(content);
  }

  // For YAML, we use a lightweight approach:
  // Convert our YAML subset to JSON via line-by-line parsing
  // This handles the specific YAML structure we use in our policy files.
  //
  // For production, replace with: import yaml from 'js-yaml'; return yaml.load(content);
  try {
    // Try dynamic import of js-yaml if available
    // eslint-disable-next-line
    const yaml = require("js-yaml");
    return yaml.load(content);
  } catch {
    // Fallback: the policy files should also be available as JSON
    const jsonPath = filePath.replace(/\.yaml$/, ".json");
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }

    throw new Error(
      `Cannot parse ${filePath}: install js-yaml (npm install js-yaml) or provide a .json alternative`
    );
  }
}

/**
 * Compile a pattern string + flags into a RegExp
 */
function compilePattern(entry: { pattern: string; flags: string }): RegExp {
  return new RegExp(entry.pattern, entry.flags);
}

// --- Public API ---

/**
 * Load and validate injection patterns from policy file.
 * Returns cached result on subsequent calls.
 */
export function loadInjectionPolicies(): InjectionPolicies {
  if (cachedInjectionPolicies) return cachedInjectionPolicies;

  const policiesDir = getPoliciesDir();
  const filePath = path.join(policiesDir, "injection-patterns.yaml");

  logger.info("Loading injection policies", { path: filePath });

  const raw = parseYAML(filePath);
  cachedInjectionPolicies = InjectionPoliciesSchema.parse(raw);

  const totalPatterns = Object.values(cachedInjectionPolicies.categories).reduce(
    (sum, cat) => sum + cat.patterns.length,
    0
  );

  logger.info("Injection policies loaded", {
    categories: Object.keys(cachedInjectionPolicies.categories).length,
    totalPatterns,
  });

  return cachedInjectionPolicies;
}

/**
 * Get compiled RegExp patterns for injection detection.
 * Compiles once and caches.
 */
export function getCompiledInjectionPatterns(): CompiledInjectionPatterns {
  if (cachedCompiledInjection) return cachedCompiledInjection;

  const policies = loadInjectionPolicies();
  const categories = new Map<
    string,
    { description: string; severity: "high" | "medium" | "low"; patterns: RegExp[] }
  >();
  const allPatterns: RegExp[] = [];

  for (const [name, category] of Object.entries(policies.categories)) {
    const compiled = category.patterns.map(compilePattern);
    categories.set(name, {
      description: category.description,
      severity: category.severity,
      patterns: compiled,
    });
    allPatterns.push(...compiled);
  }

  cachedCompiledInjection = { categories, allPatterns };
  return cachedCompiledInjection;
}

/**
 * Load and validate output rules from policy file.
 */
export function loadOutputRules(): OutputRules {
  if (cachedOutputRules) return cachedOutputRules;

  const policiesDir = getPoliciesDir();
  const filePath = path.join(policiesDir, "output-rules.yaml");

  logger.info("Loading output rules", { path: filePath });

  const raw = parseYAML(filePath);
  cachedOutputRules = OutputRulesSchema.parse(raw);

  logger.info("Output rules loaded", {
    harmfulCategories: Object.keys(cachedOutputRules.harmful_content).length,
    piiPatterns: Object.keys(cachedOutputRules.output_pii.patterns).length,
  });

  return cachedOutputRules;
}

/**
 * Get compiled RegExp patterns for output validation.
 */
export function getCompiledOutputPatterns(): CompiledOutputPatterns {
  if (cachedCompiledOutput) return cachedCompiledOutput;

  const rules = loadOutputRules();

  const harmfulPatterns = new Map<
    string,
    { severity: "critical" | "high" | "medium" | "low"; patterns: RegExp[] }
  >();

  for (const [name, category] of Object.entries(rules.harmful_content)) {
    harmfulPatterns.set(name, {
      severity: category.severity,
      patterns: category.patterns.map(compilePattern),
    });
  }

  const piiPatterns = new Map<string, RegExp>();
  for (const [name, entry] of Object.entries(rules.output_pii.patterns)) {
    piiPatterns.set(name, compilePattern(entry));
  }

  const citationPattern = new RegExp(
    rules.citation_validation.extraction_pattern,
    rules.citation_validation.extraction_flags
  );

  cachedCompiledOutput = { harmfulPatterns, piiPatterns, citationPattern };
  return cachedCompiledOutput;
}

/**
 * Load and validate model constraints from policy file.
 */
export function loadModelConstraints(): ModelConstraints {
  if (cachedModelConstraints) return cachedModelConstraints;

  const policiesDir = getPoliciesDir();
  const filePath = path.join(policiesDir, "model-constraints.yaml");

  logger.info("Loading model constraints", { path: filePath });

  const raw = parseYAML(filePath);
  cachedModelConstraints = ModelConstraintsSchema.parse(raw);

  logger.info("Model constraints loaded", {
    models: Object.keys(cachedModelConstraints.models).length,
  });

  return cachedModelConstraints;
}

/**
 * Clear all cached policies. Call this to force reload
 * (e.g., after policy file update in dev mode).
 */
export function clearPolicyCache(): void {
  cachedInjectionPolicies = null;
  cachedOutputRules = null;
  cachedModelConstraints = null;
  cachedCompiledInjection = null;
  cachedCompiledOutput = null;
  logger.info("Policy cache cleared");
}

/**
 * Validate all policy files without loading them into cache.
 * Useful for CI validation.
 */
export function validateAllPolicies(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  try {
    const policiesDir = getPoliciesDir();

    const files = [
      { name: "injection-patterns.yaml", schema: InjectionPoliciesSchema },
      { name: "output-rules.yaml", schema: OutputRulesSchema },
      { name: "model-constraints.yaml", schema: ModelConstraintsSchema },
    ];

    for (const { name, schema } of files) {
      const filePath = path.join(policiesDir, name);
      try {
        const raw = parseYAML(filePath);
        schema.parse(raw);
      } catch (error) {
        errors.push(
          `${name}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  } catch (error) {
    errors.push(
      `Policy directory: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
