import pino, { Logger as PinoLogger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

/**
 * Structured log entry
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

/**
 * Request-scoped logger
 */
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

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /auth/i,
  /credit[_-]?card/i,
  /ssn/i,
  /phone/i,
  /email/i,
  /address/i,
  /zipcode/i,
  /aws[_-]?secret/i,
  /private[_-]?key/i,
];

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(obj: unknown, depth: number = 0): unknown {
  if (depth > 10) return '[CIRCULAR]';
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') {
    if (
      obj.length > 20 &&
      /^[a-zA-Z0-9+/=]+$/.test(obj) &&
      !obj.includes(' ')
    ) {
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
    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = redactSensitiveData(value, depth + 1);
    }
  }
  return redacted;
}

/**
 * Create pino logger instance — edge-compatible (no worker threads)
 *
 * NOTE: pino.transport() uses Node.js worker threads which are NOT available
 * on Cloudflare Pages/Workers. Instead we use pino's direct mode which writes
 * to stdout synchronously. Logs are captured by Cloudflare's log system and
 * can be tailed via \`wrangler tail\` or forwarded to any log drain.
 */
function createPinoLogger(): PinoLogger {
  const isLocal = process.env.NODE_ENV === 'development';

  return pino({
    level: isLocal ? 'debug' : 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      req: (req: Record<string, unknown>) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      }),
      err: pino.stdSerializers.err,
    },
    // In production on Cloudflare, use JSON format (default).
    // In development, use pino-pretty if available, otherwise JSON.
    ...(isLocal
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : {}),
  });
}

/**
 * Global logger instance
 */
let pinoLogger: PinoLogger;
try {
  pinoLogger = createPinoLogger();
} catch {
  // Fallback if pino-pretty isn't installed in dev
  pinoLogger = pino({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

/**
 * Main logger interface with structured logging
 */
export const logger = {
  debug: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.debug(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },
  info: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.info(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },
  warn: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.warn(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },
  error: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.error(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },
  critical: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.error(
      { level: 'CRITICAL', metadata: redactSensitiveData(metadata) },
      message
    );
  },
  child: (bindings: Record<string, unknown>) => {
    return pinoLogger.child(bindings);
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
  const child = logger.child({ requestId: id, tenantId, userId });

  return {
    requestId: id,
    tenantId,
    userId,
    debug: (message: string, metadata?: Record<string, unknown>) => {
      child.debug({ metadata: redactSensitiveData(metadata) }, message);
    },
    info: (message: string, metadata?: Record<string, unknown>) => {
      child.info({ metadata: redactSensitiveData(metadata) }, message);
    },
    warn: (message: string, metadata?: Record<string, unknown>) => {
      child.warn({ metadata: redactSensitiveData(metadata) }, message);
    },
    error: (message: string, metadata?: Record<string, unknown>) => {
      child.error({ metadata: redactSensitiveData(metadata) }, message);
    },
    critical: (message: string, metadata?: Record<string, unknown>) => {
      child.error(
        { level: 'CRITICAL', metadata: redactSensitiveData(metadata) },
        message
      );
    },
  };
}
