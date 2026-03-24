import { NextResponse } from 'next/server';
import { HealthCheckResponseSchema } from '@/lib/validation/schemas';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

/**
 * Health check endpoint (public, no auth required)
 * GET /api/v1/health
 */
export async function GET() {
  try {
    const response = {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
    };

    const validated = HealthCheckResponseSchema.parse(response);
    return NextResponse.json(validated);
  } catch (error) {
    // Health check should not expose errors
    return NextResponse.json(
      { status: 'ok', timestamp: new Date().toISOString(), version: APP_VERSION },
      { status: 200 }
    );
  }
}
