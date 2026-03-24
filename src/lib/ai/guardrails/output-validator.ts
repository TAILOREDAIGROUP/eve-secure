import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/db";
import { z } from "zod";

/**
 * Output validation result
 */
export interface ValidationResult {
  valid: boolean;
  score: number; // 0-100
  issues: ValidationIssue[];
  warnings: string[];
  passedChecks: string[];
  citations: CitationCheck[];
  piiScan: PIIScanResult;
}

/**
 * Individual validation issue
 */
interface ValidationIssue {
  type: "error" | "warning";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  confidence: number;
}

/**
 * Citation validation result
 */
interface CitationCheck {
  citation: string;
  valid: boolean;
  foundInContext: boolean;
  source: string | null;
}

/**
 * Cross-tenant PII scan result
 */
interface PIIScanResult {
  containsPII: boolean;
  findings: Array<{
    type: string;
    location: string;
    confidence: number;
  }>;
  riskScore: number; // 0-100
}

/**
 * Harmful content patterns
 * Prevent responses containing exploit code, attack scripts, etc.
 */
const HARMFUL_PATTERNS = {
  exploitCode: {
    patterns: [
      /(?:exploit code|poc|proof of concept)[\s:]*```|```[\s\S]*?(?:bash|shell|python|javascript|powershell)/gi,
      /\b(?:shellcode|payload|reverse shell|one-liner|one liner)\b[\s:]*\w+/gi,
      /\b(?:curl|wget|nc|netcat|bash)\b.{0,20}(?:pipe|&&|\||sh|bash)/gi,
    ],
    severity: "critical" as const,
  },
  attackMethodology: {
    patterns: [
      /(?:step|steps|how to|guide|tutorial)[\s:]*(?:hack|exploit|bypass|crack|break|attack)/gi,
      /\b(?:brute force|dictionary attack|sql injection|xss|cross-site|privilege escalation|lateral movement)\b[\s:]*(?:using|with|via|through)/gi,
      /\b(?:vulnerability|vuln|cve-?\d{4}-\d{4})[\s:]*(?:step|guide|walkthrough|tutorial)/gi,
    ],
    severity: "critical" as const,
  },
  attackScripts: {
    patterns: [
      /```(?:bash|sh|shell|powershell|cmd|python|javascript)\s*\n[\s\S]*?(?:for\s+(?:i|line)|while|exec|subprocess|system|os\.command)/g,
      /\$\(.*?(?:curl|wget|cat|bash)\b.*?\)/g,
      /\|\s*(?:bash|sh|powershell|cmd)\s*[\)\$]/g,
    ],
    severity: "critical" as const,
  },
  exploitDisclosure: {
    patterns: [
      /\b(?:0day|zero-day|n-day|unpatched|undetected)\b[\s:]*(?:vulnerability|exploit|attack|malware)/gi,
      /\b(?:ransomware|malware|worm|virus|trojan)[\s:]*(?:code|source|sample|implementation)/gi,
    ],
    severity: "high" as const,
  },
};

/**
 * PII patterns for output scanning
 */
const OUTPUT_PII_PATTERNS = {
  ssn: /\b(?:\d{3}-\d{2}-\d{4}|XXX-\d{2}-\d{4})\b/g,
  creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}(?:[-\s]?\d{1,4})?\b/g,
  apiKey: /\b(?:api[_-]?key|secret|token|password)[\s:]*[a-zA-Z0-9]{20,}/gi,
  privateKey: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PRIVATE) KEY-----/gi,
  password: /\b(?:password|passwd|pwd)[\s:]*[^\s]{8,}\b/gi,
  email: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
};

/**
 * Configuration validation schema
 */
const ConfigSchema = z.object({
  maxTokens: z.number().default(4096),
  minTokensForFull: z.number().default(50),
  maxTokensWarn: z.number().default(5000),
  citationCheckEnabled: z.boolean().default(true),
  piiScanEnabled: z.boolean().default(true),
  harmfulContentCheckEnabled: z.boolean().default(true),
  crossTenantPIIScanEnabled: z.boolean().default(true),
});

type Config = z.infer<typeof ConfigSchema>;

/**
 * Get configuration
 */
function getConfig(): Config {
  return ConfigSchema.parse({
    maxTokens: parseInt(process.env.MAX_TOKENS || "4096"),
    maxTokensWarn: parseInt(process.env.MAX_TOKENS_WARN || "5000"),
  });
}

/**
 * Estimate token count (rough approximation)
 * 1 token ≈ 4 characters for English text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check output against regulatory citation matrix
 * Validates that claims reference valid regulatory sources
 */
export async function checkCitations(
  output: string,
  tenantId: string
): Promise<CitationCheck[]> {
  try {
    logger.debug("Checking citations in output", {
      outputLength: output.length,
      tenantId,
    });

    // Extract citation patterns (§, CFR, Rule, Control, etc.)
    const citationPattern =
      /(?:§\s*\d+[\.\-]\d+|CFR\s*§?\s*\d+[\.\-]\d+|\b(?:HIPAA|GDPR|SOC\s*2|ISO\s*27001|PCI-DSS|CIS|NIST|FedRAMP)\b|\b(?:Rule|Standard|Control)\s*[A-Z0-9\-]+)/gi;

    const citationMatches = output.match(citationPattern) || [];
    const uniqueCitations = Array.from(new Set(citationMatches.map((c) => c.toUpperCase())));

    logger.debug("Extracted citations from output", {
      count: uniqueCitations.length,
      citations: uniqueCitations.slice(0, 5),
    });

    const checks: CitationCheck[] = [];

    for (const citation of uniqueCitations) {
      try {
        // Look up citation in compliance matrix
        const supabase = getSupabaseAdmin();
        const { data: complianceEntry } = await supabase
          .from('compliance_matrix')
          .select('*')
          .or(`regulation_id.eq.${citation},regulation_citation.eq.${citation}`)
          .limit(1)
          .single();

        checks.push({
          citation,
          valid: !!complianceEntry,
          foundInContext: !!complianceEntry,
          source: (complianceEntry as any)?.source || null,
        });
      } catch (error) {
        logger.warn("Failed to validate citation", {
          citation,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue checking other citations
      }
    }

    return checks;
  } catch (error) {
    logger.error("Citation checking failed", {
      error: error instanceof Error ? error.message : String(error),
      outputLength: output.length,
    });
    return [];
  }
}

/**
 * Scan output for harmful content
 * Returns matched patterns and severity
 */
export function filterHarmful(output: string): {
  isHarmful: boolean;
  severity: "critical" | "high" | "medium" | "low";
  patterns: Array<{ type: string; severity: string; matches: number }>;
} {
  const config = getConfig();

  if (!config.harmfulContentCheckEnabled) {
    return { isHarmful: false, severity: "low", patterns: [] };
  }

  const matchedPatterns: Array<{
    type: string;
    severity: string;
    matches: number;
  }> = [];
  let maxSeverity: "critical" | "high" | "medium" | "low" = "low";

  for (const [category, { patterns, severity }] of Object.entries(
    HARMFUL_PATTERNS
  )) {
    for (const pattern of patterns) {
      const matches = output.match(pattern);
      if (matches && matches.length > 0) {
        matchedPatterns.push({
          type: category,
          severity,
          matches: matches.length,
        });

        // Update max severity
        if (
          severity === "critical" ||
          (severity === "high" && maxSeverity !== "critical")
        ) {
          maxSeverity = severity;
        }
      }
    }
  }

  logger.warn("Harmful content detected in output", {
    patterns: matchedPatterns.length,
    severity: maxSeverity,
  });

  return {
    isHarmful: matchedPatterns.length > 0,
    severity: maxSeverity,
    patterns: matchedPatterns,
  };
}

/**
 * Scan output for PII/PHI and sensitive data
 * Used to prevent data leakage in responses
 */
function scanForPII(output: string): PIIScanResult {
  const findings: Array<{
    type: string;
    location: string;
    confidence: number;
  }> = [];

  for (const [type, pattern] of Object.entries(OUTPUT_PII_PATTERNS)) {
    const matches = output.match(pattern);
    if (matches && matches.length > 0) {
      matches.forEach((match) => {
        const location = output.indexOf(match);
        findings.push({
          type,
          location: `position ${location}-${location + match.length}`,
          confidence: type === "ssn" || type === "creditCard" ? 0.95 : 0.8,
        });
      });
    }
  }

  // Calculate risk score
  const riskScore =
    findings.length > 0
      ? Math.min(100, findings.length * 10 + findings.length * 5)
      : 0;

  return {
    containsPII: findings.length > 0,
    findings,
    riskScore,
  };
}

/**
 * Scan for cross-tenant PII leakage
 * Ensures output from one tenant doesn't accidentally leak another tenant's data
 */
async function scanCrossTenantPII(
  output: string,
  tenantId: string
): Promise<{ leaked: boolean; affectedTenants: string[] }> {
  try {
    // Extract email addresses and PII patterns
    const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    const emails = output.match(emailPattern) || [];

    const affectedTenants: Set<string> = new Set();

    for (const email of emails) {
      // Check if email belongs to different tenant
      const supabase = getSupabaseAdmin();
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .limit(1)
        .single();

      if (user && user.tenant_id !== tenantId) {
        affectedTenants.add(user.tenant_id);
      }
    }

    return {
      leaked: affectedTenants.size > 0,
      affectedTenants: Array.from(affectedTenants),
    };
  } catch (error) {
    logger.warn("Cross-tenant PII scan failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { leaked: false, affectedTenants: [] };
  }
}

/**
 * Validate output meets safety and security requirements
 * Comprehensive check covering citations, harmful content, PII, token limits
 */
export async function validateOutput(
  output: string,
  context: {
    tenantId: string;
    conversationId?: string;
    systemPrompt?: string;
  }
): Promise<ValidationResult> {
  const config = getConfig();
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  const passedChecks: string[] = [];
  let score = 100;

  try {
    logger.info("Validating output", {
      outputLength: output.length,
      tenantId: context.tenantId,
    });

    // Check 1: Length validation
    const tokens = estimateTokens(output);
    if (tokens < config.minTokensForFull) {
      issues.push({
        type: "warning",
        severity: "low",
        message: `Output is very short (${tokens} tokens)`,
        confidence: 0.8,
      });
      score -= 5;
    } else {
      passedChecks.push("Length check (minimum)");
    }

    if (tokens > config.maxTokensWarn) {
      warnings.push(
        `Output is large (${tokens} tokens), consider summarization`
      );
      score -= 10;
    } else {
      passedChecks.push("Length check (maximum)");
    }

    // Check 2: Citation validation
    const citations = await checkCitations(output, context.tenantId);
    const invalidCitations = citations.filter((c) => !c.valid);

    if (invalidCitations.length > 0) {
      issues.push({
        type: "warning",
        severity: "medium",
        message: `${invalidCitations.length} unverified citations in output`,
        confidence: 0.7,
      });
      score -= 15;
    } else {
      passedChecks.push("Citation validation");
    }

    // Check 3: Harmful content check
    const harmfulCheck = filterHarmful(output);
    if (harmfulCheck.isHarmful) {
      issues.push({
        type: "error",
        severity: harmfulCheck.severity,
        message: `Harmful content detected: ${harmfulCheck.patterns.map((p) => p.type).join(", ")}`,
        confidence: 0.9,
      });
      score -= harmfulCheck.severity === "critical" ? 50 : 30;
    } else {
      passedChecks.push("Harmful content check");
    }

    // Check 4: PII in output
    const piiScan = scanForPII(output);
    if (piiScan.containsPII) {
      issues.push({
        type: "warning",
        severity: "high",
        message: `Detected ${piiScan.findings.length} potential PII/PHI items in output`,
        confidence: 0.8,
      });
      score -= 25;
      warnings.push(
        `PII detected (risk score: ${piiScan.riskScore}/100): ${piiScan.findings.map((f) => f.type).join(", ")}`
      );
    } else {
      passedChecks.push("PII screening");
    }

    // Check 5: Cross-tenant PII leakage
    const crossTenantCheck = await scanCrossTenantPII(output, context.tenantId);
    if (crossTenantCheck.leaked) {
      issues.push({
        type: "error",
        severity: "critical",
        message: `Cross-tenant data leakage detected affecting ${crossTenantCheck.affectedTenants.length} tenant(s)`,
        confidence: 0.95,
      });
      score -= 50;
    } else {
      passedChecks.push("Cross-tenant isolation");
    }

    // Ensure score stays in valid range
    score = Math.max(0, Math.min(100, score));

    const valid =
      issues.filter((i) => i.type === "error").length === 0 &&
      harmfulCheck.severity !== "critical";

    logger.info("Output validation completed", {
      valid,
      score,
      issues: issues.length,
      warnings: warnings.length,
      tenantId: context.tenantId,
    });

    return {
      valid,
      score,
      issues,
      warnings,
      passedChecks,
      citations,
      piiScan,
    };
  } catch (error) {
    logger.error("Output validation failed", {
      error: error instanceof Error ? error.message : String(error),
      outputLength: output.length,
    });

    return {
      valid: false,
      score: 0,
      issues: [
        {
          type: "error",
          severity: "critical",
          message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
          confidence: 1.0,
        },
      ],
      warnings: [],
      passedChecks: [],
      citations: [],
      piiScan: { containsPII: false, findings: [], riskScore: 0 },
    };
  }
}
