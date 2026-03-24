import { z } from 'zod';

/**
 * ===== ENUMS =====
 */

/**
 * Business sectors
 */
export enum Sector {
  TECHNOLOGY = 'technology',
  HEALTHCARE = 'healthcare',
  FINANCIAL = 'financial',
  MANUFACTURING = 'manufacturing',
  RETAIL = 'retail',
  ENERGY = 'energy',
  GOVERNMENT = 'government',
  EDUCATION = 'education',
  OTHER = 'other',
}

/**
 * US States
 */
export enum State {
  AL = 'AL',
  AK = 'AK',
  AZ = 'AZ',
  AR = 'AR',
  CA = 'CA',
  CO = 'CO',
  CT = 'CT',
  DE = 'DE',
  FL = 'FL',
  GA = 'GA',
  HI = 'HI',
  ID = 'ID',
  IL = 'IL',
  IN = 'IN',
  IA = 'IA',
  KS = 'KS',
  KY = 'KY',
  LA = 'LA',
  ME = 'ME',
  MD = 'MD',
  MA = 'MA',
  MI = 'MI',
  MN = 'MN',
  MS = 'MS',
  MO = 'MO',
  MT = 'MT',
  NE = 'NE',
  NV = 'NV',
  NH = 'NH',
  NJ = 'NJ',
  NM = 'NM',
  NY = 'NY',
  NC = 'NC',
  ND = 'ND',
  OH = 'OH',
  OK = 'OK',
  OR = 'OR',
  PA = 'PA',
  RI = 'RI',
  SC = 'SC',
  SD = 'SD',
  TN = 'TN',
  TX = 'TX',
  UT = 'UT',
  VT = 'VT',
  VA = 'VA',
  WA = 'WA',
  WV = 'WV',
  WI = 'WI',
  WY = 'WY',
}

/**
 * Security maturity tier ratings
 */
export enum TierRating {
  INITIAL = 'initial',           // No formal processes
  DEVELOPING = 'developing',     // Some processes defined
  DEFINED = 'defined',           // Processes documented and communicated
  MANAGED = 'managed',           // Processes measured and controlled
  OPTIMIZED = 'optimized',       // Continuous improvement
}

/**
 * Assessment status throughout lifecycle
 */
export enum AssessmentStatus {
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  REMEDIATION = 'remediation',
  REVIEW = 'review',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
}

/**
 * Document types for generation
 */
export enum DocumentType {
  COST_OF_INACTION = 'cost_of_inaction',
  ASSESSMENT_REPORT = 'assessment_report',
  IR_PACKAGE = 'ir_package',
  TABLETOP = 'tabletop',
  INSURANCE_QUESTIONNAIRE = 'insurance_questionnaire',
}

/**
 * Event types for streaming
 */
export enum EventType {
  // Assessment events
  ASSESSMENT_CREATED = 'assessment_created',
  ASSESSMENT_UPDATED = 'assessment_updated',
  ASSESSMENT_COMPLETED = 'assessment_completed',
  ASSESSMENT_ARCHIVED = 'assessment_archived',

  // Finding events
  FINDING_IDENTIFIED = 'finding_identified',
  FINDING_RESOLVED = 'finding_resolved',
  FINDING_REOPENED = 'finding_reopened',

  // Posture events
  POSTURE_DRIFT = 'posture_drift',
  COMPLIANCE_STATUS_CHANGED = 'compliance_status_changed',

  // Incident events
  INCIDENT_CREATED = 'incident_created',
  INCIDENT_ESCALATED = 'incident_escalated',
  INCIDENT_CLOSED = 'incident_closed',

  // Threat events
  THREAT_DETECTED = 'threat_detected',
  THREAT_MITIGATED = 'threat_mitigated',

  // User events
  USER_INVITED = 'user_invited',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',
}

/**
 * ===== INTERFACES =====
 */

/**
 * Assessment gap/finding
 */
