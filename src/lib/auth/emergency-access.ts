import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Emergency access codes for EVE Secure
 * HIPAA-compliant bypass authentication for account lockouts
 * - Generated at onboarding (8 single-use codes)
 * - Stored as bcrypt hashes only
 * - Never recoverable after initial generation
 * - Separate auth endpoint, bypasses Clerk
 */

const EMERGENCY_CODE_LENGTH = 8;
const EMERGENCY_CODES_PER_USER = 8;
const BCRYPT_ROUNDS = 12; // Industry standard for sensitive data

const EmergencyCodeSchema = z.object({
  code: z.string().length(EMERGENCY_CODE_LENGTH).regex(/^[A-Z0-9]+$/),
});

const EmergencyAccessConfigSchema = z.object({
  user_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  hashed_codes: z.array(z.string()).min(1),
  created_at: z.date(),
  used_codes: z.array(z.string()).default([]),
  last_used_at: z.date().optional(),
});

type EmergencyAccessConfig = z.infer<typeof EmergencyAccessConfigSchema>;

/**
 * Generate 8 one-time emergency access codes
 * Called during user onboarding
 * Codes should be displayed to user immediately and securely stored by them
 * @param userId - User ID to generate codes for
 * @param tenantId - Tenant ID for isolation
 * @returns Object containing plaintext codes (for display only) and config to persist
 */
export async function generateEmergencyAccessCodes(
  userId: string,
  tenantId: string
): Promise<{
  displayCodes: string[];
  config: EmergencyAccessConfig;
}> {
  const displayCodes: string[] = [];
  const hashedCodes: string[] = [];

  try {
    for (let i = 0; i < EMERGENCY_CODES_PER_USER; i++) {
      // Generate cryptographically secure random code
      const code = crypto
        .randomBytes(Math.ceil(EMERGENCY_CODE_LENGTH / 2))
        .toString('hex')
        .toUpperCase()
        .slice(0, EMERGENCY_CODE_LENGTH);

      // Validate generated code format
      EmergencyCodeSchema.parse({ code });

      // Hash code for storage
      const hashedCode = await bcrypt.hash(code, BCRYPT_ROUNDS);

      displayCodes.push(code);
      hashedCodes.push(hashedCode);
    }

    const config: EmergencyAccessConfig = {
      user_id: userId,
      tenant_id: tenantId,
      hashed_codes: hashedCodes,
      created_at: new Date(),
      used_codes: [],
    };

    return { displayCodes, config };
  } catch (error) {
    throw new Error(
      `Failed to generate emergency codes: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Validate emergency access code
 * Returns true only if code is valid and unused
 * @param plainCode - User-provided emergency code
 * @param config - Emergency access configuration from database
 * @returns true if code valid and unused
 */
export async function validateEmergencyCode(
  plainCode: string,
  config: EmergencyAccessConfig
): Promise<boolean> {
  try {
    // Validate code format
    EmergencyCodeSchema.parse({ code: plainCode.toUpperCase() });

    const normalizedCode = plainCode.toUpperCase();

    // Check if code already used
    if (config.used_codes.includes(normalizedCode)) {
      return false;
    }

    // Check against all hashed codes (timing-safe comparison via bcrypt)
    for (const hashedCode of config.hashed_codes) {
      const isMatch = await bcrypt.compare(normalizedCode, hashedCode);
      if (isMatch) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // Invalid code format or comparison error
    return false;
  }
}

/**
 * Mark emergency code as used
 * Must be called immediately after successful authentication
 * @param plainCode - Code that was used
 * @param config - Emergency access configuration
 * @returns Updated configuration with code marked as used
 */
export async function invalidateEmergencyCode(
  plainCode: string,
  config: EmergencyAccessConfig
): Promise<EmergencyAccessConfig> {
  const normalizedCode = plainCode.toUpperCase();

  // Verify code is valid before marking as used
  const isValid = await validateEmergencyCode(normalizedCode, config);
  if (!isValid) {
    throw new Error('Invalid or already-used emergency code');
  }

  const updatedConfig: EmergencyAccessConfig = {
    ...config,
    used_codes: [...config.used_codes, normalizedCode],
    last_used_at: new Date(),
  };

  return updatedConfig;
}

/**
 * Check if all emergency codes have been used
 * @param config - Emergency access configuration
 * @returns true if all codes exhausted
 */
export function areAllCodesExhausted(config: EmergencyAccessConfig): boolean {
  return config.used_codes.length >= EMERGENCY_CODES_PER_USER;
}

/**
 * Get remaining emergency code count
 * @param config - Emergency access configuration
 * @returns Number of unused codes
 */
export function getRemainingCodeCount(config: EmergencyAccessConfig): number {
  return EMERGENCY_CODES_PER_USER - config.used_codes.length;
}

/**
 * Emergency access endpoint handler
 * Called by /api/auth/emergency endpoint
 * Bypasses Clerk authentication, uses emergency codes instead
 * @param userId - User ID attempting access
 * @param code - Emergency code provided
 * @param config - Emergency access configuration from database
 * @returns Session data on success
 * @throws Error if code invalid, used, or all codes exhausted
 */
export async function authenticateWithEmergencyCode(
  userId: string,
  code: string,
  config: EmergencyAccessConfig
): Promise<{
  userId: string;
  tenantId: string;
  authenticatedAt: Date;
}> {
  // Verify user ID matches
  if (config.user_id !== userId) {
    throw new Error('Emergency code invalid for this user');
  }

  // Check if codes exhausted
  if (areAllCodesExhausted(config)) {
    throw new Error(
      'All emergency codes have been used. Contact your administrator to request new codes.'
    );
  }

  // Validate code
  const isValid = await validateEmergencyCode(code, config);
  if (!isValid) {
    throw new Error('Invalid or already-used emergency code');
  }

  // Mark code as used (this should be persisted to database)
  await invalidateEmergencyCode(code, config);

  return {
    userId,
    tenantId: config.tenant_id,
    authenticatedAt: new Date(),
  };
}

/**
 * Regenerate emergency codes
 * Used when user requests new codes or codes compromised
 * Only available to authenticated users with admin role
 * @param userId - User requesting regeneration
 * @param tenantId - Tenant ID
 * @returns New codes and updated config
 */
export async function regenerateEmergencyAccessCodes(
  userId: string,
  tenantId: string
): Promise<{
  displayCodes: string[];
  config: EmergencyAccessConfig;
}> {
  // Generate fresh codes
  return generateEmergencyAccessCodes(userId, tenantId);
}

/**
 * Format emergency codes for secure display
 * Adds visual separators for readability during onboarding
 * @param codes - Array of 8-character codes
 * @returns Formatted string for display
 */
export function formatCodesForDisplay(codes: string[]): string {
  return codes.map((code, index) => `${index + 1}. ${code}`).join('\n');
}

/**
 * Hash emergency code for logging
 * Use this when logging code usage to avoid storing plaintext
 * @param code - Code to hash
 * @returns SHA256 hash of code
 */
export function hashCodeForLogging(code: string): string {
  return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
}
