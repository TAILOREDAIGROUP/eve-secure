# EVE Secure API Routes & Validation Schemas

## Overview

This document outlines all API endpoints for EVE Secure, organized by domain. Every route follows Next.js 14 App Router patterns and includes Zod validation.

## Authentication & Authorization

- **Clerk Integration**: Primary auth via Clerk for user sessions
- **Emergency Access**: Phone-based authentication when Clerk is unavailable
- **Admin Roles**: super_admin, admin, analyst
- **Rate Limiting**: Applied per endpoint (referenced in comments)
- **Error Handling**: All errors return generic messages without stack traces

## Health & Webhooks

### GET `/api/v1/health`
- **Description**: Health check endpoint (public, no auth)
- **Rate Limit**: No limit
- **Response**: `{ status, timestamp, version }`
- **Status Codes**: 200

### POST `/api/webhooks/clerk`
- **Description**: Clerk user event webhook handler
- **Rate Limit**: No limit (webhook endpoint)
- **Events**: user.created, user.updated, user.deleted
- **Action**: Invalidate sessions on user deletion
- **Rate Limit**: 3 per minute per phone number

---

## Onboarding

### POST `/api/v1/onboarding`
- **Description**: Create tenant and organization profile
- **Auth**: Required (Clerk)
- **Rate Limit**: 10 per minute per user
- **Request Schema**: `OnboardingSchema`
  - orgName (string, 1-255 chars)
  - sector (enum: healthcare, legal)
  - state (US state codes)
  - employeeCount (1-100k)
  - itBudgetRange (enum: 0-50k, 50k-100k, 100k-500k, 500k-1m, 1m+)
  - currentTools (array of strings)
  - ehrSystem? (optional)
  - dmsSystem? (optional)
  - hasCyberInsurance (boolean)
  - carrierName? (optional)
  - notificationPrefs (emailEnabled, smsEnabled, phoneNumber?)
- **Response**: `OnboardingResponseSchema`
  - tenantId (UUID)
  - orgId (UUID)
  - sessionId (UUID)
  - status ('created')
- **Status Codes**: 201, 400, 401, 500

---

## Assessment

### GET `/api/v1/assessment`
- **Description**: List assessment sessions for user/tenant
- **Auth**: Required
- **Rate Limit**: 30 per minute
- **Query Params**: page, pageSize (max 50)
- **Response**: `ListResponseSchema` with `AssessmentSessionSchema[]`
- **Status Codes**: 200, 401, 500

### POST `/api/v1/assessment`
- **Description**: Start new assessment session
- **Auth**: Required
- **Rate Limit**: 10 per minute per user
- **Request Body**: `{ tenantId: uuid }`
- **Response**: `AssessmentSessionSchema`
  - sessionId (UUID)
  - tenantId (UUID)
  - createdAt (ISO 8601)
  - progress (0-100)
  - status (in_progress, completed, paused)
- **Status Codes**: 201, 400, 401, 500

### GET `/api/v1/assessment/[sessionId]`
- **Description**: Get assessment session details
- **Auth**: Required
- **Rate Limit**: 60 per minute
- **Response**: `AssessmentSessionSchema`
- **Status Codes**: 200, 400, 401, 500

### PATCH `/api/v1/assessment/[sessionId]`
- **Description**: Update session progress
- **Auth**: Required
- **Rate Limit**: 30 per minute
- **Request Body**: `{ progress?: number, status?: string, currentSection?: string }`
- **Response**: `AssessmentSessionSchema`
- **Status Codes**: 200, 400, 401, 500

### POST `/api/v1/assessment/[sessionId]/respond`
- **Description**: Submit assessment response (triggers AI analysis)
- **Auth**: Required
- **Rate Limit**: 20 per minute
- **Request Schema**: `AssessmentResponseSchema`
  - sessionId (UUID, URL param + body)
  - questionId (string)
  - section (string)
  - responseText (1-5000 chars)
- **Response**: `{ responseId, sessionId, status, message }`
- **Status Codes**: 202, 400, 401, 500
- **Note**: Returns 202 (Accepted) - processing via background queue

---

## Action Plans

### POST `/api/v1/plan`
- **Description**: Generate action plan from assessment
- **Auth**: Required
- **Rate Limit**: 10 per minute
- **Request Schema**: `PlanGenerationSchema`
  - sessionId (UUID)
  - budgetConstraint? (minimal, moderate, aggressive)
