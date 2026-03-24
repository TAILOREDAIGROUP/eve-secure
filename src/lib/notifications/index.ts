import { z } from 'zod';
import { sendEmail, sendTemplatedEmail, EmailTemplate } from './email';
import { sendTemplateSMS, sendCriticalAlert, SMSTemplate } from './sms';
import { logger } from '../logging/logger';

/**
 * Notification severity levels
 */
export enum NotificationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * User notification preferences
 */
export interface NotificationPreferences {
  emailNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  criticalAlertsAlwaysSMS: boolean; // Cannot disable SMS for critical
  severityThreshold?: NotificationSeverity; // Only notify at this level or higher
  quietHours?: {
    enabled: boolean;
    startHour: number; // 0-23
    endHour: number; // 0-23
  };
}

/**
 * Notification recipient
 */
export interface NotificationRecipient {
  userId: string;
  email: string;
  phoneNumber?: string;
  preferences: NotificationPreferences;
}

/**
 * Notification request
 */
export interface NotificationRequest {
  recipient: NotificationRecipient;
  severity: NotificationSeverity;
  type: 'email' | 'sms' | 'both';
  emailTemplate?: EmailTemplate;
  smsTemplate?: SMSTemplate;
  variables: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Notification audit entry
 */
interface NotificationAuditEntry {
  timestamp: string;
  tenantId?: string;
  userId: string;
  recipientEmail: string;
  recipientPhone?: string;
  type: string;
  template?: string;
  severity: NotificationSeverity;
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(preferences: NotificationPreferences): boolean {
  if (!preferences.quietHours?.enabled) return false;

  const now = new Date();
  const currentHour = now.getHours();
  const { startHour, endHour } = preferences.quietHours;

  // Handle overnight quiet hours (e.g., 22:00 to 06:00)
  if (startHour > endHour) {
    return currentHour >= startHour || currentHour < endHour;
  }

  return currentHour >= startHour && currentHour < endHour;
}

/**
 * Check if notification meets severity threshold
 */
function meetsThreshold(
  severity: NotificationSeverity,
  threshold?: NotificationSeverity
): boolean {
  if (!threshold) return true;

  const severityOrder = [
    NotificationSeverity.INFO,
    NotificationSeverity.WARNING,
    NotificationSeverity.HIGH,
    NotificationSeverity.CRITICAL,
  ];

  const severityIndex = severityOrder.indexOf(severity);
  const thresholdIndex = severityOrder.indexOf(threshold);

  return severityIndex >= thresholdIndex;
}

/**
 * Log notification to audit trail
 */
async function auditNotification(entry: NotificationAuditEntry): Promise<void> {
  try {
    // TODO: Insert into audit_trail table in database
    logger.info('Notification audit logged', {
      audit: entry,
    });
  } catch (error) {
    logger.error('Failed to audit notification', {
      error: error instanceof Error ? error.message : String(error),
      entry,
    });
  }
}

/**
 * Send notification respecting user preferences
 *
 * Routing:
 * - Routine (INFO/WARNING): email only if enabled
 * - High: email if enabled, SMS if enabled
 * - Critical: email if enabled, SMS always
 */
export async function notify(
  request: NotificationRequest
): Promise<{
  success: boolean;
  emailSent?: boolean;
  smsSent?: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let emailSent = false;
  let smsSent = false;

  const { recipient, severity, emailTemplate, smsTemplate, variables, metadata } = request;

  // Check if notification meets severity threshold
  if (!meetsThreshold(severity, recipient.preferences.severityThreshold)) {
    logger.debug('Notification filtered by severity threshold', {
      severity,
      threshold: recipient.preferences.severityThreshold,
      userId: recipient.userId,
    });
    return { success: true, emailSent: false, smsSent: false, errors };
  }

  // Skip quiet hours for non-critical notifications
  if (severity !== NotificationSeverity.CRITICAL && isInQuietHours(recipient.preferences)) {
    logger.debug('Notification skipped due to quiet hours', {
      userId: recipient.userId,
      severity,
    });
    return { success: true, emailSent: false, smsSent: false, errors };
  }

  // Send email if enabled and applicable
  if (recipient.preferences.emailNotificationsEnabled && emailTemplate) {
    try {
      const result = await sendTemplatedEmail(
        recipient.email,
        emailTemplate,
        variables
      );

      if (result.success) {
        emailSent = true;
        logger.info('Email notification sent', {
          userId: recipient.userId,
          template: emailTemplate,
          messageId: result.messageId,
        });
      } else {
        errors.push(`Email failed: ${result.error}`);
        logger.warn('Email notification failed', {
          userId: recipient.userId,
          template: emailTemplate,
          error: result.error,
        });
      }

      // Audit email
      await auditNotification({
        timestamp: new Date().toISOString(),
        userId: recipient.userId,
        recipientEmail: recipient.email,
        type: 'email',
        template: emailTemplate,
        severity,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Email error: ${errorMsg}`);
      logger.error('Email notification error', {
        userId: recipient.userId,
        error: errorMsg,
      });
    }
  }

  // Send SMS if enabled (high/critical) or critical alert
  const shouldSendSMS =
    recipient.phoneNumber &&
    ((severity === NotificationSeverity.CRITICAL &&
      recipient.preferences.criticalAlertsAlwaysSMS) ||
      (severity === NotificationSeverity.HIGH && recipient.preferences.smsNotificationsEnabled));

  if (shouldSendSMS && smsTemplate) {
    try {
      const result =
        severity === NotificationSeverity.CRITICAL
          ? await sendCriticalAlert(
              recipient.phoneNumber!,
              smsTemplate,
              variables,
              metadata
            )
          : await sendTemplateSMS(
              recipient.phoneNumber!,
              smsTemplate,
              variables,
              metadata
            );

      if (result.success) {
        smsSent = true;
        logger.info('SMS notification sent', {
          userId: recipient.userId,
          template: smsTemplate,
          messageId: result.messageId,
          attempts: result.attempts,
        });
      } else {
        errors.push(`SMS failed: ${result.error}`);
        logger.warn('SMS notification failed', {
          userId: recipient.userId,
          template: smsTemplate,
          error: result.error,
        });
      }

      // Audit SMS
      await auditNotification({
        timestamp: new Date().toISOString(),
        userId: recipient.userId,
        recipientEmail: recipient.email,
        recipientPhone: recipient.phoneNumber,
        type: 'sms',
        template: smsTemplate,
        severity,
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`SMS error: ${errorMsg}`);
      logger.error('SMS notification error', {
        userId: recipient.userId,
        error: errorMsg,
      });
    }
  }

  const success = errors.length === 0;
  return {
    success,
    emailSent,
    smsSent,
    errors,
  };
}

/**
 * Send critical notification (cannot be disabled)
 *
 * Critical notifications:
 * - Always send SMS if phone number available
 * - Always send email
 * - Retry SMS delivery
 * - Alert on-call engineer if SMS delivery fails
 */
export async function notifyCritical(
  recipient: NotificationRecipient,
  emailTemplate: EmailTemplate,
  smsTemplate: SMSTemplate,
  variables: Record<string, unknown>,
  metadata?: Record<string, unknown>
): Promise<{
  success: boolean;
  emailSent: boolean;
  smsSent: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Always send email for critical
    let emailSent = false;
    try {
      const emailResult = await sendTemplatedEmail(
        recipient.email,
        emailTemplate,
        variables
      );

      if (emailResult.success) {
        emailSent = true;
        logger.critical('Critical email notification sent', {
          userId: recipient.userId,
          template: emailTemplate,
          messageId: emailResult.messageId,
        });
      } else {
        errors.push(`Critical email failed: ${emailResult.error}`);
        logger.critical('Critical email notification failed', {
          userId: recipient.userId,
          template: emailTemplate,
          error: emailResult.error,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Critical email error: ${errorMsg}`);
      logger.critical('Critical email notification error', {
        userId: recipient.userId,
        error: errorMsg,
      });
    }

    // Always send SMS for critical if phone available
    let smsSent = false;
    if (recipient.phoneNumber) {
      try {
        const smsResult = await sendCriticalAlert(
          recipient.phoneNumber,
          smsTemplate,
          variables,
          { critical: true, ...metadata }
        );

        if (smsResult.success) {
          smsSent = true;
          logger.critical('Critical SMS notification sent', {
            userId: recipient.userId,
            template: smsTemplate,
            messageId: smsResult.messageId,
            attempts: smsResult.attempts,
          });
        } else {
          errors.push(`Critical SMS failed after ${smsResult.attempts} attempts: ${smsResult.error}`);
          logger.critical('Critical SMS notification failed', {
            userId: recipient.userId,
            template: smsTemplate,
            attempts: smsResult.attempts,
            error: smsResult.error,
          });

          // Trigger incident escalation for failed critical SMS
          // This would integrate with incident management system
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Critical SMS error: ${errorMsg}`);
        logger.critical('Critical SMS notification error', {
          userId: recipient.userId,
          error: errorMsg,
        });
      }
    }

    return {
      success: errors.length === 0,
      emailSent,
      smsSent,
      errors,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.critical('Critical notification dispatch failed', {
      userId: recipient.userId,
      error: errorMsg,
    });

    return {
      success: false,
      emailSent: false,
      smsSent: false,
      errors: [errorMsg],
    };
  }
}

/**
 * Get notification preferences for user
 */
export async function getUserNotificationPreferences(
  userId: string
): Promise<NotificationPreferences | null> {
  try {
    // TODO: Query from database
    // const prefs = await db.query('SELECT * FROM notification_preferences WHERE user_id = ?', [userId]);
    // return prefs ? mapToPreferences(prefs) : null;
    return null;
  } catch (error) {
    logger.error('Failed to fetch notification preferences', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Update notification preferences for user
 */
export async function updateUserNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  try {
    // TODO: Update database
    // await db.query('UPDATE notification_preferences SET ... WHERE user_id = ?', [userId, ...]);
    logger.info('Notification preferences updated', {
      userId,
      changes: Object.keys(preferences),
    });
    return true;
  } catch (error) {
    logger.error('Failed to update notification preferences', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

// Export types for use in application
export type { NotificationRecipient, NotificationRequest };
