import { z } from 'zod';

// ============================================================================
// US States enum for onboarding
// ============================================================================
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'DC', 'AS', 'GU', 'MP', 'PR', 'VI'
] as const;

// ============================================================================
// Notification Preferences Schema
// ============================================================================
export const NotificationPrefsSchema = z.object({
  emailEnabled: z.boolean().default(true),
  smsEnabled: z.boolean().default(false),
  phoneNumber: z.string().regex(/^\+?1?\d{10}$/).optional(),
});

export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

// ============================================================================
// Onboarding Schema
// ============================================================================
export const OnboardingSchema = z.object({
  orgName: z.string().min(1).max(255),
  sector: z.enum(['healthcare', 'legal']),
  state: z.enum(US_STATES),
  employeeCount: z.number().int().min(1).max(100000),
  itBudgetRange: z.enum(['0-50k', '50k-100k', '100k-500k', '500k-1m', '1m+']),
  currentTools: z.array(z.string()).min(0).max(20),
  ehrSystem: z.string().optional(),
  dmsSystem: z.string().optional(),
  hasCyberInsurance: z.boolean(),
  carrierName: z.string().optional(),
  notificationPrefs: NotificationPrefsSchema,
});

export type OnboardingRequest = z.infer<typeof OnboardingSchema>;

// ============================================================================
// Assessment Response Schema
// ============================================================================
export const AssessmentResponseSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string(),
  section: z.string(),
  responseText: z.string().min(1).max(5000),
});

export type AssessmentResponse = z.infer<typeof AssessmentResponseSchema>;

// ============================================================================
// Plan Generation Schema
// ============================================================================
export const PlanGenerationSchema = z.object({
  sessionId: z.string().uuid(),
  budgetConstraint: z.enum(['minimal', 'moderate', 'aggressive']).optional(),
});

export type PlanGenerationRequest = z.infer<typeof PlanGenerationSchema>;

// ============================================================================
// Document Generation Schema
// ============================================================================
export const DocumentGenerationSchema = z.object({
  sessionId: z.string().uuid(),
  docType: z.enum([
    'cost_of_inaction',
    'assessment_report',
    'ir_package',
    'tabletop',
    'insurance_questionnaire',
  ]),
});

export type DocumentGenerationRequest = z.infer<typeof DocumentGenerationSchema>;

// ============================================================================
// Admin User Schema
// ============================================================================
export const AdminUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['super_admin', 'admin', 'analyst']),
  tenantId: z.string().uuid(),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

// ============================================================================
// Query Schema (for AI interactions)
// ============================================================================
export const QuerySchema = z.object({
  query: z.string().min(1).max(4000),
  sessionId: z.string().uuid(),
});

export type Query = z.infer<typeof QuerySchema>;

// ============================================================================
// File Upload Schema
// ============================================================================
export const FileUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileType: z.string().regex(/^[a-z]+\/[a-z0-9\-\+\.]+$/i),
  fileSize: z.number().int().min(1).max(25 * 1024 * 1024), // 25MB max
});

export type FileUpload = z.infer<typeof FileUploadSchema>;

// ============================================================================
// Error Response Schema
// ============================================================================
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  errorId: z.string().uuid(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// ============================================================================
// Success Response Schemas
// ============================================================================
export const HealthCheckResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  version: z.string(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const OnboardingResponseSchema = z.object({
  tenantId: z.string().uuid(),
  orgId: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: z.literal('created'),
});

export type OnboardingResponse = z.infer<typeof OnboardingResponseSchema>;

export const AssessmentSessionSchema = z.object({
  sessionId: z.string().uuid(),
  tenantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  progress: z.number().int().min(0).max(100),
  status: z.enum(['in_progress', 'completed', 'paused']),
  currentSection: z.string().optional(),
});

export type AssessmentSession = z.infer<typeof AssessmentSessionSchema>;

export const PlanSchema = z.object({
  planId: z.string().uuid(),
  sessionId: z.string().uuid(),
  status: z.enum(['draft', 'generated', 'reviewed']),
  createdAt: z.string().datetime(),
  recommendations: z.array(z.object({
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    title: z.string(),
    description: z.string(),
    estimatedCost: z.number().optional(),
  })),
});

export type Plan = z.infer<typeof PlanSchema>;

export const DocumentSchema = z.object({
  docId: z.string().uuid(),
  sessionId: z.string().uuid(),
  docType: z.string(),
  status: z.enum(['generating', 'ready', 'error']),
  createdAt: z.string().datetime(),
  downloadUrl: z.string().url().optional(),
  size: z.number().optional(),
});

export type Document = z.infer<typeof DocumentSchema>;

export const ListResponseSchema = z.object({
  items: z.array(z.any()),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});

export const SSEMessageSchema = z.object({
  type: z.enum(['start', 'chunk', 'complete', 'error']),
  data: z.string().optional(),
  errorId: z.string().uuid().optional(),
});

export type SSEMessage = z.infer<typeof SSEMessageSchema>;
