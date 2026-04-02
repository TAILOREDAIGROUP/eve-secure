import { logger } from "@/lib/logger";
import { z } from "zod";
import { getCompiledInjectionPatterns } from "./policy-loader";

/**
 * Input sanitization and validation results
 */
export interface SanitizationResult {
  sanitized: string;
  originalLength: number;
  finalLength: number;
  injectionDetected: boolean;
  piiDetected: boolean[];
  injectionPatterns: string[];
  piiPatterns: string[];
  warnings: string[];
}

/**
 * Detected PII/PHI information
 */
export interface PIIDetectionResult {
  type: "ssn" | "mrn" | "credit_card" | "dob" | "email" | "phone" | "ip_address";
  pattern: string;
  confidence: number;
}

/**
 * Configuration for sanitization
 */
const CONFIG = {
  maxInputLength: 4000,
  minInputLength: 1,
  normalizationForm: "NFKC" as const,
  timeoutMs: 5000,
};

/**
 * PII detection patterns with high precision
 */
const PII_PATTERNS = {
  ssn: {
    pattern: /\b(?:\d{3}-?\d{2}-?\d{4}|XXX-?\d{2}-?\d{4})\b/g,
    type: "ssn" as const,
    confidence: 0.95,
    description: "Social Security Number",
  },
  mrn: {
    pattern:
      /\b(MRN|Medical Record Number|Patient ID)[\s:]*(\d{6,10}|[A-Z0-9]{6,10})\b/gi,
    type: "mrn" as const,
    confidence: 0.85,
    description: "Medical Record Number",
  },
  creditCard: {
    pattern:
      /\b(?:\d{4}[-\s]?){3}\d{4}(?:[-\s]?\d{1,4})?\b|(?:visa|mastercard|amex|discover)[\s:]*\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{2,4}/gi,
    type: "credit_card" as const,
    confidence: 0.9,
    description: "Credit Card Number",
  },
  dob: {
    pattern:
      /\b(?:dob|date of birth|birthday)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/gi,
    type: "dob" as const,
    confidence: 0.8,
    description: "Date of Birth",
  },
  email: {
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    type: "email" as const,
    confidence: 0.95,
    description: "Email Address",
  },
  phone: {
    pattern: /\b(?:\+?1[-.]?)?(?:\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}|[0-9]{10,11})\b/g,
    type: "phone" as const,
    confidence: 0.8,
    description: "Phone Number",
  },
  ipAddress: {
    pattern:
      /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    type: "ip_address" as const,
    confidence: 0.9,
    description: "IP Address",
  },
};

/**
 * Get injection patterns from externalized policy files.
 * Falls back to hardcoded patterns if policy loading fails.
 */