- **Response**: `PlanSchema`
  - planId (UUID)
  - sessionId (UUID)
  - status (draft, generated, reviewed)
  - createdAt (ISO 8601)
  - recommendations (array of objects)
    - priority (critical, high, medium, low)
    - title (string)
    - description (string)
    - estimatedCost? (number)
- **Status Codes**: 201, 400, 401, 500

### GET `/api/v1/plan/[planId]`
- **Description**: Get plan details
- **Auth**: Required
- **Rate Limit**: 60 per minute
- **Response**: `PlanSchema`
- **Status Codes**: 200, 400, 401, 500

---

## Documents

### GET `/api/v1/documents`
- **Description**: List generated documents for a session
- **Auth**: Required
- **Rate Limit**: 30 per minute
- **Query Params**: sessionId (required), page, pageSize (max 50)
- **Response**: `ListResponseSchema` with `DocumentSchema[]`
- **Status Codes**: 200, 400, 401, 500

### POST `/api/v1/documents`
- **Description**: Generate document
- **Auth**: Required
- **Rate Limit**: 10 per minute
- **Request Schema**: `DocumentGenerationSchema`
  - sessionId (UUID)
  - docType (enum: cost_of_inaction, assessment_report, ir_package, tabletop, insurance_questionnaire)
- **Response**: `DocumentSchema`
  - docId (UUID)
  - sessionId (UUID)
  - docType (string)
  - status (generating, ready, error)
  - createdAt (ISO 8601)
  - downloadUrl? (URL, when ready)
  - size? (bytes, when ready)
- **Status Codes**: 202, 400, 401, 500
- **Note**: Returns 202 (Accepted) - document generation is async

### GET `/api/v1/documents/[docId]`
- **Description**: Download document (returns metadata or URL)
- **Auth**: Required
- **Rate Limit**: 60 per minute
- **Response**: `DocumentSchema` with optional `downloadUrl`
- **Status Codes**: 200, 202 (if generating), 400, 401, 500
- **Note**: Logs download event for audit trail

---

## Server-Sent Events

### GET `/api/v1/sse`
- **Description**: SSE endpoint for streaming AI responses
- **Auth**: Required
- **Rate Limit**: 5 concurrent per user
- **Query Params**: sessionId (UUID), responseId (UUID)
- **Response**: Server-Sent Events stream
  - Message types: start, chunk, complete, error
  - Format: `{ type: string, data?: string, errorId?: uuid }`
- **Status Codes**: 200, 400, 401, 500
- **Note**: Client must handle reconnection and timeout (60s)

---

## Admin Endpoints

### GET `/api/v1/admin/tenants`
- **Description**: List all tenants
- **Auth**: Required (super_admin only)
- **Rate Limit**: 20 per minute
- **Query Params**: search (optional), page, pageSize (max 100)
- **Response**: `ListResponseSchema` with tenant objects
  - tenantId (UUID)
  - name (string)
  - sector (string)
  - createdAt (ISO 8601)
  - userCount (number)
  - assessmentCount (number)
- **Status Codes**: 200, 401, 403, 500

### GET `/api/v1/admin/knowledge`
- **Description**: Get knowledge base status
- **Auth**: Required (admin+)
- **Rate Limit**: 10 per minute
- **Response**: Knowledge base health information
  - status (healthy, degraded, down)
  - documentsIndexed (number)
  - lastSyncAt (ISO 8601)
  - nextScheduledSync (ISO 8601)
  - indexHealth (object)
- **Status Codes**: 200, 401, 403, 500

### POST `/api/v1/admin/knowledge`
- **Description**: Trigger knowledge base update
- **Auth**: Required (admin+)
- **Rate Limit**: 5 per hour
- **Response**: `{ jobId, status, message, estimatedDuration }`
- **Status Codes**: 202, 401, 403, 500
- **Note**: Returns 202 (Accepted) - update runs async

### GET `/api/v1/admin/evals`
- **Description**: Get evaluation results dashboard
- **Auth**: Required (admin+)
- **Rate Limit**: 20 per minute
- **Query Params**: period (7d, 30d, 90d), page, pageSize (max 50)
- **Response**: `ListResponseSchema` with evaluation metrics
  - evalId (UUID)
  - testName (string)
  - passRate (number 0-100)
  - sampleSize (number)
  - timestamp (ISO 8601)
  - details (object with metric breakdowns)
