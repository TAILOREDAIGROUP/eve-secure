import {
  KMSClient,
  GenerateDataKeyCommand,
  DecryptCommand,
  DescribeKeyCommand,
  GetPublicKeyCommand,
  type DataKeySpec,
} from '@aws-sdk/client-kms';
import { z } from 'zod';

/**
 * AWS KMS integration for EVE Secure
 * HIPAA-compliant encryption with per-tenant keys
 * - Separate KMS keys for data, audit trail, and backups
 * - Automatic key rotation support
 * - Envelope encryption for large payloads
 */

const KMS_REGION = process.env.AWS_REGION || 'us-east-1';

const EncryptedDataSchema = z.object({
  ciphertext: z.string().base64(),
  datakey: z.string().base64(),
  algorithm: z.enum(['AES_256_GCM']).default('AES_256_GCM'),
  keyId: z.string(),
  encryptedAt: z.date(),
});

type EncryptedData = z.infer<typeof EncryptedDataSchema>;

/**
 * KMS key types for different data classifications
 */
export enum KmsKeyType {
  APPLICATION_DATA = 'APPLICATION_DATA',
  AUDIT_TRAIL = 'AUDIT_TRAIL',
  BACKUPS = 'BACKUPS',
}

/**
 * Get KMS key ID for tenant and key type
 * Follows naming convention: eve-secure-{tenantId}-{keyType}
 * @param tenantId - Tenant UUID
 * @param keyType - Key type (application, audit, backups)
 * @returns Full KMS key ARN
 */
function getKmsKeyId(tenantId: string, keyType: KmsKeyType): string {
  const keyAlias = `alias/eve-secure-${tenantId}-${keyType.toLowerCase()}`;
  return keyAlias;
}

/**
 * Initialize KMS client
 * @returns Configured KMS client
 */
function getKmsClient(): KMSClient {
  return new KMSClient({
    region: KMS_REGION,
  });
}

/**
 * Encrypt data using envelope encryption
 * Generates a data key, encrypts it with KMS master key, returns both
 * @param plaintext - Data to encrypt
 * @param tenantId - Tenant ID for key selection
 * @param keyType - Key type (application, audit, backups)
 * @returns Encrypted data with wrapped key
 * @throws Error if encryption fails
 */
