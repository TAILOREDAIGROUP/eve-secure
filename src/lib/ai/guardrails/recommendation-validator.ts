/**
 * Recommendation sanity validator
 * Catches disproportionate, sector-mismatched, or scale-mismatched recommendations
 * before they reach the client
 */

import { logger } from "@/lib/logger";
import type { OrgProfile } from "@/types";

/**
 * Validation flag types
 */
export type FlagType = "DISPROPORTIONATE" | "SECTOR_MISMATCH" | "SCALE_MISMATCH";

/**
 * Individual validation flag
 */
export interface ValidationFlag {
  type: FlagType;
  message: string;
  detail: string;
}

/**
 * Result of recommendation validation
 */
export interface RecommendationValidationResult {
  valid: boolean;
  flags: ValidationFlag[];
  disclaimers: string[];
  originalText: string;
  validatedText: string;
}

/**
 * Dollar amount extraction pattern
 * Matches: $500K, $1M, $1.5M, $500,000, $1,000,000, etc.
 */
const DOLLAR_PATTERN = /\$\s*([\d,]+(?:\.\d+)?)\s*([KkMmBb](?:illion)?)?/g;

/**
 * Parse a dollar string into a numeric value
 */
function parseDollarAmount(amount: string, suffix?: string): number {
  const num = parseFloat(amount.replace(/,/g, ""));
  if (!suffix) return num;

  const s = suffix.toUpperCase();
  if (s === "K") return num * 1_000;
  if (s === "M" || s.startsWith("M")) return num * 1_000_000;
  if (s === "B" || s.startsWith("B")) return num * 1_000_000_000;
  return num;
}

/**
 * Extract all dollar amounts from recommendation text
 */
