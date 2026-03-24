import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logging/logger';

/**
 * Base application error class with structured error handling
 */
export class AppError extends Error {
  readonly errorId: string;
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;
  readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);

    this.errorId = uuidv4();
    this.code = code;
    this.message = message;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 401 Authentication error - user not authenticated
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super('AUTHENTICATION_ERROR', message, 401, true, context);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * 403 Authorization error - user lacks permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
    super('AUTHORIZATION_ERROR', message, 403, true, context);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * 404 Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, context?: Record<string, unknown>) {
    super('NOT_FOUND_ERROR', `${resource} not found`, 404, true, context);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * 400 Validation error
 */
export class ValidationError extends AppError {
  readonly fields?: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    fields?: Record<string, string[]>,
    context?: Record<string, unknown>
  ) {
    super('VALIDATION_ERROR', message, 400, true, context);
    Object.setPrototypeOf(this, ValidationError.prototype);
    this.fields = fields;
  }
}

/**
 * 429 Rate limit error
 */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super('RATE_LIMIT_ERROR', message, 429, true, { retryAfter });
    Object.setPrototypeOf(this, RateLimitError.prototype);
    this.retryAfter = retryAfter;
  }
}

/**
 * 500 Internal server error
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', context?: Record<string, unknown>) {
    super('INTERNAL_ERROR', message, 500, true, context);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

/**
 * AI/LLM specific error
 */
export class AIError extends AppError {
  readonly provider?: string;
  readonly originalError?: Error;

  constructor(
    message: string,
    provider?: string,
    originalError?: Error,
    context?: Record<string, unknown>
  ) {
    super('AI_ERROR', message, 500, true, context);
    Object.setPrototypeOf(this, AIError.prototype);
    this.provider = provider;
    this.originalError = originalError;
  }
}

/**
 * Tenant isolation boundary violation
 */
export class TenantIsolationError extends AppError {
  readonly tenantId: string;
  readonly attemptedResource: string;

  constructor(
    tenantId: string,
    attemptedResource: string,
    context?: Record<string, unknown>
  ) {
    super(
      'TENANT_ISOLATION_ERROR',
      'Tenant isolation boundary violated',
      403,
      false,
      context
    );
    Object.setPrototypeOf(this, TenantIsolationError.prototype);
    this.tenantId = tenantId;
    this.attemptedResource = attemptedResource;
  }
}

/**
 * User-facing error response (no sensitive information)
 */
export interface ErrorResponse {
  success: false;
  errorId: string;
  message: string;
  code: string;
  support?: string;
}

/**
 * Create safe error response for API clients
 */
export function createErrorResponse(error: AppError): ErrorResponse {
  return {
    success: false,
    errorId: error.errorId,
    message: error.message,
    code: error.code,
  };
}

/**
 * Security event log for suspected attacks
 */
interface SecurityEvent {
  timestamp: string;
  eventType: 'injection_attempt' | 'unauthorized_access' | 'isolation_violation' | 'rate_limit_abuse';
  tenantId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  endpoint?: string;
  sanitizedPayload?: unknown;
  severity: 'warning' | 'critical';
}

/**
 * Log security event with full context
 */
export function logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
  const securityEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  logger.critical('Security event detected', {
    securityEvent,
    category: 'security',
  });

  // Trigger on-call alert for critical events
  if (event.severity === 'critical') {
    // Alert on-call engineer via PagerDuty/OpsGenie
    // Implementation depends on incident management system
  }
}

/**
 * Error handler middleware for Express
 * Maps errors to safe responses and logs appropriately
 */
export function handleError(
  error: unknown,
  requestId?: string,
  tenantId?: string,
  userId?: string
): {
  statusCode: number;
  response: ErrorResponse;
} {
  let appError: AppError;

  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof Error) {
    // Wrap unexpected errors
    appError = new InternalError(
      process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
      { originalMessage: error.message }
    );
  } else {
    appError = new InternalError('Unknown error occurred');
  }

  // Log error with context
  const logContext = {
    errorId: appError.errorId,
    code: appError.code,
    statusCode: appError.statusCode,
    requestId,
    tenantId,
    userId,
    context: appError.context,
  };

  if (appError.statusCode >= 500) {
    // Server errors - log with full stack trace
    logger.error(appError.message, {
      ...logContext,
      stack: appError.stack,
      isOperational: appError.isOperational,
    });
  } else if (appError.statusCode >= 400) {
    // Client errors - log at warn level
    logger.warn(appError.message, logContext);
  }

  // Detect and log security events
  if (appError instanceof TenantIsolationError) {
    logSecurityEvent({
      eventType: 'isolation_violation',
      tenantId: appError.tenantId,
      userId,
      endpoint: requestId,
      sanitizedPayload: { attemptedResource: appError.attemptedResource },
      severity: 'critical',
    });
  }

  return {
    statusCode: appError.statusCode,
    response: createErrorResponse(appError),
  };
}

/**
 * Is error type check utilities
 */
export const isError = {
  authentication: (error: unknown): error is AuthenticationError =>
    error instanceof AuthenticationError,
  authorization: (error: unknown): error is AuthorizationError =>
    error instanceof AuthorizationError,
  notFound: (error: unknown): error is NotFoundError => error instanceof NotFoundError,
  validation: (error: unknown): error is ValidationError => error instanceof ValidationError,
  rateLimit: (error: unknown): error is RateLimitError => error instanceof RateLimitError,
  tenantIsolation: (error: unknown): error is TenantIsolationError =>
    error instanceof TenantIsolationError,
};
