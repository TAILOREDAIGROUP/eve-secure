import twilio from 'twilio';
import { logger } from '../logging/logger';

/**
 * Initialize Twilio client
 */
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || '',
  process.env.TWILIO_AUTH_TOKEN || ''
);

/**
 * SMS template types
 */
export type SMSTemplate =
  | 'incident_detected'
  | 'critical_alert'
  | 'posture_drift_critical'
  | 'breach_detected';

/**
 * SMS template configuration
 */
interface SMSTemplateConfig {
  messageGenerator: (variables: Record<string, unknown>) => string;
  maxAttempts?: number;
}

/**
 * Incident detected SMS template
 */
function incidentDetectedSMS(vars: Record<string, unknown>): string {
  const { organizationName, incidentType } = vars;
  return `[EVE SECURE] INCIDENT ALERT: ${incidentType} detected at ${organizationName}. Immediate action required. Check dashboard: ${process.env.APP_URL}/incidents`;
}

/**
 * Critical alert SMS template
 */
function criticalAlertSMS(vars: Record<string, unknown>): string {
  const { alertType, severity } = vars;
  return `[EVE SECURE] CRITICAL: ${alertType} (${severity}). Review immediately: ${process.env.APP_URL}/dashboard`;
}

/**
 * Posture drift critical SMS template
 */
function postureDriftCriticalSMS(vars: Record<string, unknown>): string {
  const { organizationName } = vars;
  return `[EVE SECURE] CRITICAL: Security posture drift detected at ${organizationName}. Take corrective action: ${process.env.APP_URL}/dashboard`;
}

/**
 * Breach detected SMS template
 */
function breachDetectedSMS(vars: Record<string, unknown>): string {
  const { organizationName, severity } = vars;
  return `[EVE SECURE] BREACH ALERT: Potential breach detected at ${organizationName} (${severity}). Contact incident response immediately: ${process.env.APP_URL}/incidents`;
}

/**
 * SMS template registry
 */
const templates: Record<SMSTemplate, SMSTemplateConfig> = {
  incident_detected: {
    messageGenerator: incidentDetectedSMS,
    maxAttempts: 3,
  },
  critical_alert: {
    messageGenerator: criticalAlertSMS,
    maxAttempts: 3,
  },
  posture_drift_critical: {
    messageGenerator: postureDriftCriticalSMS,
    maxAttempts: 2,
  },
  breach_detected: {
    messageGenerator: breachDetectedSMS,
    maxAttempts: 5,
  },
};

/**
 * Send SMS message
 */
export async function sendSMS(
  phoneNumber: string,
  message: string,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  // Validate phone number format
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length < 10) {
    logger.warn('Invalid phone number format', { phoneNumber });
    return {
      success: false,
      error: 'Invalid phone number format',
    };
  }

  // Ensure +1 prefix for North America or appropriate country code
  const formattedNumber = cleanNumber.length === 10 ? `+1${cleanNumber}` : `+${cleanNumber}`;

  try {
    const message_obj = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedNumber,
    });

    logger.info('SMS sent successfully', {
      phoneNumber: formattedNumber,
      messageId: message_obj.sid,
      status: message_obj.status,
      metadata,
    });

    return {
      success: true,
      messageId: message_obj.sid,
    };
  } catch (error) {
    logger.error('Failed to send SMS', {
      phoneNumber: formattedNumber,
      error: error instanceof Error ? error.message : String(error),
      metadata,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

/**
 * Send templated SMS
 */
export async function sendTemplateSMS(
  phoneNumber: string,
  template: SMSTemplate,
  variables: Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const config = templates[template];
  if (!config) {
    logger.error('Unknown SMS template', { template });
    return {
      success: false,
      error: `Unknown template: ${template}`,
    };
  }

  try {
    const message = config.messageGenerator(variables);

    // Ensure message is within SMS character limit (160 for standard, 153 if using special chars)
    if (message.length > 160) {
      logger.warn('SMS message exceeds character limit', {
        template,
        messageLength: message.length,
      });
    }

    return sendSMS(phoneNumber, message, { template, ...metadata });
  } catch (error) {
    logger.error('Error generating SMS template', {
      template,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: 'Failed to generate SMS',
    };
  }
}

/**
 * Send critical alert SMS with retry logic
 *
 * Critical alerts cannot be disabled and must succeed with retries
 */
export async function sendCriticalAlert(
  phoneNumber: string,
  template: SMSTemplate,
  variables: Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  attempts: number;
  messageId?: string;
  error?: string;
}> {
  const config = templates[template];
  if (!config) {
    logger.critical('Unknown critical SMS template', { template });
    return {
      success: false,
      attempts: 0,
      error: `Unknown template: ${template}`,
    };
  }

  const maxAttempts = config.maxAttempts || 3;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const message = config.messageGenerator(variables);
      const result = await sendSMS(phoneNumber, message, {
        ...metadata,
        criticalAlert: true,
        attempt,
        maxAttempts,
      });

      if (result.success) {
        logger.info('Critical alert SMS sent successfully', {
          phoneNumber,
          template,
          attempts: attempt,
          messageId: result.messageId,
        });
        return {
          success: true,
          attempts: attempt,
          messageId: result.messageId,
        };
      }

      lastError = result.error;

      // Exponential backoff before retry
      if (attempt < maxAttempts) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);

      if (attempt < maxAttempts) {
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  logger.critical('Critical alert SMS delivery failed after retries', {
    phoneNumber,
    template,
    attempts: maxAttempts,
    error: lastError,
  });

  return {
    success: false,
    attempts: maxAttempts,
    error: lastError || 'Failed to deliver critical alert',
  };
}
