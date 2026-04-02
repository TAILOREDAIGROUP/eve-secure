import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * EVE Secure root middleware
 * - Supabase Auth session verification (replaces Clerk)
 * - CSP nonce per request (no unsafe-inline / unsafe-eval)
 * - OWASP security headers
 * - Request ID tracing
 */

const PUBLIC_ROUTES = new Set([
  '/',
  '/login',
  '/signup',
  '/api/v1/health',
  '/api/v1/auth/emergency',
]);

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/v1/webhooks/')) return true;
  if (pathname.startsWith('/login')) return true;
  if (pathname.startsWith('/signup')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  // Generate request ID for tracing
  const requestId = crypto.randomUUID();

  // Generate CSP nonce
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  let response = NextResponse.next({
    request: {
      headers: new Headers(req.headers),
    },
  });

  // Create Supabase client with cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Set cookies on request for downstream
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          // Re-create response with updated request
          response = NextResponse.next({
            request: { headers: new Headers(req.headers) },
          });
          // Set cookies on response for browser
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session (important for token rotation)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // Protect non-public routes
  if (!isPublicRoute(pathname)) {
    if (!user) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Set user context headers for downstream API routes
    response.headers.set('x-user-id', user.id);
  }

  // Request ID headers
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-pathname', pathname);

  // OWASP security headers
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  );
  response.headers.set(
    'Content-Security-Policy',
    [
      `default-src 'self'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      `img-src 'self' data: https:`,
      `font-src 'self'`,
      `connect-src 'self' https://*.supabase.co`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
    ].join('; ')
  );
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
