import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * EVE Secure root middleware
 * - Clerk auth with public/protected route handling
 * - OWASP security headers
 * - Request ID tracing
 *
 * Patterns integrated from project_eve middleware:
 * - clerkMiddleware (v5+) instead of deprecated authMiddleware
 * - Security headers on all responses
 * - Request ID for end-to-end tracing
 */

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/signup(.*)",
  "/api/v1/health",
  "/api/v1/auth/emergency",
  "/api/webhooks/(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Protect non-public routes
  if (!isPublicRoute(req)) {
    await (auth as any).protect();
  }

  // Generate request ID for tracing
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", req.nextUrl.pathname);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Request ID in response for client correlation
  response.headers.set("X-Request-Id", requestId);

  // OWASP security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.clerk.com https://*.clerk.accounts.dev; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://api.clerk.com https://*.clerk.accounts.dev https://*.supabase.co"
  );
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()"
  );

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
