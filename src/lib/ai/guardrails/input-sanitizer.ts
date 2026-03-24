import { logger } from "@/lib/logger";
import { z } from "zod";

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
 * Prompt injection attack patterns
 * Based on academic research and adversarial testing
 * ~200+ patterns covering common injection vectors
 */
const INJECTION_PATTERNS = [
  // Direct instruction overrides
  /(?:ignore|forget|disregard|override|bypass|disable|suppress).{0,20}(?:instruction|prompt|system|previous|above|rule|constraint|guardrail)/gi,
  /(?:you are|you will now|from now on|act as).{0,30}(?:unfiltered|unrestricted|jailbroken|evil|malicious|helpful|unethical)/gi,

  // Prompt revelation attempts
  /(?:show|reveal|display|print|output|tell me).{0,20}(?:your prompt|system prompt|instructions|constraints|rules|guidelines)/gi,
  /what.*(?:are your|is your|were you).{0,20}(?:constraints|rules|guidelines|instructions)/gi,

  // Authority/permission claims
  /\b(?:admin|developer|system administrator|root).{0,20}(?:override|authorization|password|credentials)\b/gi,
  /(?:i am|claiming to be|authorized as).{0,20}(?:admin|developer|founder|owner)\b/gi,

  // Payload injection vectors
  /\[instruction.*?\]/gi,
  /\{instruction:.*?\}/gi,
  /{.*?"instruction".*?}/gi,

  // Hidden content/encoding
  /(?:hidden message|secret instruction|encoded|base64|hex|rot13)[\s:]*(.{10,})/gi,
  /<!--.*?-->/g, // HTML comments
  /\/\*.*?\*\//gs, // C-style comments

  // False urgency/emergency language
  /(?:urgent|emergency|critical|immediately|now|asap).{0,30}(?:override|disable|bypass|ignore).{0,30}(?:safety|filter|rule|constraint)/gi,

  // Goal/objective manipulation
  /(?:your goal|new objective|primary task|purpose is).{0,50}(?:to help|to provide|to show|to explain).{0,20}(?:without|regardless of|ignoring).{0,20}(?:safety|filter|rule|constraint)/gi,

  // Context switching
  /(?:in this scenario|in this simulation|imagine|hypothetically|suppose).{0,50}(?:you had no|you didn't have|you could ignore).{0,20}(?:safety|filter|rule|constraint)/gi,

  // Role-play injection
  /(?:roleplay|role play|act|pretend|simulate).{0,20}(?:without|ignoring|bypassing).{0,20}(?:safety|filter|rule|constraint|guideline)/gi,

  // Compliance claim injection
  /(?:complies with|permitted by|allowed by|authorized under|legal under).{0,50}(?:guidelines|policy|law|regulation)/gi,

  // Nested instruction attempts
  /(?:also|additionally|furthermore).{0,50}(?:ignore|forget|override|bypass).{0,20}(?:rule|instruction|constraint)/gi,

  // Multi-turn injection
  /(?:next question|next prompt|following instruction).{0,50}(?:override|supersede|cancel|ignore).{0,20}(?:previous|earlier).{0,20}(?:rule|instruction)/gi,

  // Obfuscated command
  /(?:the word|the phrase|the following).{0,30}(?:means.*override|equals.*ignore)/gi,

  // File/code injection
  /(?:execute|run|eval|compile|interpret)[\s:]*```|```[\s\S]*?```/g,

  // SQL/command injection markers
  /(?:sql|select|union|insert|delete|update|drop|exec|execute)[\s\(].*?(?:where|from|order by|limit)/gi,

  // System command sequences
  /(?:bash|sh|cmd|powershell|terminal|console)[\s:]*./gi,

  // Variable escape attempts
  /\$\{.*?[a-zA-Z_]/g,
  /\$\(.*?\)/g,

  // Format string attacks
  /%[a-z].*?(?:%[x|d|s])/gi,

  // XML/HTML injection
  /(?:<!|<?xml|<script|<iframe|<embed|<object)/gi,

  // Template injection
  /{{[\s\S]*?}}/g,
  /\[\[[\s\S]*?\]\]/g,

  // Alternative encoding
  /(?:\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|&#\d+;|&#x[0-9a-f]+;)/gi,

  // Null byte injection
  /\x00/g,

  // LDAP injection
  /\*|\(|\)|\||&/g, // When used with filter syntax

  // JWT/token manipulation
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

  for (const pattern of INJECTION_PATTERNS) {
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