function getInjectionPatterns(): RegExp[] {
  try {
    const compiled = getCompiledInjectionPatterns();
    return compiled.allPatterns;
  } catch (error) {
    logger.warn("Failed to load injection policies, using hardcoded fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return FALLBACK_INJECTION_PATTERNS;
  }
}

/**
 * Fallback injection patterns (used only if policy files are unavailable).
 * The canonical source is guardrails/policies/injection-patterns.yaml.
 */
const FALLBACK_INJECTION_PATTERNS = [
  /(?:ignore|forget|disregard|override|bypass|disable|suppress).{0,20}(?:instruction|prompt|system|previous|above|rule|constraint|guardrail)/gi,
  /(?:you are|you will now|from now on|act as).{0,30}(?:unfiltered|unrestricted|jailbroken|evil|malicious|helpful|unethical)/gi,
  /(?:show|reveal|display|print|output|tell me).{0,20}(?:your prompt|system prompt|instructions|constraints|rules|guidelines)/gi,
  /\b(?:admin|developer|system administrator|root).{0,20}(?:override|authorization|password|credentials)\b/gi,
  /(?:urgent|emergency|critical|immediately|now|asap).{0,30}(?:override|disable|bypass|ignore).{0,30}(?:safety|filter|rule|constraint)/gi,
  /(?:roleplay|role play|act|pretend|simulate).{0,20}(?:without|ignoring|bypassing).{0,20}(?:safety|filter|rule|constraint|guideline)/gi,
  /(?:<!|<\?xml|<script|<iframe|<embed|<object)/gi,
  /(?:token|jwt|bearer|authorization).{0,50}(?:fake|forged|spoofed|bypass|override)/gi,
];

/**
 * Normalize Unicode in input
 * Prevents Unicode-based obfuscation attacks
 */
function normalizeUnicode(input: string): string {
  try {
    return input.normalize(CONFIG.normalizationForm);
  } catch (error) {
    logger.warn("Unicode normalization failed, returning original", {
      error: error instanceof Error ? error.message : String(error),
    });
    return input;
  }
}

/**
 * Remove or escape HTML/script tags
 */
function sanitizeHTML(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<embed[^>]*>/gi, "")
    .replace(/<object[^>]*>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Event handlers
    .replace(/javascript:/gi, ""); // JavaScript protocol
}

/**
 * Detect prompt injection attempts in input
 * Returns matched patterns and severity assessment
 */
export function detectInjection(input: string): {
  detected: boolean;
  patterns: string[];
  severity: "high" | "medium" | "low";
  details: Array<{ pattern: string; matches: number }>;
} {
  const matchedPatterns: Map<string, number> = new Map();
  const detailedMatches: Array<{ pattern: string; matches: number }> = [];

  const injectionPatterns = getInjectionPatterns();

  for (const pattern of injectionPatterns) {
    const matches = input.match(pattern);
    if (matches && matches.length > 0) {
      const patternStr = pattern.source.substring(0, 50);
      matchedPatterns.set(patternStr, matches.length);
      detailedMatches.push({
        pattern: patternStr,
        matches: matches.length,
      });
    }
  }

  const detected = matchedPatterns.size > 0;
  const matchCount = Array.from(matchedPatterns.values()).reduce(
    (a, b) => a + b,
    0
  );

  // Assess severity based on number of matched patterns
  let severity: "high" | "medium" | "low" = "low";
  if (matchedPatterns.size >= 3 || matchCount >= 5) {
    severity = "high";
  } else if (matchedPatterns.size >= 2 || matchCount >= 3) {
    severity = "medium";
  }

  return {
    detected,
    patterns: Array.from(matchedPatterns.keys()),
    severity,
    details: detailedMatches,
  };
}

/**
 * Detect personally identifiable information (PII) and protected health information (PHI)
 * Flags sensitive data but does not block input
 * Returns detailed findings with confidence scores
 */
export function detectPII(input: string): PIIDetectionResult[] {
  const findings: PIIDetectionResult[] = [];

  for (const [key, config] of Object.entries(PII_PATTERNS)) {
    const matches = input.match(config.pattern);
    if (matches && matches.length > 0) {
      matches.forEach((match) => {
        findings.push({
          type: config.type,
          pattern: match,
          confidence: config.confidence,
        });
      });
    }
  }

  return findings;
}

/**
 * Sanitize input for security and safety
 * Performs comprehensive validation and cleaning
 */
export function sanitizeInput(input: string): SanitizationResult {
  const startLength = input.length;
  const warnings: string[] = [];
  const piiResults: PIIDetectionResult[] = [];
  const injectionResult = detectInjection(input);

  try {
    // Validate length
    if (input.length < CONFIG.minInputLength) {
      throw new Error("Input is too short");
    }
    if (input.length > CONFIG.maxInputLength) {
      throw new Error(
        `Input exceeds maximum length of ${CONFIG.maxInputLength} characters`
      );
    }

    // Normalize Unicode
    let sanitized = normalizeUnicode(input);

    // Detect PII (flag but don't block)
    piiResults.push(...detectPII(sanitized));
    if (piiResults.length > 0) {
      warnings.push(
        `Detected ${piiResults.length} potential PII/PHI items (flagged but not blocked)`
      );
      logger.warn("PII detected in input", {
        count: piiResults.length,
        types: Array.from(new Set(piiResults.map((p) => p.type))),
      });
    }

    // Check injection patterns
    if (injectionResult.detected) {
      warnings.push(
        `Input contains ${injectionResult.patterns.length} potential prompt injection patterns`
      );
      logger.warn("Prompt injection patterns detected", {
        severity: injectionResult.severity,
        patternCount: injectionResult.patterns.length,
      });

      if (injectionResult.severity === "high") {
        throw new Error("High-severity prompt injection patterns detected");
      }

      if (injectionResult.severity === "medium") {
        throw new Error("Medium-severity prompt injection patterns detected");
      }
    }

    // Sanitize HTML/script tags
    sanitized = sanitizeHTML(sanitized);

    // Trim whitespace
    sanitized = sanitized.trim();

    // Check for null bytes
    if (sanitized.includes("\x00")) {
      throw new Error("Input contains null bytes");
    }

    return {
      sanitized,
      originalLength: startLength,
      finalLength: sanitized.length,
      injectionDetected: injectionResult.detected,
      piiDetected: piiResults.map((p) => p.confidence > 0),
      injectionPatterns: injectionResult.patterns,
      piiPatterns: piiResults.map((p) => `${p.type}(confidence:${p.confidence})`),
      warnings,
    };
  } catch (error) {
    logger.error("Input sanitization failed", {
      error: error instanceof Error ? error.message : String(error),
      inputLength: input.length,
    });
    throw error;
  }
}

/**
 * Validate input meets EVE Secure requirements
 * Throws on critical issues, returns warnings for minor ones
 */
export function validateInput(
  input: string
): { valid: boolean; result: SanitizationResult; errors: string[] } {
  const errors: string[] = [];

  try {
    const result = sanitizeInput(input);

    // Critical failures
    if (result.injectionDetected && result.injectionPatterns.length > 5) {
      errors.push("Input detected as prompt injection attack");
    }

    return {
      valid: errors.length === 0,
      result,
      errors,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    throw new Error(`Input validation failed: ${errors.join("; ")}`);
  }
}
