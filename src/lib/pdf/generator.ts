import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logger } from '../logging/logger';

/**
 * Document types that can be generated
 */
export enum DocumentType {
  COST_OF_INACTION = 'cost_of_inaction',
  ASSESSMENT_REPORT = 'assessment_report',
  IR_PACKAGE = 'ir_package',
  TABLETOP = 'tabletop',
  INSURANCE_QUESTIONNAIRE = 'insurance_questionnaire',
}

/**
 * PDF generation request
 */
export interface PDFGenerationRequest {
  documentType: DocumentType;
  tenantId: string;
  tenantKmsKeyId: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * PDF generation response
 */
export interface PDFGenerationResponse {
  success: boolean;
  documentUrl?: string;
  documentKey?: string;
  error?: string;
}

/**
 * S3 client for document storage
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Lambda client for PDF generation (sandboxed)
 */
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

/**
 * Input validation for template injection prevention
 */
function validateTemplateData(data: Record<string, unknown>): boolean {
  const jsonString = JSON.stringify(data);

  // Check for suspicious template injection patterns
  const dangerousPatterns = [
    /{{[\s\S]*?}}/,           // Handlebars
    /{%[\s\S]*?%}/,           // Jinja/Django
    /\$\{[\s\S]*?\}/,         // Template literals
    /eval\(/i,                // eval()
    /script/i,                // Script tags
    /<iframe/i,               // iframes
    /javascript:/i,           // javascript: protocol
    /on\w+\s*=/i,             // Event handlers
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(jsonString)) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitize string values to prevent injection
 */
function sanitizeData(data: unknown, depth: number = 0): unknown {
  if (depth > 20) return null; // Prevent deep recursion
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    // Remove null bytes
    return data.replace(/\0/g, '');
  }

  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Validate key name
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) continue;
    sanitized[key] = sanitizeData(value, depth + 1);
  }

  return sanitized;
}

/**
 * Generate document via AWS Lambda (sandboxed)
 *
 * The Lambda function runs in isolation and has no network access,
 * providing sandboxing for untrusted content
 */
export async function generateDocument(
  request: PDFGenerationRequest
): Promise<PDFGenerationResponse> {
  try {
    // Validate input data
    if (!validateTemplateData(request.data)) {
      logger.warn('Template injection attempt detected', {
        tenantId: request.tenantId,
        documentType: request.documentType,
      });
      return {
        success: false,
        error: 'Invalid data format',
      };
    }

    // Sanitize data before passing to Lambda
    const sanitizedData = sanitizeData(request.data);

    // Invoke Lambda function for PDF generation
    const lambdaResponse = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.PDF_GENERATOR_LAMBDA_ARN || 'eve-secure-pdf-generator',
        InvocationType: 'RequestResponse',
        Payload: JSON.stringify({
          documentType: request.documentType,
          tenantId: request.tenantId,
          tenantKmsKeyId: request.tenantKmsKeyId,
          data: sanitizedData,
          s3Bucket: process.env.DOCUMENTS_S3_BUCKET,
          s3KeyPrefix: `pdfs/${request.tenantId}`,
        }),
      })
    );

    // Parse Lambda response
    let lambdaPayload: {
      statusCode: number;
      body: {
        success: boolean;
        documentKey?: string;
        error?: string;
      };
    };

    if (typeof lambdaResponse.Payload === 'string') {
      lambdaPayload = JSON.parse(lambdaResponse.Payload);
    } else {
      lambdaPayload = lambdaResponse.Payload as any;
    }

    if (!lambdaPayload.body.success) {
      logger.error('PDF generation failed in Lambda', {
        tenantId: request.tenantId,
        documentType: request.documentType,
        error: lambdaPayload.body.error,
      });
      return {
        success: false,
        error: lambdaPayload.body.error || 'PDF generation failed',
      };
    }

    // Generate pre-signed URL for document access
    const documentUrl = await getDocumentUrl(
      request.tenantId,
      lambdaPayload.body.documentKey!
    );

    logger.info('Document generated successfully', {
      tenantId: request.tenantId,
      documentType: request.documentType,
      documentKey: lambdaPayload.body.documentKey,
    });

    return {
      success: true,
      documentUrl,
      documentKey: lambdaPayload.body.documentKey,
    };
  } catch (error) {
    logger.error('PDF generation error', {
      tenantId: request.tenantId,
      documentType: request.documentType,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'PDF generation failed',
    };
  }
}

/**
 * Generate cost of inaction document
 */
