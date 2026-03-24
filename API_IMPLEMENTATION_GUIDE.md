# EVE Secure API Implementation Guide

## Project Structure

```
src/
├── app/
│   └── api/
│       ├── v1/
│       │   ├── health/              # Public health check
│       │   ├── onboarding/          # Tenant creation
│       │   ├── assessment/          # Assessment sessions
│       │   │   └── [sessionId]/
│       │   │       └── respond/     # Submit responses
│       │   ├── plan/                # Action plans
│       │   │   └── [planId]/
│       │   ├── documents/           # Document generation
│       │   │   └── [docId]/
│       │   ├── sse/                 # Server-sent events
│       │   ├── insurance/
│       │   │   └── upload/
│       │   ├── ir/
│       │   │   └── start/
│       │   ├── auth/
│       │   │   └── emergency/
│       │   └── admin/
│       │       ├── tenants/
│       │       ├── knowledge/
│       │       └── evals/
│       └── webhooks/
│           └── clerk/
└── lib/
    └── validation/
        └── schemas.ts               # All Zod schemas
```

## Implementation Checklist

### 1. Database Layer

- [ ] Set up database connection (`src/lib/db/client.ts`)
  - [ ] Initialize database client (Prisma, TypeORM, or custom)
  - [ ] Set up connection pooling
  - [ ] Add retry logic with exponential backoff

- [ ] Create schema migrations for:
  - [ ] tenants (id, name, sector, state, status, created_at, updated_at)
  - [ ] organizations (id, tenant_id, org_name, employee_count, it_budget, created_at)
  - [ ] assessment_sessions (id, tenant_id, user_id, progress, status, current_section, created_at, updated_at)
  - [ ] assessment_responses (id, session_id, question_id, section, response_text, ai_insights, score, created_at)
  - [ ] action_plans (id, session_id, tenant_id, status, recommendations, created_at)
  - [ ] documents (id, session_id, doc_type, status, file_path, download_url, created_at)
  - [ ] notification_preferences (id, tenant_id, email_enabled, sms_enabled, phone_number)
  - [ ] emergency_sessions (id, tenant_id, phone_number, token, scope, expires_at)

### 2. Authentication & Authorization

- [ ] Implement Clerk integration
  - [ ] Verify JWT tokens from Clerk
  - [ ] Extract user and org context
  - [ ] Set up auth middleware

- [ ] Implement emergency authentication
  - [ ] SMS code generation and sending (Twilio)
  - [ ] Code verification and validation
  - [ ] Emergency session token creation
  - [ ] Limited scope enforcement

- [ ] Implement session invalidation
  - [ ] Handle Clerk webhook for user.deleted event
  - [ ] Query and invalidate all sessions for deleted user
  - [ ] Log deletion for audit trail

- [ ] Implement role-based access control
  - [ ] Store user roles in database
  - [ ] Check roles in admin endpoints
  - [ ] Return 403 Forbidden for insufficient permissions

### 3. Request Validation

- [ ] Verify all endpoints use Zod schemas
  - [ ] Parse request body with schema
  - [ ] Return 400 with validation error on failure
  - [ ] Avoid exposing internal error details

### 4. Rate Limiting

- [ ] Implement rate limiting middleware
  - [ ] Per-endpoint limits (see API_ROUTES.md)
  - [ ] Per-user quotas (track by Clerk userId)
  - [ ] Per-IP limits for public endpoints
  - [ ] Use Redis for distributed rate limiting
  - [ ] Return 429 Too Many Requests when exceeded

- [ ] Rate limits by endpoint:
  - [ ] Health: No limit (public)
  - [ ] Onboarding: 10/min per user
  - [ ] Assessment list: 30/min
  - [ ] Assessment GET/PATCH: 60/min
  - [ ] Assessment respond: 20/min
  - [ ] Plan creation: 10/min
  - [ ] Document generation: 10/min
  - [ ] Document download: 60/min
  - [ ] SSE: 5 concurrent per user
  - [ ] Admin tenants: 20/min
  - [ ] Admin knowledge: 10/min, POST 5/hour
  - [ ] Admin evals: 20/min
  - [ ] Insurance upload: 10/hour per user
  - [ ] IR start: 5/min
  - [ ] Emergency auth request: 3/15min per phone
  - [ ] Emergency auth verify: 5 failures/15min lockout

### 5. Async Operations

- [ ] Set up job queue (Bull, RabbitMQ, or AWS SQS)
  - [ ] Define job types
  - [ ] Implement job handlers
  - [ ] Add retry logic (exponential backoff)
  - [ ] Log job completion/failure

- [ ] Jobs to implement:
  - [ ] AI assessment response analysis
    - [ ] Score response against rubric
    - [ ] Generate insights
    - [ ] Suggest follow-up questions
  - [ ] Action plan generation
    - [ ] Fetch assessment data
    - [ ] Call AI to generate plan
    - [ ] Store recommendations
  - [ ] Document generation
    - [ ] Fetch assessment/plan data
    - [ ] Render template
    - [ ] Generate PDF
    - [ ] Upload to storage
  - [ ] Knowledge base update
    - [ ] Fetch documents from external sources
    - [ ] Process and chunk
    - [ ] Generate embeddings
    - [ ] Update vector database
  - [ ] Insurance document processing
    - [ ] Extract text (OCR if needed)
    - [ ] Analyze via AI
    - [ ] Generate summary

### 6. File Storage

- [ ] Set up cloud storage (AWS S3, GCS, or similar)
  - [ ] Configure bucket policies
  - [ ] Set up signed URLs for downloads
  - [ ] Implement file scanning for malware
  - [ ] Set up lifecycle policies (delete after N days)

