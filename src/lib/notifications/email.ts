import { Resend } from 'resend';
import { logger } from '../logging/logger';

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Email template types
 */
export type EmailTemplate =
  | 'assessment_reminder'
  | 'posture_drift'
  | 'new_threat_alert'
  | 'incident_detected'
  | 'system_maintenance';

/**
 * Email template configuration
 */
interface EmailTemplateConfig {
  subject: string;
  htmlGenerator: (variables: Record<string, unknown>) => string;
}

/**
 * Assessment reminder template
 */
function assessmentReminderTemplate(vars: Record<string, unknown>): string {
  const { organizationName, assessmentName, daysUntilDue } = vars;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Assessment Reminder</h1>
          </div>
          <div class="content">
            <p>Hi ${organizationName},</p>
            <p>Your security assessment <strong>${assessmentName}</strong> is due in <strong>${daysUntilDue} days</strong>.</p>
            <p>Regular security assessments are critical to maintaining your security posture and identifying emerging threats.</p>
            <a href="${process.env.APP_URL}/assessments" class="button">View Assessment</a>
            <div class="footer">
              <p>This is an automated notification from EVE Secure.</p>
              <p>You can manage notification preferences in your account settings.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Posture drift template
 */
function postureDriftTemplate(vars: Record<string, unknown>): string {
  const { organizationName, driftDescription, severity } = vars;
  const severityColor = severity === 'critical' ? '#dc2626' : severity === 'high' ? '#ea580c' : '#f59e0b';
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${severityColor}; color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert-box { background: #fef2f2; border-left: 4px solid ${severityColor}; padding: 15px; margin: 15px 0; }
          .button { display: inline-block; background: ${severityColor}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Posture Drift Detected</h1>
          </div>
          <div class="content">
            <p>Hi ${organizationName},</p>
            <p>We've detected a change in your security posture:</p>
            <div class="alert-box">
              <p>${driftDescription}</p>
            </div>
            <p>Review the details and take corrective action to maintain compliance.</p>
            <a href="${process.env.APP_URL}/dashboard" class="button">Review Dashboard</a>
            <div style="margin-top: 20px; font-size: 12px; color: #666;">
              <p>Severity: <strong>${severity}</strong></p>
              <p>This is an automated security alert.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * New threat alert template
 */
function newThreatAlertTemplate(vars: Record<string, unknown>): string {
  const { organizationName, threatName, threatDescription, affectedSystems } = vars;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ea580c; color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .threat-box { background: white; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 6px; }
          .button { display: inline-block; background: #ea580c; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
          .systems-list { background: white; border: 1px solid #e5e7eb; padding: 15px; margin: 15px 0; border-radius: 6px; }
          .systems-list li { margin: 5px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Threat Alert</h1>
          </div>
          <div class="content">
            <p>Hi ${organizationName},</p>
            <p>A new threat has been identified that may affect your organization:</p>
            <div class="threat-box">
              <h3>${threatName}</h3>
              <p>${threatDescription}</p>
            </div>
            <p><strong>Affected Systems:</strong></p>
            <div class="systems-list">
              <ul>
                ${Array.isArray(affectedSystems) ? affectedSystems.map((sys) => `<li>${sys}</li>`).join('') : ''}
              </ul>
            </div>
            <p>Take immediate action to mitigate this threat.</p>
            <a href="${process.env.APP_URL}/threats" class="button">View Threat Details</a>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Incident detected template
 */
function incidentDetectedTemplate(vars: Record<string, unknown>): string {
  const { organizationName, incidentType, severity, description } = vars;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .incident-box { background: #fef2f2; border: 2px solid #dc2626; padding: 20px; margin: 20px 0; border-radius: 6px; }
          .button { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 20px; }
          .urgent { color: #dc2626; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>URGENT: Security Incident Detected</h1>
          </div>
          <div class="content">
            <p>Hi ${organizationName},</p>
            <p class="urgent">⚠️ A security incident has been detected and requires immediate attention.</p>
            <div class="incident-box">
              <p><strong>Incident Type:</strong> ${incidentType}</p>
              <p><strong>Severity:</strong> ${severity}</p>
              <p><strong>Description:</strong> ${description}</p>
            </div>
            <p>Our security team has been notified. Please review the incident details immediately and take appropriate action.</p>
            <a href="${process.env.APP_URL}/incidents" class="button">View Incident Report</a>
            <div style="margin-top: 20px; padding: 15px; background: white; border-left: 4px solid #dc2626; border-radius: 4px;">
              <p><strong>Next Steps:</strong></p>
              <ul style="margin: 10px 0; padding-left: 20px;">
                <li>Review the incident details and timeline</li>
                <li>Activate your incident response plan</li>
                <li>Contact your security team</li>
              </ul>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * System maintenance template
 */
function systemMaintenanceTemplate(vars: Record<string, unknown>): string {
  const { maintenanceWindow, expectedDuration, impact } = vars;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #3b82f6; color: white; padding: 30px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: white; border-left: 4px solid #3b82f6; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Scheduled System Maintenance</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We're performing scheduled maintenance on EVE Secure:</p>
            <div class="info-box">
              <p><strong>Maintenance Window:</strong> ${maintenanceWindow}</p>
              <p><strong>Expected Duration:</strong> ${expectedDuration}</p>
              <p><strong>Impact:</strong> ${impact}</p>
            </div>
            <p>During this time, some features may be unavailable. We appreciate your patience.</p>
            <p>If you have questions, please contact support.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Template registry
 */
const templates: Record<EmailTemplate, EmailTemplateConfig> = {
  assessment_reminder: {
    subject: 'Security Assessment Reminder',
    htmlGenerator: assessmentReminderTemplate,
  },
  posture_drift: {
    subject: 'Security Posture Drift Detected',
    htmlGenerator: postureDriftTemplate,
  },
  new_threat_alert: {
    subject: 'New Threat Alert',
    htmlGenerator: newThreatAlertTemplate,
  },
  incident_detected: {
    subject: 'URGENT: Security Incident Detected',
    htmlGenerator: incidentDetectedTemplate,
  },
  system_maintenance: {
    subject: 'Scheduled System Maintenance',
    htmlGenerator: systemMaintenanceTemplate,
  },
};

/**
 * Send raw email
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'noreply@evesecure.io',
      to,
      subject,
      html,
      reply_to: replyTo,
    });

    if (result.error) {
      logger.error('Failed to send email', {
        to,
        subject,
        error: result.error.message,
      });
      return { success: false, error: result.error.message };
    }

    logger.info('Email sent successfully', {
      to,
      subject,
      messageId: result.data?.id,
    });

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    logger.error('Email service error', {
      to,
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send templated email
 */
export async function sendTemplatedEmail(
  to: string,
  template: EmailTemplate,
  variables: Record<string, unknown>,
  replyTo?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const config = templates[template];
  if (!config) {
    logger.error('Unknown email template', { template });
    return { success: false, error: `Unknown template: ${template}` };
  }

  try {
    const html = config.htmlGenerator(variables);
    return sendEmail(to, config.subject, html, replyTo);
  } catch (error) {
    logger.error('Error generating email template', {
      template,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: 'Failed to generate email',
    };
  }
}