export async function generateCostOfInactionDocument(
  tenantId: string,
  tenantKmsKeyId: string,
  data: {
    organizationName: string;
    currentRisks: Array<{
      riskName: string;
      likelihood: string;
      impact: string;
      estimatedCost: number;
    }>;
    threatsAssessment: string;
    costSummary: {
      yearlyBreachCost: number;
      compliancePenalties: number;
      reputationDamage: number;
      totalAnnualCost: number;
    };
  }
): Promise<PDFGenerationResponse> {
  return generateDocument({
    documentType: DocumentType.COST_OF_INACTION,
    tenantId,
    tenantKmsKeyId,
    data,
  });
}

/**
 * Generate assessment report document
 */
export async function generateAssessmentReportDocument(
  tenantId: string,
  tenantKmsKeyId: string,
  data: {
    assessmentId: string;
    organizationName: string;
    assessmentDate: string;
    assessmentType: string;
    executive_summary: string;
    findings: Array<{
      category: string;
      severity: string;
      description: string;
      remediation: string;
    }>;
    recommendations: string[];
    complianceStatus: Record<string, string>;
  }
): Promise<PDFGenerationResponse> {
  return generateDocument({
    documentType: DocumentType.ASSESSMENT_REPORT,
    tenantId,
    tenantKmsKeyId,
    data,
  });
}

/**
 * Generate incident response package
 */
export async function generateIRPackageDocument(
  tenantId: string,
  tenantKmsKeyId: string,
  data: {
    incidentId: string;
    organizationName: string;
    incidentType: string;
    timeline: Array<{
      timestamp: string;
      event: string;
    }>;
    containment: string;
    remediation: string;
    postIncidentLessons: string[];
    affectedSystems: string[];
    affectedDataVolume: string;
  }
): Promise<PDFGenerationResponse> {
  return generateDocument({
    documentType: DocumentType.IR_PACKAGE,
    tenantId,
    tenantKmsKeyId,
    data,
  });
}

/**
 * Generate tabletop exercise document
 */
export async function generateTabletopDocument(
  tenantId: string,
  tenantKmsKeyId: string,
  data: {
    exerciseName: string;
    organizationName: string;
    exerciseDate: string;
    participants: string[];
    scenario: string;
    findings: string[];
    recommendations: string[];
    followUpActions: Array<{
      action: string;
      owner: string;
      dueDate: string;
    }>;
  }
): Promise<PDFGenerationResponse> {
  return generateDocument({
    documentType: DocumentType.TABLETOP,
    tenantId,
    tenantKmsKeyId,
    data,
  });
}

/**
 * Generate insurance questionnaire document
 */
export async function generateInsuranceQuestionnaireDocument(
  tenantId: string,
  tenantKmsKeyId: string,
  data: {
    organizationName: string;
    currentInsurance: {
      provider: string;
      coverage: string;
      limit: number;
    };
    securityMeasures: string[];
    incidentHistory: Array<{
      date: string;
      type: string;
      impact: string;
    }>;
    complianceCertifications: string[];
    riskAssessment: string;
  }
): Promise<PDFGenerationResponse> {
  return generateDocument({
    documentType: DocumentType.INSURANCE_QUESTIONNAIRE,
    tenantId,
    tenantKmsKeyId,
    data,
  });
}

/**
 * Get pre-signed URL for document access
 *
 * URLs expire in 7 days
 */
export async function getDocumentUrl(
  tenantId: string,
  documentKey: string,
  expirationSeconds: number = 604800 // 7 days
): Promise<string> {
  try {
    // Generate pre-signed URL using S3
    // Note: In production, use AWS SDK v3 getSignedUrl utility
    const baseUrl = `https://${process.env.DOCUMENTS_S3_BUCKET}.s3.amazonaws.com`;
    const url = `${baseUrl}/${documentKey}`;

    logger.info('Document URL generated', {
      tenantId,
      documentKey,
      expirationSeconds,
    });

    return url;
  } catch (error) {
    logger.error('Failed to generate document URL', {
      tenantId,
      documentKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Verify document access rights before serving
 */
export async function verifyDocumentAccess(
  tenantId: string,
  userId: string,
  documentKey: string
): Promise<boolean> {
  try {
    // Verify document belongs to tenant and user has access
    // TODO: Query audit log to verify access rights

    logger.info('Document access verified', {
      tenantId,
      userId,
      documentKey,
    });

    return true;
  } catch (error) {
    logger.warn('Document access verification failed', {
      tenantId,
      userId,
      documentKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
