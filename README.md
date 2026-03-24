# EVE Secure - AI Security Evaluation Platform

Production-ready configuration for EVE Secure, an AI safety evaluation and testing platform.

## Quick Start

### Prerequisites

- Node.js 18.17+ and npm 9+
- Docker and Docker Compose
- PostgreSQL 16+ (via Docker)
- Redis 7+ (via Docker)

### Installation

```bash
# Install dependencies
npm install

# Start local services
docker-compose up -d

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
eve-secure/
├── src/
│   ├── app/              # Next.js app router
│   ├── components/       # React components
│   ├── lib/             # Utilities and helpers
│   ├── types/           # TypeScript types
│   ├── hooks/           # Custom React hooks
│   └── __tests__/       # Test files
├── .claude/             # Claude Code configuration
│   ├── rules/           # Development rules
│   ├── commands/        # Custom commands
│   └── hooks/           # Development hooks
├── docs/                # Documentation
├── scripts/             # Utility scripts
├── public/              # Static assets
└── config files         # Configuration (eslint, ts, etc.)
```

## Available Scripts

### Development

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run typecheck    # Check TypeScript
npm run lint         # Lint code
npm run lint:fix     # Fix linting issues
```

### Testing

```bash
npm run test         # Run all tests
npm run test:unit   # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e    # End-to-end tests
```

### Database

```bash
npm run db:migrate  # Run migrations
npm run db:seed     # Seed database
npm run db:reset    # Reset database (DEV ONLY)
```

### Evaluation

```bash
npm run eval:accuracy     # Run accuracy evaluations
npm run eval:injection    # Test injection detection
npm run eval:isolation    # Test data isolation
npm run eval:harm         # Test harm detection
npm run test:eval         # Run all evaluation tests
```

## Configuration

### Environment Variables

Copy `.env.example` to `.env.local` and update values:

```bash
cp .env.example .env.local
```

Key variables:
- `CLERK_*` - Authentication
- `NEXT_PUBLIC_SUPABASE_*` - Database
- `LITELLM_*` - LLM integration
- `AWS_*` - Cloud services
- `REDIS_URL` - Caching

See `.env.example` for complete list.

## Development Guidelines

### Code Quality

- **TypeScript**: Strict mode enforced
- **Linting**: ESLint with Next.js rules
- **Formatting**: Prettier (2-space indentation)
- **Testing**: Vitest with 80% coverage minimum

### Security Rules

All code must follow `.claude/rules/`:

1. **Database** (`database.md`)
   - Every table has `tenant_id` with RLS
   - All queries parameterized
   - Migrations include rollback comments

2. **API** (`api.md`)
   - Input validation with Zod
   - Auth checks before logic
   - No internal details in errors
   - Rate limiting on public endpoints

3. **AI** (`ai.md`)
   - RAG-only operation
   - Server-side system prompts
   - Output validation required
   - Citations on all responses

4. **Security** (`security.md`)
   - No secrets in code
   - Per-tenant KMS encryption
   - File uploads validated by magic bytes
   - Audit trail for all changes

### Verification

Before submitting code:

```bash
npm run lint:fix     # Auto-fix formatting
npm run typecheck    # Type check
npm run test         # Run tests
claude verify-slice --all  # Verify against rules
```

## Testing

### Unit Tests

```bash
npm run test:unit -- src/lib/utils.test.ts
```

### Integration Tests

```bash
npm run test:integration -- src/api/evaluation.integration.test.ts
```

### End-to-End Tests

```bash
npm run test:e2e
```

### Coverage Report

Coverage is generated in `coverage/` directory after tests:

```bash
npm run test:unit
open coverage/index.html
```

## Database

### Migrations

Migrations stored in `scripts/db/migrations/` with naming: `NNN_description.sql`

Create new migration:

```bash
touch scripts/db/migrations/001_create_users_table.sql
npm run db:migrate
```

### Schema Rules

- Every table has `tenant_id` (multi-tenant)
- Row-Level Security (RLS) enabled
- `created_at`, `updated_at` timestamps (TIMESTAMPTZ)
- Money fields use `DECIMAL(10,2)`, never FLOAT
- All queries parameterized

## Deployment

### Build

```bash
npm run build
```

### Docker

```bash
docker build -t eve-secure:latest .
docker run -p 3000:3000 eve-secure:latest
```

### Environment

Set `NODE_ENV=production` for production deployments.

## Security

- Secrets managed via environment variables
- AWS KMS encryption for sensitive data
- File uploads validated by magic bytes
- All changes audit logged
- Rate limiting on all endpoints
- CORS and security headers configured

## Monitoring

- Application metrics exported to Grafana
- Error tracking and alerting
- Audit logs in PostgreSQL
- Request tracing with X-Request-ID

## Documentation

- `.claude/rules/` - Development rules and standards
- `docs/` - Technical documentation
- `docs/tech-debt.md` - Known technical debt items

## Contributing

1. Create feature branch: `git checkout -b feature/name`
2. Make changes and test: `npm run test`
3. Verify code: `npm run lint && npm run typecheck`
4. Commit with message: `git commit -m "description"`
5. Push and create pull request

## Support

For issues or questions:
1. Check `.claude/rules/` for guidelines
2. Review `docs/` for documentation
3. Search existing GitHub issues
4. Open new issue with context

## License

Proprietary - EVE Secure Platform
