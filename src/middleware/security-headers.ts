import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Security headers middleware for EVE Secure
 * Implements strict HIPAA-compliant security headers
 * - Content Security Policy (CSP) with script restrictions
 * - Frame embedding prevention (X-Frame-Options)
 * - MIME type sniffing prevention
 * - Referrer policy for privacy
 * - Permissions policy to disable sensitive APIs
 * - HSTS for HTTPS enforcement
 */

/**
 * Content Security Policy configuration
 * Restrictive by default - only allow self and trusted CDNs
 */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Add trusted CDN sources here as needed
    // 'https://cdn.example.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"], // Inline styles needed for UI frameworks
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'", 'https:'], // API calls to HTTPS endpoints only
  'form-action': ["'self'"], // Forms only submit to same origin
  'frame-ancestors': ["'none'"], // Prevent embedding in iframes
  'base-uri': ["'self'"], // Prevent base tag injection
  'object-src': ["'none'"], // Prevent plugin injection
  'media-src': ["'self'"],
  'worker-src': ["'self'"], // Web workers only from same origin
  'frame-src': ["'none'"],
  'child-src': ["'none'"],
};

/**
 * Build CSP header value from directives
 */
function buildCspHeader(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Apply security headers to response
 * Called for every response in Next.js middleware
 * @param request - Incoming request
 * @param response - Response to add headers to
 * @returns Response with security headers added
 */
export function addSecurityHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  // Content Security Policy
  // Blocks inline scripts and restricts external script sources
  response.headers.set(
    'Content-Security-Policy',
    buildCspHeader()
  );

  // Report-only CSP for monitoring (logs violations without blocking)
  response.headers.set(
    'Content-Security-Policy-Report-Only',
    `${buildCspHeader()}; report-uri /api/security/csp-report`
  );

  // X-Frame-Options: DENY
  // Prevents clickjacking by preventing page from being framed
  response.headers.set('X-Frame-Options', 'DENY');

  // X-Content-Type-Options: nosniff
  // Prevents MIME type sniffing, forces declared content type
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Referrer-Policy: strict-origin-when-cross-origin
  // Sends origin only for cross-origin requests, full URL for same-origin
  // Protects user privacy while preserving referrer for same-site requests
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy: disable sensitive APIs
  // Prevents feature requests for camera, microphone, geolocation, etc.
  // Format: (feature)=() disables feature entirely
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );

  // X-Permitted-Cross-Domain-Policies: none
  // Prevents Adobe Flash from loading content from this site
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  // Strict-Transport-Security (HSTS)
  // Forces HTTPS for all future requests
  // max-age: 1 year (31536000 seconds)
  // includeSubDomains: applies to all subdomains
  // preload: allows inclusion in HSTS preload list
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // X-XSS-Protection: 1; mode=block
  // Legacy header for older browsers that don't support CSP
  // Enables XSS protection and blocks page if attack detected
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Remove server identification headers
  response.headers.delete('Server');
  response.headers.delete('X-Powered-By');

  // Add custom security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');

  return response;
}

/**
 * Middleware function for Next.js
 * Apply security headers to all responses
 */
export function securityHeadersMiddleware(request: NextRequest): NextResponse {
  // Create a response to modify
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  return addSecurityHeaders(request, response);
}

/**
 * Validate Content-Security-Policy violations
 * Handler for CSP report-uri endpoint
 * @param violationData - CSP violation report from browser
 */
export interface CspViolation {
  'document-uri': string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  'disposition': string;
  'blocked-uri'?: string;
  'source-file'?: string;
  'status-code'?: number;
  'line-number'?: number;
  'column-number'?: number;
}

/**
 * Process CSP violation report
 * Log violations for security monitoring and alerting
 * @param violation - CSP violation data
 */
export function processCspViolation(violation: CspViolation): void {
  // Log violation with details
  logger.warn('CSP violation detected', {
    documentUri: violation['document-uri'],
    violatedDirective: violation['violated-directive'],
    blockedUri: violation['blocked-uri'],
    sourceFile: violation['source-file'],
    lineNumber: violation['line-number'],
  });

  // In production, send to security monitoring service
  // Example: Sentry, Datadog, CloudWatch, etc.
}

/**
 * Security headers configuration for export
 * Can be used to pre-compute headers for caching
 */
export const securityHeadersConfig = {
  'Content-Security-Policy': buildCspHeader(),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-XSS-Protection': '1; mode=block',
};

/**
 * Validate that security headers are present
 * Used for testing and monitoring
 * @param headers - Response headers
 * @returns true if all required headers present
 */
export function validateSecurityHeaders(headers: Headers): boolean {
  const requiredHeaders = [
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
    'Strict-Transport-Security',
  ];

  return requiredHeaders.every(header => headers.has(header));
}
