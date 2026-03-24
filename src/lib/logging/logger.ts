import { v4 as uuidv4 } from 'uuid';

/**
 * Edge-compatible structured logger for EVE Secure
 *
 * Replaces pino (which uses process.stdout.write / worker threads)
 * with console-based logging that works on Cloudflare Pages edge runtime.
 * Structured JSON output is captured by Cloudflare's log system.
 */

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  requestId?: string;
  tenantId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  stack?: string;
  category?: string;
}

export interface RequestLogger {
  requestId: string;
  tenantId?: string;
  userId?: string;
  debug: (message: string, metadata?: Record<string, unknown>) => void;
  info: (message: string, metadata?: Record<string, unknown>) => void;
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  error: (message: string, metadata?: Record<string, unknown>) => void;
  critical: (message: string, metadata?: Record<string, unknown>) => void;
}

const SENSITIVE_PATTERNS = [
  /password/i, /token/i, /secret/i, /api[_-]?key/i, /auth/i,
  /credit[_-]?card/i, /ssn/i, /private[_-]?key/i, /aws[_-]?secret/i,
];

function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[CIRCULAR]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (obj.length > 20 && /^[a-zA-Z0-9+/=]+$/.test(obj) && !obj.includes(' ')) {
      return '[REDACTED_SECRET]';
    }
    return obj;
  }

  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(key));
    redacted[key] = isSensitive ? '[REDACTED]' : redactSensitiveData(value, depth + 1);
  }
  return redacted;
}

function formatLog(level: string, message: string, metadata?: Record<string, unknown>): string {
  return JSON.stringify({
    level,
    time: new Date().toISOString(),
    msg: message,
    service: 'eve-secure',
    ...(metadata ? { metadata: redactSensitiveData(metadata) } : {}),
  });
}

/**
 * Main logger — edge-compatible (console-based, no worker threads)
 */
export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(formatLog('DEBUG', message, metadata));
    }
  },
  info: (message: string, metadata?: Record<string, unknown>) => {
    console.log(formatLog('INFO', message, metadata));
  },
  warn: (message: string, metadata?: Record<string, unknown>) => {
    console.warn(formatLog('WARN', message, metadata));
  },
  error: (message: string, metadata?: Record<string, unknown>) => {
    console.error(formatLog('ERROR', message, metadata));
  },
  critical: (message: string, metadata?: Record<string, unknown>) => {
    console.error(formatLog('CRITICAL', message, metadata));
  },
  child: (bindings: Record<string, unknown>) => {
    return {
      debug: (obj: Record<string, unknown>, msg: string) =>
        logger.debug(msg, { ...bindings, ...obj }),
      info: (obj: Record<string, unknown>, msg: string) =>
        logger.info(msg, { ...bindings, ...obj }),
      warn: (obj: Record<string, unknown>, msg: string) =>
        logger.warn(msg, { ...bindings, ...obj }),
      error: (obj: Record<string, unknown>, msg: string) =>
        logger.error(msg, { ...bindings, ...obj }),
    };
  },
};

/**
 * Create request-scoped logger with correlation ID
 */
export function createRequestLogger(
  requestId?: string,
  tenantId?: string,
  userId?: string
): RequestLogger {
  const id = requestId || uuidv4();
  const ctx = { requestId: id, tenantId, userId };

  return {
    requestId: id,
    tenantId,
    userId,
    debug: (message: string, metadata?: Record<string, unknown>) =>
      logger.debug(message, { ...ctx, ...metadata }),
    info: (message: string, metadata?: Record<string, unknown>) =>
      logger.info(message, { ...ctx, ...metadata }),
    warn: (message: string, metadata?: Record<string, unknown>) =>
      logger.warn(message, { ...ctx, ...metadata }),
    error: (message: string, metadata?: Record<string, unknown>) =>
      logger.error(message, { ...ctx, ...metadata }),
    critical: (message: string, metadata?: Record<string, unknown>) =>
      logger.critical(message, { ...ctx, ...metadata }),
  };
}
