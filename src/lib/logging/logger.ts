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
    // Check if string contains patterns that look like secrets
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
 * Create pino logger instance
 */
function createPinoLogger(): PinoLogger {
  const isProduction = process.env.NODE_ENV === 'production';
  const isLocal = process.env.NODE_ENV === 'development';

  const transport = pino.transport({
    targets: [
      {
        level: isLocal ? 'debug' : 'info',
        target: 'pino/file',
        options: { destination: 1 }, // stdout
      },
      ...(isProduction
        ? [
            {
              level: 'info',
              target: 'pino-loki',
              options: {
                host: process.env.GRAFANA_LOKI_HOST || 'localhost',
                basicAuth: {
                  username: process.env.GRAFANA_LOKI_USER,
                  password: process.env.GRAFANA_LOKI_PASSWORD,
                },
                labels: {
                  service: 'eve-secure',
                  environment: process.env.NODE_ENV,
                  version: process.env.APP_VERSION,
                },
                timeout: 5000,
              },
            },
          ]
        : []),
    ],
  });

  return pino(
    {
      level: isLocal ? 'debug' : 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: {
        req: (req: any) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          remoteAddress: req.remoteAddress,
        }),
        err: pino.stdSerializers.err,
      },
    },
    transport
  );
}

/**
 * Global logger instance
 */
const pinoLogger = createPinoLogger();

/**
 * Main logger interface with structured logging
 */
export const logger = {
  /**
   * Debug level - local development only
   */
  debug: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.debug(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },

  /**
   * Info level - normal operations
   */
  info: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.info(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },

  /**
   * Warn level - anomalies, deprecated usage
   */
  warn: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.warn(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },

  /**
   * Error level - recoverable failures
   */
  error: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.error(
      { metadata: redactSensitiveData(metadata) },
      message
    );
  },

  /**
   * Critical level - security events, unrecoverable failures
   */
  critical: (message: string, metadata?: Record<string, unknown>) => {
    pinoLogger.error(
      { level: 'CRITICAL', metadata: redactSensitiveData(metadata) },
      message
    );
  },

  /**
   * Get child logger with request context
   */
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

/**
 * Express middleware to create request logger
 */
export function loggingMiddleware(
  req: any,
  res: any,
  next: Function
) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  const tenantId = req.tenantId;
  const userId = req.userId;

  // Attach logger to request
  req.logger = createRequestLogger(requestId, tenantId, userId);

  // Log incoming request
  req.logger.debug('Incoming request', {
    method: req.method,
    url: req.url,
    userAgent: req.get('user-agent'),
  });

  // Log response when it's finished
  res.on('finish', () => {
    req.logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
    });
  });

  next();
}
