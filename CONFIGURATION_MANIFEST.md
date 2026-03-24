# EVE Secure Configuration Manifest

All project configuration files have been created and are production-ready.

## Root Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts (dev, test, db, eval, build) |
| `tsconfig.json` | Strict TypeScript configuration with path aliases (@/) |
| `tailwind.config.ts` | Tailwind CSS with dark mode and Shadcn/UI setup |
| `.eslintrc.json` | ESLint with Next.js + TypeScript rules, no-any enforcement |
| `.prettierrc` | Prettier configuration (2-space, semi-colons, single quotes off) |
| `vitest.config.ts` | Vitest for unit/integration tests, 80% coverage minimum |
| `next.config.mjs` | Next.js configuration with security headers, image optimization |
| `postcss.config.mjs` | PostCSS with Tailwind and Autoprefixer |
| `.env.example` | All required environment variables documented |
| `.env.test` | Test environment variables for CI/test execution |
| `.gitignore` | Comprehensive ignore patterns for production |
| `docker-compose.yml` | Local dev services: PostgreSQL, Redis, ClamAV, LocalStack |
| `README.md` | Quick start guide, project structure, available scripts |

## Claude Code Configuration (`.claude/`)

### Rules (`.claude/rules/`)
| File | Purpose |
|------|---------|
| `database.md` | Database best practices: tenant_id, RLS, migrations, parameterization |
| `api.md` | API standards: Zod validation, auth checks, error handling, rate limiting |
| `ai.md` | AI/LLM guidelines: RAG-only, server-side prompts, output validation, citations |
| `security.md` | Security requirements: secrets, encryption, file uploads, audit logging |

### Commands (`.claude/commands/`)
| File | Purpose |
|------|---------|
| `verify-slice.md` | Comprehensive verification command for code slices |

### Hooks (`.claude/hooks/`)
| File | Purpose |
|------|---------|
| `block-dangerous.sh` | Development safety hook: blocks dangerous commands (rm -rf, DROP TABLE, etc.) |

### Settings (`.claude/`)
| File | Purpose |
|------|---------|
| `settings.json` | Claude Code project configuration, knowledge base, linting rules |

## Documentation (`.docs/`)

| File | Purpose |
|------|---------|
| `tech-debt.md` | Technical debt register with priority and effort tracking |

## Configuration Summary

### Development Tools
- **Package Manager**: npm 9+
- **Language**: TypeScript 5.3 (strict mode)
- **Framework**: Next.js 14
- **Testing**: Vitest with 80% coverage requirement
- **Linting**: ESLint + Prettier
- **Code Standards**: No `any` types, no `console.log`, parameterized queries

### Security Standards
- **Authentication**: Clerk OAuth 2.0
- **Database**: PostgreSQL with pgvector + Row-Level Security
- **Encryption**: AWS KMS per-tenant encryption
- **File Validation**: Magic byte checking, ClamAV scanning
- **Audit Trail**: Immutable audit logs for all state changes
- **Rate Limiting**: Global + endpoint-specific limits

### Database Standards
- Every table has `tenant_id` column with RLS
- All queries must be parameterized
- Use TIMESTAMPTZ (not TIMESTAMP) for dates
- Use DECIMAL(10,2) (not FLOAT) for money
- Migrations include rollback comments
- Audit trail fields: created_at, updated_at, created_by, updated_by

### API Standards
- All routes use Zod for input validation
- All protected routes verify auth before logic
- Errors never expose internal details
- Rate limiting on all public endpoints
- Request tracing with X-Request-ID headers

### AI/LLM Standards
- RAG-only operation (no general knowledge)
- System prompts server-side only
- All model outputs validated before delivery
- Citations required on every response
- Content filtering for harmful/PII content

### Local Development
```bash
npm install
docker-compose up -d
npm run db:migrate
npm run dev
```

## Scripts Available

### Development
- `npm run dev` - Start dev server
- `npm run build` - Build for production
- `npm run typecheck` - TypeScript verification
- `npm run lint` - ESLint check
- `npm run lint:fix` - Auto-fix linting

### Testing
- `npm run test` - All tests (unit + integration + e2e)
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests
- `npm run test:e2e` - End-to-end tests

### Database
- `npm run db:migrate` - Run migrations
- `npm run db:seed` - Seed data
- `npm run db:reset` - Reset (dev only)

### Evaluations
- `npm run eval:accuracy` - Test accuracy
- `npm run eval:injection` - Test injection detection
- `npm run eval:isolation` - Test data isolation
- `npm run eval:harm` - Test harm detection

## Production Readiness Checklist

✓ Strict TypeScript configuration
✓ Comprehensive linting rules
✓ Security best practices documented
✓ Database security patterns (tenant isolation, parameterization)
✓ API validation and error handling
✓ RAG-only AI operation
✓ File upload validation
✓ Encryption configuration
✓ Audit logging framework
✓ Test configuration (80% coverage)
✓ Docker Compose for local dev
✓ Security headers in Next.js config
✓ Environment variable documentation
✓ Development safety hooks
✓ Tech debt tracking
✓ Code verification command

## Next Steps

1. **Install dependencies**: `npm install`
2. **Start services**: `docker-compose up -d`
3. **Run migrations**: `npm run db:migrate`
4. **Start development**: `npm run dev`
5. **Verify setup**: `npm run test:unit`

All configuration files follow production best practices and are ready for immediate use.