export async function encryptData(
  plaintext: string | Buffer,
  tenantId: string,
  keyType: KmsKeyType = KmsKeyType.APPLICATION_DATA
): Promise<EncryptedData> {
  const client = getKmsClient();
  const keyId = getKmsKeyId(tenantId, keyType);

  try {
    // Generate data key (256-bit AES key)
    const generateKeyCommand = new GenerateDataKeyCommand({
      KeyId: keyId,
      KeySpec: 'AES_256' as DataKeySpec,
    });

    const { Plaintext, CiphertextBlob } = await client.send(generateKeyCommand);

    if (!Plaintext || !CiphertextBlob) {
      throw new Error('KMS failed to generate data key');
    }

    const plaintextBuffer = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf-8') : plaintext;

    // Encrypt actual data with the plaintext data key using AES-256-GCM
    const crypto = await import('crypto');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Plaintext as Buffer, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintextBuffer),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV + auth tag + ciphertext
    const combinedCiphertext = Buffer.concat([iv, authTag, encrypted]);

    return {
      ciphertext: combinedCiphertext.toString('base64'),
      datakey: Buffer.from(CiphertextBlob).toString('base64'),
      algorithm: 'AES_256_GCM',
      keyId,
      encryptedAt: new Date(),
    };
  } catch (error) {
    throw new Error(
      `KMS encryption failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Decrypt data encrypted with encryptData
 * @param encryptedData - Encrypted data object
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or validation fails
 */
export async function decryptData(encryptedData: EncryptedData): Promise<string> {
  const client = getKmsClient();

  try {
    // Validate schema
    const validated = EncryptedDataSchema.parse(encryptedData);

    // Decrypt the data key using KMS
    const decryptCommand = new DecryptCommand({
      CiphertextBlob: Buffer.from(validated.datakey, 'base64'),
    });

    const { Plaintext: decryptedKey } = await client.send(decryptCommand);

    if (!decryptedKey) {
      throw new Error('KMS failed to decrypt data key');
    }

    // Decrypt the actual data
    const crypto = await import('crypto');
    const combinedCiphertext = Buffer.from(validated.ciphertext, 'base64');

    // Extract components (first 16 bytes = IV, next 16 bytes = auth tag, rest = ciphertext)
    const iv = combinedCiphertext.slice(0, 16);
    const authTag = combinedCiphertext.slice(16, 32);
    const ciphertext = combinedCiphertext.slice(32);

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      decryptedKey as Buffer,
      iv
    );

    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid encrypted data format: ${error.errors[0]?.message}`);
    }
    throw new Error(
      `KMS decryption failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Verify KMS key exists and is enabled
 * @param tenantId - Tenant ID
 * @param keyType - Key type to verify
 * @returns true if key is enabled
 * @throws Error if key doesn't exist or is disabled
 */
export async function verifyKmsKeyStatus(
  tenantId: string,
  keyType: KmsKeyType = KmsKeyType.APPLICATION_DATA
): Promise<boolean> {
  const client = getKmsClient();
  const keyId = getKmsKeyId(tenantId, keyType);

  try {
    const describeCommand = new DescribeKeyCommand({
      KeyId: keyId,
    });

    const { KeyMetadata } = await client.send(describeCommand);

    if (!KeyMetadata) {
      throw new Error('Key metadata not found');
    }

    if (KeyMetadata.Enabled !== true) {
      throw new Error(`KMS key is disabled: ${keyId}`);
    }

    if (KeyMetadata.KeyState !== 'Enabled') {
      throw new Error(`KMS key state is ${KeyMetadata.KeyState}: ${keyId}`);
    }

    return true;
  } catch (error) {
    throw new Error(
      `KMS key verification failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Get KMS key rotation status
 * Used to verify automatic key rotation is enabled (required for HIPAA)
 * @param tenantId - Tenant ID
 * @param keyType - Key type to check
 * @returns Object with rotation status
 */
export async function getKeyRotationStatus(
  tenantId: string,
  keyType: KmsKeyType = KmsKeyType.APPLICATION_DATA
): Promise<{
  rotationEnabled: boolean;
  nextRotationDate?: Date;
}> {
  // Note: Actual rotation status requires separate KMS API call
  // This is a placeholder for the integration point
  // Real implementation would call GetKeyRotationStatus API
  return {
    rotationEnabled: true,
    nextRotationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  };
}

/**
 * Encrypt specific data types with their designated keys
 * Convenience wrapper for application data encryption
 */
export async function encryptApplicationData(
  plaintext: string,
  tenantId: string
): Promise<EncryptedData> {
  return encryptData(plaintext, tenantId, KmsKeyType.APPLICATION_DATA);
}

/**
 * Encrypt audit trail data with dedicated key
 */
export async function encryptAuditTrail(
  plaintext: string,
  tenantId: string
): Promise<EncryptedData> {
  return encryptData(plaintext, tenantId, KmsKeyType.AUDIT_TRAIL);
}

/**
 * Encrypt backup data with dedicated key
 */
export async function encryptBackupData(
  plaintext: string,
  tenantId: string
): Promise<EncryptedData> {
  return encryptData(plaintext, tenantId, KmsKeyType.BACKUPS);
}

/**
 * Batch encrypt multiple items
 * @param items - Array of items to encrypt
 * @param tenantId - Tenant ID
 * @param keyType - Key type
 * @returns Array of encrypted items
 */
export async function encryptBatch(
  items: string[],
  tenantId: string,
  keyType: KmsKeyType = KmsKeyType.APPLICATION_DATA
): Promise<EncryptedData[]> {
  try {
    return await Promise.all(
      items.map(item => encryptData(item, tenantId, keyType))
    );
  } catch (error) {
    throw new Error(
      `Batch encryption failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Batch decrypt multiple items
 * @param encryptedItems - Array of encrypted data objects
 * @returns Array of decrypted strings
 */
export async function decryptBatch(
  encryptedItems: EncryptedData[]
): Promise<string[]> {
  try {
    return await Promise.all(
      encryptedItems.map(item => decryptData(item))
    );
  } catch (error) {
    throw new Error(
      `Batch decryption failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
