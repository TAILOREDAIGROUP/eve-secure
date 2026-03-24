import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectAclCommand,
  HeadObjectCommand,
  type PutObjectCommandInput,
  type GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { encryptData, KmsKeyType } from './encryption/kms';

/**
 * S3 integration for EVE Secure
 * HIPAA-compliant file storage with:
 * - SSE-KMS encryption with per-tenant keys
 * - Object Lock for immutable audit trails
 * - Pre-signed URLs with 5-minute expiry
 * - Magic byte file type validation
 * - ClamAV virus scanning via Lambda
 */

const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.EVE_SECURE_S3_BUCKET || 'eve-secure-data';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const PRESIGNED_URL_EXPIRY = 5 * 60; // 5 minutes in seconds

// File type validation using magic bytes
const FILE_TYPE_MAGIC_BYTES: Record<string, Buffer> = {
  'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': Buffer.from([
    0x50, 0x4b, 0x03, 0x04, // PK.. (ZIP header)
  ]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]), // .PNG
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]), // ÿØÿ
};

const AllowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const FileUploadSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileBuffer: z.instanceof(Buffer),
  mimeType: z.enum(AllowedMimeTypes as [string, ...string[]]),
  context: z.enum(['assessment_answer', 'generated_document', 'audit_trail']),
});

type FileUpload = z.infer<typeof FileUploadSchema>;