export interface AssessmentGap {
  id: string;
  assessmentId: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  currentState: string;
  desiredState: string;
  businessImpact: string;
  remediationEffort: 'low' | 'medium' | 'high';
  remediationSteps: string[];
  assignedTo?: string;
  dueDate?: Date;
  status: 'open' | 'in_progress' | 'resolved' | 'deferred';
  resolvedDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Action item for remediation tracking
 */
export interface ActionItem {
  id: string;
  gapId: string;
  title: string;
  description: string;
  assignedTo: string;
  dueDate: Date;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  completedDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Cost of inaction calculation
 */
export interface CostOfInaction {
  id: string;
  assessmentId: string;
  yearlyBreachProbability: number; // 0-1
  averageBreachCost: number;
  estimatedYearlyBreachCost: number;
  compliancePenalties: Record<string, number>;
  totalCompliancePenalties: number;
  reputationDamagePercentage: number; // Revenue loss percentage
  reputationDamageValue: number;
  downtimeHoursPerYear: number;
  costPerDowntimeHour: number;
  estimatedDowntimeCost: number;
  totalAnnualCost: number;
  roi5YearCost: number; // 5-year projection
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization profile
 */
export interface OrgProfile {
  id: string;
  tenantId: string;
  legalName: string;
  tradeName?: string;
  description: string;
  website: string;
  sector: Sector;
  employees: number;
  annualRevenue: number;
  headquartersState: State;
  dataHandlingCategory: 'pii' | 'phi' | 'pci' | 'none' | 'other';
  criticality: 'mission_critical' | 'high' | 'medium' | 'low';
  industryCompliance: string[]; // e.g., ['hipaa', 'pci-dss', 'sox']
  logoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ===== GENERIC RESPONSE TYPES =====
 */

/**
 * Standard API response wrapper
 */
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    errorId?: string;
  };
  metadata?: {
    timestamp: string;
    requestId?: string;
    duration?: number;
  };
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Server-sent event for streaming
 */
export interface StreamEvent<T> {
  id: string;
  type: EventType;
  timestamp: string;
  data: T;
  correlationId?: string;
}

/**
 * ===== USER & TENANT TYPES =====
 */

/**
 * Database user record (extended with computed fields)
 */
export interface User {
  // Database fields
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  role: 'admin' | 'manager' | 'analyst' | 'viewer';
  status: 'active' | 'invited' | 'deactivated';
  emailVerified: boolean;
  phoneNumber?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Computed fields
  fullName: string;
  isAdmin: boolean;
  canManageUsers: boolean;
  canManageAssessments: boolean;
}

/**
 * Database tenant record (extended with computed fields)
 */
export interface Tenant {
  // Database fields
  id: string;
  name: string;
  status: 'active' | 'trial' | 'suspended';
  tier: 'starter' | 'professional' | 'enterprise';
  subscriptionStatus: 'active' | 'past_due' | 'cancelled';
  billingEmail: string;
  kmsKeyId: string;
  maxUsers: number;
  maxAssessments: number;
  maxStorage: number; // In GB
  features: string[]; // Feature flags enabled
  createdAt: Date;
  updatedAt: Date;
  trialEndsAt?: Date;

  // Computed fields
  isTrial: boolean;
  isExpired: boolean;
  userCountRemaining: number;
  assessmentCountRemaining: number;
}

/**
 * Session/JWT token claims
 */
export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;

  // Token claims
  sub: string; // userId
  iss: string; // 'eve-secure'
  aud: string; // 'eve-secure-app'
  iat: number; // issuedAt
  exp: number; // expiresAt (unix timestamp)
  tid: string; // tenantId
  role: string; // user role
}

/**
 * ===== ZOD VALIDATION SCHEMAS =====
 */

export const SectorSchema = z.nativeEnum(Sector);

export const StateSchema = z.nativeEnum(State);

export const TierRatingSchema = z.nativeEnum(TierRating);

export const AssessmentStatusSchema = z.nativeEnum(AssessmentStatus);

export const DocumentTypeSchema = z.nativeEnum(DocumentType);

export const EventTypeSchema = z.nativeEnum(EventType);

/**
 * Assessment gap validation schema
 */
export const AssessmentGapSchema = z.object({
  id: z.string().uuid(),
  assessmentId: z.string().uuid(),
  category: z.string().min(1),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string().min(5).max(200),
  description: z.string().min(10),
  currentState: z.string(),
  desiredState: z.string(),
  businessImpact: z.string(),
  remediationEffort: z.enum(['low', 'medium', 'high']),
  remediationSteps: z.array(z.string()),
  assignedTo: z.string().email().optional(),
  dueDate: z.date().optional(),
  status: z.enum(['open', 'in_progress', 'resolved', 'deferred']),
  resolvedDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Organization profile validation schema
 */
export const OrgProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  legalName: z.string().min(1).max(255),
  tradeName: z.string().max(255).optional(),
  description: z.string(),
  website: z.string().url(),
  sector: SectorSchema,
  employees: z.number().int().positive(),
  annualRevenue: z.number().nonnegative(),
  headquartersState: StateSchema,
  dataHandlingCategory: z.enum(['pii', 'phi', 'pci', 'none', 'other']),
  criticality: z.enum(['mission_critical', 'high', 'medium', 'low']),
  industryCompliance: z.array(z.string()),
  logoUrl: z.string().url().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * User validation schema
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantId: z.string().uuid(),
  role: z.enum(['admin', 'manager', 'analyst', 'viewer']),
  status: z.enum(['active', 'invited', 'deactivated']),
  emailVerified: z.boolean(),
  phoneNumber: z.string().regex(/^\+?1?\d{9,15}$/).optional(),
  lastLoginAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * API response validation schema (generic)
 */
export const APIResponseSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        errorId: z.string().uuid().optional(),
      })
      .optional(),
    metadata: z
      .object({
        timestamp: z.string().datetime(),
        requestId: z.string().uuid().optional(),
        duration: z.number().positive().optional(),
      })
      .optional(),
  });
