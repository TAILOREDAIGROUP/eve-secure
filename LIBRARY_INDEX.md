# EVE Secure Library Modules - Complete Index

## All Files Created

```
src/
├── lib/
│   ├── errors/
│   │   └── index.ts          (290 lines) - Error handling framework
│   ├── logging/
│   │   └── logger.ts         (288 lines) - Structured logging with Grafana
│   ├── notifications/
│   │   ├── email.ts          (347 lines) - Resend email client & templates
│   │   ├── sms.ts            (269 lines) - Twilio SMS client & templates
│   │   └── index.ts          (454 lines) - Notification orchestrator
│   ├── pdf/
│   │   └── generator.ts      (417 lines) - PDF generation via Lambda
│   ├── feature-flags/
│   │   └── index.ts          (302 lines) - Feature flags with caching
│   └── [existing modules...]
└── types/
    └── index.ts              (461 lines) - Core TypeScript types & enums
```

## Import Examples

### Error Handling
```typescript
import {
  AppError,
  AuthenticationError,
  ValidationError,
  TenantIsolationError,
  createErrorResponse,
  handleError,
  logSecurityEvent,
  isError,
} from '@/lib/errors';

// Usage
throw new ValidationError('Invalid input', { email: ['Email is required'] });
const { statusCode, response } = handleError(error, requestId, tenantId, userId);
```

### Logging
```typescript
import { logger, createRequestLogger } from '@/lib/logging/logger';

// Global logger
logger.info('User login', { userId, email });
logger.critical('Security event', { securityEvent });

// Request-scoped logger
const reqLogger = createRequestLogger(requestId, tenantId, userId);
reqLogger.debug('Processing request', { data });
```

### Notifications
```typescript
import {
  notify,
  notifyCritical,
  NotificationSeverity,
  type NotificationRequest,
} from '@/lib/notifications';

// Routine notification
const result = await notify({
  recipient: { userId, email, phoneNumber, preferences },
  severity: NotificationSeverity.WARNING,
  emailTemplate: 'posture_drift',
  smsTemplate: undefined,
  variables: { organizationName, driftDescription },
});

// Critical notification (cannot disable)
await notifyCritical(
  recipient,
  'incident_detected',
  'incident_detected',
  { organizationName, incidentType }
);
```

### PDF Generation
```typescript
import {
  generateDocument,
  generateCostOfInactionDocument,
  DocumentType,
} from '@/lib/pdf/generator';

// Generate document
const result = await generateCostOfInactionDocument(
  tenantId,
  tenantKmsKeyId,
  {
    organizationName: 'ACME Corp',
    currentRisks: [...],
    costSummary: { ... },
  }
);

if (result.success) {
  console.log(result.documentUrl);
}
```

### Feature Flags
```typescript
import {
  isFeatureEnabled,
  getFeatureFlags,
  setFeatureFlag,
} from '@/lib/feature-flags';

// Check if feature enabled
const enabled = await isFeatureEnabled('new-dashboard', {
  userId: user.id,
  tenantId: tenant.id,
});

if (enabled) {
  // Use new feature
}

// Set feature (admin)
await setFeatureFlag('new-dashboard', true, {
  rolloutPercentage: 50,
  targetedTenants: ['enterprise-customer-id'],
});
```

### Types
```typescript
import {
  Sector,
  State,
  TierRating,
  AssessmentStatus,
  DocumentType,
  EventType,
  type AssessmentGap,
  type OrgProfile,
  type User,
  type APIResponse,
  AssessmentGapSchema,
  OrgProfileSchema,
} from '@/types';

// Type-safe enums
const sector: Sector = Sector.TECHNOLOGY;
const state: State = State.CA;

// Validation with Zod
const gap = AssessmentGapSchema.parse(data);
const org = OrgProfileSchema.parse(data);
```

## Environment Variables

```bash
# Logging
GRAFANA_LOKI_HOST=loki.example.com
GRAFANA_LOKI_USER=user
GRAFANA_LOKI_PASSWORD=password
APP_VERSION=1.0.0

# Email (Resend)
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@evesecure.io

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890

# AWS
AWS_REGION=us-east-1
PDF_GENERATOR_LAMBDA_ARN=arn:aws:lambda:...
DOCUMENTS_S3_BUCKET=eve-secure-docs

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# App
APP_URL=https://evesecure.io
NODE_ENV=production
```