function extractDollarAmounts(text: string): number[] {
  const amounts: number[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  const pattern = new RegExp(DOLLAR_PATTERN.source, DOLLAR_PATTERN.flags);
  while ((match = pattern.exec(text)) !== null) {
    amounts.push(parseDollarAmount(match[1], match[2]));
  }

  return amounts;
}

/**
 * Healthcare-specific terms that should not appear in non-healthcare recommendations
 */
const HEALTHCARE_TERMS = [
  /\bHIPAA\b/i,
  /\bPHI\b/,
  /\bprotected health information\b/i,
  /\bHHS\b/,
  /\bhealth and human services\b/i,
  /\bHITECH\b/i,
  /\bclinical\s+data\b/i,
  /\bpatient\s+records?\b/i,
  /\bEHR\b/,
  /\bEMR\b/,
];

/**
 * Enterprise-scale terms inappropriate for small organizations
 */
const ENTERPRISE_SCALE_TERMS = [
  /\benterprise\s+SOC\b/i,
  /\b24\/7\s+(?:security\s+)?monitoring\b/i,
  /\b24x7\s+(?:security\s+)?monitoring\b/i,
  /\bsecurity\s+operations\s+center\b/i,
  /\bdedicated\s+(?:security\s+)?team\b/i,
  /\bCISO\b/,
  /\bfull[- ]time\s+security\s+(?:analyst|engineer|team)\b/i,
];

/**
 * Validate a recommendation against the org profile for sanity
 */
export function validateRecommendation(
  recommendation: string,
  orgProfile: OrgProfile
): RecommendationValidationResult {
  const flags: ValidationFlag[] = [];

  // Check 1: Disproportionate cost
  checkDisproportionateCost(recommendation, orgProfile, flags);

  // Check 2: Sector mismatch
  checkSectorMismatch(recommendation, orgProfile, flags);

  // Check 3: Scale mismatch
  checkScaleMismatch(recommendation, orgProfile, flags);

  // Build disclaimers for flagged items
  const disclaimers = flags.map((flag) => {
    switch (flag.type) {
      case "DISPROPORTIONATE":
        return `⚠️ COST ADVISORY: One or more recommendations may exceed typical budget thresholds for an organization of this size ($${formatRevenue(orgProfile.annualRevenue)} revenue). Please validate cost estimates with vendors before proceeding.`;
      case "SECTOR_MISMATCH":
        return `⚠️ SECTOR ADVISORY: This recommendation references regulations or frameworks that may not apply to your industry (${orgProfile.sector}). Verify applicability with your compliance team.`;
      case "SCALE_MISMATCH":
        return `⚠️ SCALE ADVISORY: One or more recommendations are typically suited for larger organizations. Consider managed/shared service alternatives appropriate for a ${orgProfile.employees}-employee organization.`;
    }
  });

  // Deduplicate disclaimers
  const uniqueDisclaimers = [...new Set(disclaimers)];

  // Build validated text with disclaimers appended
  const validatedText =
    flags.length > 0
      ? `${recommendation}\n\n---\n${uniqueDisclaimers.join("\n\n")}`
      : recommendation;

  // Log warnings for flagged recommendations
  if (flags.length > 0) {
    logger.warn("Recommendation validation flags triggered", {
      flagCount: flags.length,
      flagTypes: flags.map((f) => f.type),
      orgSector: orgProfile.sector,
      orgEmployees: orgProfile.employees,
      orgRevenue: orgProfile.annualRevenue,
    });
  }

  return {
    valid: flags.length === 0,
    flags,
    disclaimers: uniqueDisclaimers,
    originalText: recommendation,
    validatedText,
  };
}

/**
 * Check if any dollar amounts exceed 15% of annual revenue
 */
function checkDisproportionateCost(
  text: string,
  orgProfile: OrgProfile,
  flags: ValidationFlag[]
): void {
  const amounts = extractDollarAmounts(text);
  const maxBudget = orgProfile.annualRevenue * 0.15;

  for (const amount of amounts) {
    if (amount > maxBudget) {
      flags.push({
        type: "DISPROPORTIONATE",
        message: `Recommended cost $${formatRevenue(amount)} exceeds 15% of annual revenue ($${formatRevenue(maxBudget)})`,
        detail: `Organization revenue: $${formatRevenue(orgProfile.annualRevenue)}, Max budget (15%): $${formatRevenue(maxBudget)}, Found: $${formatRevenue(amount)}`,
      });
      break; // One flag is enough
    }
  }
}

/**
 * Check if healthcare-specific terms appear for non-healthcare orgs
 */
function checkSectorMismatch(
  text: string,
  orgProfile: OrgProfile,
  flags: ValidationFlag[]
): void {
  const isHealthcare =
    orgProfile.sector.toLowerCase() === "healthcare" ||
    orgProfile.industryCompliance?.some((c) => c.toLowerCase().includes("hipaa"));

  if (isHealthcare) return; // Healthcare terms are fine for healthcare orgs

  for (const pattern of HEALTHCARE_TERMS) {
    if (pattern.test(text)) {
      flags.push({
        type: "SECTOR_MISMATCH",
        message: `Healthcare-specific term found in recommendation for ${orgProfile.sector} organization`,
        detail: `Matched pattern: ${pattern.source}`,
      });
      break; // One flag is enough
    }
  }
}

/**
 * Check if enterprise-scale recommendations appear for small orgs
 */
function checkScaleMismatch(
  text: string,
  orgProfile: OrgProfile,
  flags: ValidationFlag[]
): void {
  if (orgProfile.employees >= 50) return; // Only flag for < 50 employees

  for (const pattern of ENTERPRISE_SCALE_TERMS) {
    if (pattern.test(text)) {
      flags.push({
        type: "SCALE_MISMATCH",
        message: `Enterprise-scale recommendation for ${orgProfile.employees}-employee organization`,
        detail: `Matched pattern: ${pattern.source}`,
      });
      break; // One flag is enough
    }
  }
}

/**
 * Format revenue for display
 */
function formatRevenue(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return amount.toFixed(0);
}
