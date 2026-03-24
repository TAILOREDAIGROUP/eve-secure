import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/db';
import { createServiceClient } from '@/lib/auth/supabase-auth-server';

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';

interface CheckResult {
  status: 'healthy' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Deep health check endpoint (public, no auth required)
 * GET /api/v1/health
 *
 * Checks:
 * - Database connectivity (SELECT 1)
 * - Auth service (Supabase Auth reachable)
 */
export async function GET() {
  const checks: Record<string, CheckResult> = {};
  let overallStatus: 'healthy' | 'degraded' = 'healthy';

  // Check 1: Database connectivity
  try {
    const dbHealth = await checkDatabaseHealth();
    checks.database = {
      status: dbHealth.connected ? 'healthy' : 'down',
      latencyMs: dbHealth.latencyMs,
      error: dbHealth.error,
    };
    if (!dbHealth.connected) overallStatus = 'degraded';
  } catch (error) {
    checks.database = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    overallStatus = 'degraded';
  }

  // Check 2: Auth service (Supabase Auth)
  try {
    const start = Date.now();
    const supabase = createServiceClient();
    const { error } = await supabase.auth.getSession();
    const latencyMs = Date.now() - start;

    checks.auth = {
      status: error ? 'degraded' : 'healthy',
      latencyMs,
      error: error?.message,
    };
    if (error) overallStatus = 'degraded';
  } catch (error) {
    checks.auth = {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    overallStatus = 'degraded';
  }

  const statusCode = overallStatus === 'healthy' ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      checks,
    },
    { status: statusCode }
  );
}