## Key Design Decisions

### 1. Error Handling
- **Three-tier logging**: User-facing messages + internal debugging + security events
- **Error IDs**: UUID for support reference tracking
- **Context preservation**: Rich error context without exposing sensitive data
- **Operational vs. Programming errors**: `isOperational` flag for proper handling

### 2. Logging
- **Structured JSON**: Queryable logs in Grafana
- **Automatic redaction**: Passwords, tokens, API keys, PII redacted automatically
- **Request correlation**: Track requests through the system
- **Log levels**: DEBUG (dev), INFO (all), WARN (anomalies), ERROR (failures), CRITICAL (security)

### 3. Notifications
- **Severity-based routing**: 
  - INFO/WARNING → Email only
  - HIGH → Email + SMS
  - CRITICAL → Both always
- **Quiet hours**: Respect user schedules for non-critical
- **Critical uncancellable**: Safety requirement for incident alerts
- **Audit trail**: All notifications logged for compliance

### 4. PDF Generation
- **Sandboxed execution**: AWS Lambda with no network access
- **Template injection prevention**: Pattern detection + input sanitization
- **Tenant isolation**: Per-tenant KMS encryption
- **Pre-signed URLs**: Time-limited secure access (7 days)

### 5. Feature Flags
- **Consistent hashing**: Stable rollouts across instances
- **Multi-strategy targeting**: Percentage, user, tenant, global
- **Redis caching**: 2-minute TTL for performance
- **Cache invalidation**: Immediate updates when flags change

### 6. Types
- **Enum-based safety**: Type-safe domain values
- **Computed properties**: User.fullName, Tenant.isExpired, etc.
- **Zod validation**: Runtime type safety
- **Generic types**: APIResponse<T>, PaginatedResponse<T>, StreamEvent<T>

## Testing Considerations

```typescript
// Mock logger for tests
jest.mock('@/lib/logging/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), ... },
}));

// Mock notifications
jest.mock('@/lib/notifications', () => ({
  notify: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock feature flags
jest.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue(true),
}));

// Use Zod for input validation in tests
const gap = AssessmentGapSchema.parse(testData);
```

## Performance Notes

- **Feature flags**: Redis cached, 2-minute TTL
- **Logging**: Async batch writes to Grafana
- **SMS**: Async with retry queue
- **Email**: Async dispatch via Resend
- **PDF**: Lambda cold starts mitigated by connection reuse

## Security Hardening

- **Input validation**: All user inputs validated before use
- **Template injection**: Regex pattern detection + sanitization
- **XSS prevention**: HTML escaping in email templates
- **CSRF protection**: Built into Express middleware
- **Rate limiting**: Integrated in middleware
- **Tenant isolation**: Enforced with database constraints
- **Encryption**: KMS for sensitive data
- **Audit logging**: All security events tracked

## Monitoring & Alerting

### Key Metrics to Track
- Error rate by type
- Email delivery success/failure rates
- SMS delivery success/failure rates (especially critical alerts)
- PDF generation latency and failures
- Feature flag evaluation latency
- Sensitive data redaction frequency

### Alerts to Set Up
- Critical error rate > 1%
- SMS delivery failures for critical alerts
- Email delivery failures > 5%
- Feature flag cache invalidation failures
- Template injection attempt detection
- Tenant isolation violations

## Database Schema (TODO)

The following tables need to be created:
- `feature_flags` - Flag definitions with rollout config
- `notification_preferences` - User notification settings
- `notification_audit` - Audit trail of all notifications
- `audit_trail` - Security event log

## Next Steps

1. Set up environment variables for all services
2. Configure AWS Lambda for PDF generation
3. Set up Grafana Loki for log aggregation
4. Implement database schema
5. Add integration tests
6. Set up monitoring dashboards
7. Configure PagerDuty/OpsGenie for critical alerts
8. Load test notification system
