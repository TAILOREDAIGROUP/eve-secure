import * as Sentry from '@sentry/nextjs';

/**
 * Initialize Sentry for EVE Secure
 * Shared configuration used by both client and server configs
 */
export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: `eve-secure@${process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0'}`,

    // Performance monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Session replay (client only — no-op on server)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,

    // Filter sensitive data
    beforeSend(event) {
      // Strip PII from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((crumb) => {
          if (crumb.data) {
            delete crumb.data.password;
            delete crumb.data.token;
            delete crumb.data.authorization;
          }
          return crumb;
        });
      }
      return event;
    },

    // Ignore common non-actionable errors
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
    ],
  });
}

/**
 * Capture an exception with EVE Secure context
 */
export function captureError(
  error: Error,
  context?: {
    tenantId?: string;
    userId?: string;
    requestId?: string;
    tags?: Record<string, string>;
  }
) {
  Sentry.withScope((scope) => {
    if (context?.tenantId) scope.setTag('tenant_id', context.tenantId);
    if (context?.userId) scope.setUser({ id: context.userId });
    if (context?.requestId) scope.setTag('request_id', context.requestId);
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    Sentry.captureException(error);
  });
}
