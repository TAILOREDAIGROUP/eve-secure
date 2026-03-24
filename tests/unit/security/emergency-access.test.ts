import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  generateEmergencyAccessCodes,
  validateEmergencyCode,
  invalidateEmergencyCode,
  areAllCodesExhausted,
  getRemainingCodeCount,
  hashCodeForLogging,
} from '@/lib/auth/emergency-access';

describe('Emergency Access Codes', () => {
  const TEST_USER_ID = '33333333-3333-3333-3333-333333333333';
  const TEST_TENANT_ID = '11111111-1111-1111-1111-111111111111';

  describe('generateEmergencyAccessCodes', () => {
    it('generates exactly 8 codes', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      expect(displayCodes).toHaveLength(8);
      expect(config.hashed_codes).toHaveLength(8);
    });

    it('generates codes in correct format (8 uppercase alphanumeric chars)', async () => {
      const { displayCodes } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      for (const code of displayCodes) {
        expect(code).toMatch(/^[A-Z0-9]{8}$/);
      }
    });

    it('generates unique codes each time', async () => {
      const result1 = await generateEmergencyAccessCodes(TEST_USER_ID, TEST_TENANT_ID);
      const result2 = await generateEmergencyAccessCodes(TEST_USER_ID, TEST_TENANT_ID);

      // Codes from two generations should not overlap
      const overlap = result1.displayCodes.filter((c) =>
        result2.displayCodes.includes(c)
      );
      expect(overlap.length).toBe(0);
    });

    it('stores only bcrypt hashes, not plaintext', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      for (const hash of config.hashed_codes) {
        // bcrypt hashes start with $2a$ or $2b$
        expect(hash).toMatch(/^\$2[ab]\$/);
        // Hashes should NOT equal any plaintext code
        expect(displayCodes).not.toContain(hash);
      }
    });
  });

  describe('validateEmergencyCode', () => {
    it('validates a correct unused code', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const isValid = await validateEmergencyCode(displayCodes[0]!, config);
      expect(isValid).toBe(true);
    });

    it('rejects an incorrect code', async () => {
      const { config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const isValid = await validateEmergencyCode('WRONG123', config);
      expect(isValid).toBe(false);
    });

    it('rejects a used code on second use', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const code = displayCodes[0]!;

      // First validation succeeds
      const firstValid = await validateEmergencyCode(code, config);
      expect(firstValid).toBe(true);

      // Invalidate (mark as used)
      const updatedConfig = await invalidateEmergencyCode(code, config);

      // Second validation fails — code is now in used_codes
      const secondValid = await validateEmergencyCode(code, updatedConfig);
      expect(secondValid).toBe(false);
    });

    it('is case insensitive', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const code = displayCodes[0]!;
      const isValid = await validateEmergencyCode(code.toLowerCase(), config);
      expect(isValid).toBe(true);
    });
  });

  describe('invalidateEmergencyCode', () => {
    it('marks code as used', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const updatedConfig = await invalidateEmergencyCode(displayCodes[0]!, config);
      expect(updatedConfig.used_codes).toContain(displayCodes[0]!.toUpperCase());
      expect(updatedConfig.last_used_at).toBeDefined();
    });

    it('throws on invalid code', async () => {
      const { config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      await expect(
        invalidateEmergencyCode('BADCODE1', config)
      ).rejects.toThrow('Invalid or already-used emergency code');
    });

    it('throws on already-used code', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      const code = displayCodes[0]!;
      const updatedConfig = await invalidateEmergencyCode(code, config);

      await expect(
        invalidateEmergencyCode(code, updatedConfig)
      ).rejects.toThrow('Invalid or already-used emergency code');
    });
  });

  describe('Code exhaustion', () => {
    it('areAllCodesExhausted returns false when codes remain', async () => {
      const { config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );
      expect(areAllCodesExhausted(config)).toBe(false);
    });

    it('getRemainingCodeCount returns correct count', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      expect(getRemainingCodeCount(config)).toBe(8);

      const updated = await invalidateEmergencyCode(displayCodes[0]!, config);
      expect(getRemainingCodeCount(updated)).toBe(7);
    });
  });

  describe('Plaintext codes not stored in database', () => {
    it('config.hashed_codes contains only bcrypt hashes', async () => {
      const { displayCodes, config } = await generateEmergencyAccessCodes(
        TEST_USER_ID,
        TEST_TENANT_ID
      );

      // No plaintext code should appear anywhere in the config
      for (const code of displayCodes) {
        expect(JSON.stringify(config)).not.toContain(code);
      }

      // All stored values should be bcrypt hashes
      for (const hash of config.hashed_codes) {
        expect(hash.startsWith('$2')).toBe(true);
        expect(hash.length).toBeGreaterThan(50);
      }
    });

    it('hashCodeForLogging produces SHA-256 not plaintext', () => {
      const code = 'TESTCODE';
      const logged = hashCodeForLogging(code);

      expect(logged).not.toBe(code);
      expect(logged).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
    });
  });
});
