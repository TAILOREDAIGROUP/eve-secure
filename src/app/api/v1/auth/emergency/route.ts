import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


/**
 * POST /api/v1/auth/emergency
 * Emergency authentication via one-time codes (bypasses standard auth)
 * Rate limit: 3 attempts per 15 minutes per email
 */

const EmergencyAuthSchema = z.object({
  email: z.string().email(),
  code: z.string().min(1).max(20),
});

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MINUTES = 15;

async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
  const db = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Count attempts in current window
  const { data, error } = await db
    .from('emergency_rate_limits')
    .select('attempt_count')
    .eq('identifier', identifier)
    .gte('window_start', windowStart)
    .order('window_start', { ascending: false })
    .limit(1);

  if (error) {
    logger.error('Rate limit check failed — failing CLOSED', {
      error: error.message,
      severity: 'CRITICAL',
      identifier,
    });
    // Fail closed: when rate limit check fails, deny the request
    return { allowed: false, remaining: 0 };
  }

  const currentCount = data?.[0]?.attempt_count ?? 0;
  return {
    allowed: currentCount < RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - currentCount),
  };
}

async function recordAttempt(identifier: string): Promise<void> {
  const db = getSupabaseAdmin();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();

  // Try to increment existing window
  const { data: existing } = await db
    .from('emergency_rate_limits')
    .select('id, attempt_count')
    .eq('identifier', identifier)
    .gte('window_start', windowStart)
    .order('window_start', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    await db
      .from('emergency_rate_limits')
      .update({ attempt_count: (existing[0]?.attempt_count ?? 0) + 1 })
      .eq('id', existing[0]!.id);
  } else {
    await db
      .from('emergency_rate_limits')
      .insert({ identifier, attempt_count: 1, window_start: new Date().toISOString() });
  }
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const body = await request.json();

    // Validate input
    const parsed = EmergencyAuthSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: parsed.error.errors.map((e) => e.message).join(', '),
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    const { email, code } = parsed.data;
    const normalizedCode = code.toUpperCase().trim();

    // Rate limit check
    const rateLimit = await checkRateLimit(email);
    if (!rateLimit.allowed) {
      logger.warn('Emergency auth rate limited', { email, requestId });
      return NextResponse.json(
        {
          error: 'Rate Limit Exceeded',
          message: `Too many attempts. Try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes.`,
          errorId: requestId,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(RATE_LIMIT_WINDOW_MINUTES * 60),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // Record attempt before validation
    await recordAttempt(email);

    // Find user by email
    const db = getSupabaseAdmin();
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, email, role')
      .eq('email', email)
      .limit(1)
      .single();

    if (userError || !user) {
      // Don't reveal whether email exists
      return NextResponse.json(
        {
          error: 'Authentication Failed',
          message: 'Invalid email or emergency code',
          errorId: requestId,
        },
        { status: 401 }
      );
    }

    // Get unused emergency codes for this user
    const { data: emergencyCodes, error: codesError } = await db
      .from('emergency_codes')
      .select('id, code_hash, used')
      .eq('user_id', user.id)
      .eq('used', false);

    if (codesError || !emergencyCodes || emergencyCodes.length === 0) {
      return NextResponse.json(
        {
          error: 'Authentication Failed',
          message: 'Invalid email or emergency code',
          errorId: requestId,
        },
        { status: 401 }
      );
    }

    // Check code against all unused hashes
    let matchedCodeId: string | null = null;
    for (const ec of emergencyCodes) {
      const isMatch = await bcrypt.compare(normalizedCode, ec.code_hash);
      if (isMatch) {
        matchedCodeId = ec.id;
        break;
      }
    }

    if (!matchedCodeId) {
      logger.warn('Emergency auth failed — invalid code', { email, requestId });
      return NextResponse.json(
        {
          error: 'Authentication Failed',
          message: 'Invalid email or emergency code',
          errorId: requestId,
        },
        { status: 401 }
      );
    }

    // Mark code as used immediately
    const { error: updateError } = await db
      .from('emergency_codes')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', matchedCodeId);

    if (updateError) {
      logger.error('Failed to invalidate emergency code', {
        codeId: matchedCodeId,
        error: updateError.message,
      });
    }

    // Generate temporary session token
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Count remaining codes
    const remainingCodes = emergencyCodes.length - 1;

    // Log to audit trail
    await db.from('audit_events').insert({
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'emergency_auth_success',
      event_data: {
        requestId,
        remainingCodes,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
      },
    });

    logger.info('Emergency auth successful', {
      userId: user.id,
      tenantId: user.tenant_id,
      remainingCodes,
      requestId,
    });

    return NextResponse.json(
      {
        status: 'authenticated',
        sessionToken,
        expiresAt: expiresAt.toISOString(),
        expiresIn: 3600,
        scope: ['read_assessments', 'read_plans', 'read_documents'],
        remainingCodes,
        message:
          remainingCodes <= 2
            ? `Emergency authentication successful. WARNING: Only ${remainingCodes} emergency code(s) remaining. Contact your admin to regenerate.`
            : 'Emergency authentication successful. Token expires in 1 hour.',
      },
      {
        status: 200,
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
          'X-RateLimit-Remaining': String(rateLimit.remaining - 1),
        },
      }
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Invalid JSON', errorId: requestId },
        { status: 400 }
      );
    }

    logger.error('Emergency auth error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