- **Status Codes**: 200, 401, 403, 500

---

## Insurance & Incident Response

### POST `/api/v1/insurance/upload`
- **Description**: Upload insurance questionnaire
- **Auth**: Required
- **Rate Limit**: 10 per hour per user
- **Content-Type**: multipart/form-data
- **Form Fields**: file (max 25MB), sessionId (UUID)
- **Response**: `{ docId, sessionId, fileName, status, message }`
- **Status Codes**: 202, 400, 401, 500
- **Note**: Returns 202 (Accepted) - document processing is async

### POST `/api/v1/ir/start`
- **Description**: Start incident response walkthrough
- **Auth**: Required
- **Rate Limit**: 5 per minute
- **Request Body**: `{ sessionId, incidentType, severity }`
- **Response**: IR session object with phases and tasks
  - irSessionId (UUID)
  - sessionId (UUID)
  - status (initiated)
  - incidentType (string)
  - severity (string)
  - startedAt (ISO 8601)
  - phases (array of phase objects)
- **Status Codes**: 201, 400, 401, 500

---

## Authentication

### POST `/api/v1/auth/emergency`
- **Description**: Emergency authentication via phone code
- **Auth**: Not required (public endpoint)
- **Rate Limit**: 3 per 15 minutes per phone number
- **Request Body (action=request)**: `{ action: "request", phoneNumber }`
  - phoneNumber: +1 format or 10 digits
- **Response (request)**: `{ status, message, expiresIn }`
- **Request Body (action=verify)**: `{ action: "verify", phoneNumber, code }`
  - code: 6-digit code sent via SMS
- **Response (verify)**: `{ status, sessionToken, expiresIn, scope, message }`
  - sessionToken: Temporary token (1 hour)
  - scope: Limited to read operations
- **Status Codes**: 200, 400, 401, 500
- **Security**: Lockout after 5 failed attempts per 15 minutes

---

## Validation Schemas

### Zod Schemas (from `/src/lib/validation/schemas.ts`)

All schemas are exported from `@/lib/validation/schemas`:

1. **OnboardingSchema** - Tenant creation
2. **AssessmentResponseSchema** - Assessment responses
3. **AssessmentSessionSchema** - Assessment session metadata
4. **PlanGenerationSchema** - Plan creation request
5. **PlanSchema** - Plan data
6. **DocumentGenerationSchema** - Document creation request
7. **DocumentSchema** - Document metadata
8. **AdminUserSchema** - Admin user profile
9. **NotificationPrefsSchema** - Notification settings
10. **QuerySchema** - AI query input
11. **FileUploadSchema** - File upload metadata
12. **ErrorResponseSchema** - Error response format
13. **HealthCheckResponseSchema** - Health endpoint
14. **OnboardingResponseSchema** - Onboarding response
15. **ListResponseSchema** - Paginated list responses
16. **SSEMessageSchema** - Server-sent event format

---

## Error Response Format

All errors follow this schema:

```json
{
  "error": "Error type",
  "message": "Human-readable message",
  "errorId": "uuid"
}
```

### Common Status Codes

- **200**: Success (GET, some PATCH)
- **201**: Created (POST)
- **202**: Accepted (async operations)
- **400**: Validation error
- **401**: Unauthorized
- **403**: Forbidden (insufficient permissions)
- **500**: Internal server error

---

## Security Features

1. **Authentication**: Clerk + optional emergency phone auth
2. **Authorization**: Role-based access control
3. **Rate Limiting**: Per-endpoint limits, per-user quotas
4. **Input Validation**: Zod schemas on all endpoints
5. **Error Handling**: Generic error messages, no stack traces
6. **Session Management**: Invalidation on user deletion
7. **Audit Logging**: All admin actions logged

---

## Implementation Notes

- All routes use Next.js 14 App Router patterns
- Database operations are TODO (marked in code)
- AI integration triggers async via queue/worker pattern
- Document generation is asynchronous (202 responses)
- File uploads use cloud storage (S3 or similar)
- SSE endpoint has 60-second timeout
- Emergency auth creates limited-scope sessions