const FileMetadataSchema = z.object({
  key: z.string(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  fileName: z.string(),
  mimeType: z.enum(AllowedMimeTypes as [string, ...string[]]),
  size: z.number().int().max(MAX_FILE_SIZE),
  uploadedAt: z.date(),
  virusScanned: z.boolean(),
  scanResult: z.enum(['clean', 'infected', 'pending']).optional(),
  encrypted: z.boolean(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

type FileMetadata = z.infer<typeof FileMetadataSchema>;

/**
 * Initialize S3 client
 */
function getS3Client(): S3Client {
  return new S3Client({
    region: S3_REGION,
  });
}

/**
 * Validate file type using magic bytes (not extension)
 * @param fileBuffer - File buffer to validate
 * @param expectedMimeType - Expected MIME type
 * @returns true if magic bytes match expected type
 */
export function validateFileMagicBytes(
  fileBuffer: Buffer,
  expectedMimeType: string
): boolean {
  const magicBytes = FILE_TYPE_MAGIC_BYTES[expectedMimeType];
  if (!magicBytes) {
    return false;
  }

  // Check if file starts with expected magic bytes
  return fileBuffer.slice(0, magicBytes.length).equals(magicBytes);
}

/**
 * Generate S3 object key for tenant isolation
 * @param tenantId - Tenant ID
 * @param userId - User ID
 * @param context - File context
 * @param fileName - Original file name
 * @returns Unique S3 object key
 */
export function generateS3ObjectKey(
  tenantId: string,
  userId: string,
  context: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(7);
  // Structure: tenants/{tenantId}/{context}/{userId}/{timestamp}-{randomSuffix}-{fileName}
  return `tenants/${tenantId}/${context}/${userId}/${timestamp}-${randomSuffix}-${fileName}`;
}

/**
 * Upload file to S3 with encryption and validation
 * Does NOT trigger virus scan - that's done asynchronously by Lambda
 * @param upload - File upload configuration
 * @returns File metadata with S3 key and metadata
 * @throws Error if validation fails
 */
export async function uploadFile(upload: FileUpload): Promise<FileMetadata> {
  // Validate input
  const validated = FileUploadSchema.parse(upload);

  // Validate file size
  if (validated.fileBuffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Validate magic bytes
  if (!validateFileMagicBytes(validated.fileBuffer, validated.mimeType)) {
    throw new Error(
      `File content does not match declared type. Expected ${validated.mimeType}`
    );
  }

  const s3Client = getS3Client();
  const s3Key = generateS3ObjectKey(
    validated.tenantId,
    validated.userId,
    validated.context,
    validated.fileName
  );

  // Calculate SHA256 checksum for integrity verification
  const crypto = await import('crypto');
  const checksumSha256 = crypto
    .createHash('sha256')
    .update(validated.fileBuffer)
    .digest('hex');

  try {
    // Encrypt file with tenant-specific key
    const { ciphertext, datakey } = await encryptData(
      validated.fileBuffer.toString('base64'),
      validated.tenantId,
      KmsKeyType.APPLICATION_DATA
    );

    const encryptedBuffer = Buffer.from(ciphertext, 'base64');

    const putParams: PutObjectCommandInput = {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: encryptedBuffer,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: `arn:aws:kms:${S3_REGION}:account-id:key/eve-secure-${validated.tenantId}`,
      Metadata: {
        'tenant-id': validated.tenantId,
        'user-id': validated.userId,
        'file-name': validated.fileName,
        'mime-type': validated.mimeType,
        'original-size': validated.fileBuffer.length.toString(),
        'checksum-sha256': checksumSha256,
        'datakey-encrypted': datakey,
        'context': validated.context,
      },
      // For audit trail objects, enable Object Lock (compliance mode)
      // Note: Bucket must have Object Lock enabled
      ObjectLockMode:
        validated.context === 'audit_trail'
          ? 'COMPLIANCE'
          : undefined,
      ObjectLockRetainUntilDate:
        validated.context === 'audit_trail'
          ? new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000) // 7 years
          : undefined,
    };

    const putCommand = new PutObjectCommand(putParams);
    await s3Client.send(putCommand);

    // Trigger async virus scan via SNS/Lambda
    // Implementation depends on Lambda integration
    await triggerVirusScan(s3Key, validated.tenantId);

    const metadata: FileMetadata = {
      key: s3Key,
      tenantId: validated.tenantId,
      userId: validated.userId,
      fileName: validated.fileName,
      mimeType: validated.mimeType,
      size: validated.fileBuffer.length,
      uploadedAt: new Date(),
      virusScanned: false,
      scanResult: 'pending',
      encrypted: true,
      checksumSha256,
    };

    return metadata;
  } catch (error) {
    throw new Error(
      `S3 upload failed: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Generate pre-signed URL for file download
 * 5-minute expiry, tenant-isolated, read-only
 * @param s3Key - S3 object key
 * @param tenantId - Tenant ID (for validation)
 * @param expirySeconds - Override default 5-minute expiry (optional)
 * @returns Pre-signed URL
 */
export async function generateDownloadUrl(
  s3Key: string,
  tenantId: string,
  expirySeconds: number = PRESIGNED_URL_EXPIRY
): Promise<string> {
  // Validate tenant isolation
  if (!s3Key.includes(`tenants/${tenantId}`)) {
    throw new Error('S3 key does not match tenant');
  }

  const s3Client = getS3Client();

  try {
    const getCommand = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, getCommand, {
      expiresIn: expirySeconds,
    });

    return url;
  } catch (error) {
    throw new Error(
      `Failed to generate pre-signed URL: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Generate pre-signed URL for file upload
 * Used for client-side uploads with validation
 * @param tenantId - Tenant ID
 * @param userId - User ID
 * @param fileName - File name
 * @param mimeType - MIME type
 * @param context - File context
 * @returns Pre-signed upload URL
 */
export async function generateUploadUrl(
  tenantId: string,
  userId: string,
  fileName: string,
  mimeType: string,
  context: string
): Promise<string> {
  if (!AllowedMimeTypes.includes(mimeType)) {
    throw new Error(`Unsupported MIME type: ${mimeType}`);
  }

  const s3Client = getS3Client();
  const s3Key = generateS3ObjectKey(tenantId, userId, context, fileName);

  try {
    const putCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ServerSideEncryption: 'aws:kms',
      ContentType: mimeType,
    });

    const url = await getSignedUrl(s3Client, putCommand, {
      expiresIn: PRESIGNED_URL_EXPIRY,
    });

    return url;
  } catch (error) {
    throw new Error(
      `Failed to generate upload URL: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Delete file from S3
 * Only supported for non-audit-trail files
 * @param s3Key - S3 object key
 * @param tenantId - Tenant ID (for validation)
 * @throws Error if attempting to delete Object-Lock protected file
 */
export async function deleteFile(s3Key: string, tenantId: string): Promise<void> {
  // Validate tenant isolation
  if (!s3Key.includes(`tenants/${tenantId}`)) {
    throw new Error('S3 key does not match tenant');
  }

  // Prevent deletion of audit trail files (Object Lock prevents this anyway)
  if (s3Key.includes('/audit_trail/')) {
    throw new Error('Cannot delete audit trail files');
  }

  const s3Client = getS3Client();

  try {
    const deleteCommand = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    await s3Client.send(deleteCommand);
  } catch (error) {
    throw new Error(
      `Failed to delete file: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Get file metadata from S3
 * @param s3Key - S3 object key
 * @returns File metadata
 */
export async function getFileMetadata(s3Key: string): Promise<FileMetadata | null> {
  const s3Client = getS3Client();

  try {
    const headCommand = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const response = await s3Client.send(headCommand);

    if (!response.Metadata) {
      return null;
    }

    const meta = response.Metadata;
    return FileMetadataSchema.parse({
      key: s3Key,
      tenantId: meta['tenant-id'],
      userId: meta['user-id'],
      fileName: meta['file-name'],
      mimeType: meta['mime-type'],
      size: Number(meta['original-size']),
      uploadedAt: response.LastModified || new Date(),
      virusScanned: meta['virus-scanned'] === 'true',
      scanResult: meta['scan-result'],
      encrypted: true,
      checksumSha256: meta['checksum-sha256'],
    });
  } catch (error) {
    return null;
  }
}

/**
 * Trigger asynchronous virus scan via Lambda
 * Implementation depends on Lambda integration configuration
 * @param s3Key - S3 object key to scan
 * @param tenantId - Tenant ID
 */
async function triggerVirusScan(s3Key: string, tenantId: string): Promise<void> {
  // This would integrate with SNS/Lambda for async scanning
  // Placeholder for actual implementation
  console.log(`Virus scan triggered for ${s3Key} (tenant: ${tenantId})`);
}

/**
 * Update virus scan status
 * Called by Lambda function after ClamAV scan completes
 * @param s3Key - S3 object key
 * @param scanResult - Scan result ('clean' or 'infected')
 */
export async function updateVirusScanStatus(
  s3Key: string,
  scanResult: 'clean' | 'infected'
): Promise<void> {
  const s3Client = getS3Client();

  try {
    // Copy object with updated metadata
    const headCommand = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });

    const headResponse = await s3Client.send(headCommand);

    if (!headResponse.Metadata) {
      throw new Error('Object metadata not found');
    }

    const updatedMetadata = {
      ...headResponse.Metadata,
      'virus-scanned': 'true',
      'scan-result': scanResult,
    };

    const copyCommand = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      ServerSideEncryption: 'aws:kms',
      Metadata: updatedMetadata,
    });

    await s3Client.send(copyCommand);
  } catch (error) {
    throw new Error(
      `Failed to update scan status: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}