- [ ] Implement file upload:
  - [ ] Validate file size (max 25MB)
  - [ ] Validate MIME type
  - [ ] Generate unique file names
  - [ ] Store in cloud storage
  - [ ] Return download URL

### 7. Server-Sent Events

- [ ] Implement SSE stream management
  - [ ] Subscribe to response ID in queue/Redis
  - [ ] Stream chunks as they arrive
  - [ ] Handle client disconnection gracefully
  - [ ] Timeout after 60 seconds
  - [ ] Clean up subscriptions

### 8. Webhook Handling

- [ ] Implement Clerk webhook verification
  - [ ] Verify Svix signature
  - [ ] Handle user.created event
  - [ ] Handle user.updated event
  - [ ] Handle user.deleted event

- [ ] Implement user deletion flow:
  - [ ] Archive user data (for compliance)
  - [ ] Invalidate all sessions
  - [ ] Clean up temporary files
  - [ ] Log deletion for audit trail

### 9. Logging & Monitoring

- [ ] Set up structured logging
  - [ ] Log all API requests (endpoint, user, status)
  - [ ] Log errors with context
  - [ ] Log admin actions (for audit trail)
  - [ ] Include error IDs in logs

- [ ] Set up monitoring
  - [ ] Monitor error rates
  - [ ] Monitor response times
  - [ ] Monitor database performance
  - [ ] Set up alerts for critical issues

### 10. Error Handling

- [ ] Implement consistent error responses
  - [ ] Include error ID in every response
  - [ ] Use generic messages (no stack traces)
  - [ ] Log full error internally

- [ ] Handle specific error types:
  - [ ] Validation errors (400)
  - [ ] Authentication errors (401)
  - [ ] Authorization errors (403)
  - [ ] Not found errors (404)
  - [ ] Rate limit errors (429)
  - [ ] Server errors (500)

### 11. Testing

- [ ] Unit tests for validation schemas
- [ ] Integration tests for each endpoint
- [ ] End-to-end tests for key flows
- [ ] Load testing for rate limiting
- [ ] Security testing (auth, CORS, injection)

### 12. Documentation

- [ ] API documentation (OpenAPI/Swagger)
- [ ] Authentication guide
- [ ] Error code reference
- [ ] Rate limit documentation
- [ ] Deployment guide

## Key Implementation Notes

### Authentication Flow

1. Client authenticates via Clerk
2. Clerk returns session token
3. Client includes token in Authorization header
4. Middleware verifies token and extracts userId
5. Route handler checks role for authorization
6. Return 401 if not authenticated, 403 if not authorized

### Emergency Authentication Flow

1. User requests code via `POST /api/v1/auth/emergency` with action=request
2. System verifies phone number is registered
3. System generates 6-digit code
4. System sends code via SMS (Twilio)
5. User verifies code via `POST /api/v1/auth/emergency` with action=verify
6. System validates code (not expired, not used)
7. System creates emergency session (1 hour, read-only scope)
8. System returns temporary token
9. User can now access read-only endpoints with token

### Assessment Flow

1. User posts response to `/api/v1/assessment/[sessionId]/respond`
2. Route returns 202 Accepted with responseId
3. Job queued to analyze response
4. Worker AI agent analyzes response
5. Worker stores insights in database
6. Client polls SSE endpoint for updates
7. SSE streams chunks as analysis completes
8. Progress updated as part of assessment session

### Document Generation Flow

1. User requests document via `POST /api/v1/documents`
2. Route returns 202 Accepted with docId
3. Job queued for document generation
4. Worker fetches assessment/plan data
5. Worker renders template
6. Worker generates PDF
7. Worker uploads to S3
8. Worker updates document status to 'ready'
9. User can download via `GET /api/v1/documents/[docId]`

## Environment Variables Required

```bash
# Clerk
CLERK_BACKEND_API_URL=
CLERK_WEBHOOK_SECRET=

# Database
DATABASE_URL=

# Storage
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET_NAME=

# SMS/Phone
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Queue
REDIS_URL=

# AI
LITELLM_API_KEY=
LITELLM_MODEL=

# App
NEXT_PUBLIC_APP_VERSION=1.0.0
NODE_ENV=production
```

## Security Considerations

1. **Input Validation**: All inputs validated with Zod
2. **Error Messages**: Generic error messages, no stack traces
3. **Authentication**: Clerk + emergency auth
4. **Authorization**: Role-based access control
5. **Rate Limiting**: Per-endpoint and per-user
6. **File Uploads**: Size limits, MIME type validation, malware scanning
7. **Database**: Parameterized queries (via ORM), encryption at rest
8. **Sessions**: Invalidation on user deletion
9. **Audit Logging**: Admin actions logged
10. **CORS**: Configured for frontend domain only
11. **HTTPS**: Enforced in production
12. **Headers**: Security headers via middleware

## Performance Considerations

1. **Async Operations**: Long-running tasks queued
2. **Caching**: Cache knowledge base, evaluation results
3. **Database**: Index on frequently queried columns
4. **Connection Pooling**: Reuse database connections
5. **CDN**: Static assets via CDN
6. **Pagination**: All list endpoints paginated (max 50-100 items)

## Deployment Checklist

- [ ] Set all environment variables
- [ ] Run database migrations
- [ ] Set up job queue workers
- [ ] Configure S3 bucket
- [ ] Set up Twilio account
- [ ] Configure Clerk webhook
- [ ] Set up logging service
- [ ] Set up monitoring/alerts
- [ ] Configure CORS for frontend domain
- [ ] Enable HTTPS
- [ ] Set up CDN for static assets
- [ ] Test all endpoints in staging
- [ ] Set up database backups
- [ ] Document deployment process
