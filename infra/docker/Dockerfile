# Multi-stage build for production (Next.js standalone output)
FROM node:20-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (dev included for build)
RUN npm ci --legacy-peer-deps && \
    npm cache clean --force

# Copy source and config
COPY src ./src
COPY public ./public
COPY next.config.mjs tsconfig.json tailwind.config.ts postcss.config.mjs ./

# Build with standalone output
RUN npm run build

# Final production image
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    curl \
    dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy standalone output from builder
COPY --from=builder --chown=nodejs:nodejs /build/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /build/.next/static ./.next/static
COPY --from=builder --chown=nodejs:nodejs /build/public ./public

# Security: Read-only filesystem except for necessary directories
RUN chmod -R 755 /app && \
    mkdir -p /tmp /app/logs && \
    chmod 1777 /tmp && \
    chown -R nodejs:nodejs /app/logs

# Switch to non-root user
USER nodejs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]

# Start Next.js standalone server
CMD ["node", "server.js"]
