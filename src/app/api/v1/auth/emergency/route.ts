import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/v1/auth/emergency
 * Emergency authentication via phone code (no Clerk required)
 * Public endpoint - used when Clerk is unavailable
 * Rate limit: 3 per 15 minutes per phone number
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, phoneNumber, code } = body;

    // Validate action
    if (!['request', 'verify'].includes(action)) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'action must be "request" or "verify"',
          errorId,
        },
        { status: 400 }
      );
    }

    if (action === 'request') {
      // Request verification code
      if (!phoneNumber || !/^\+?1?\d{10}$/.test(phoneNumber)) {
        const errorId = uuidv4();
        return NextResponse.json(
          {
            error: 'Validation Error',
            message: 'Valid phoneNumber is required',
            errorId,
          },
          { status: 400 }
        );
      }

      // TODO: In production
      // - Check rate limit: 3 requests per 15 minutes per phone
      // - Verify phone number is associated with a tenant
      // - Generate 6-digit code
      // - Send via SMS (Twilio or similar)
      // - Store code in cache with 15-minute TTL
      // - Log request for audit trail

      return NextResponse.json(
        {
          status: 'code_sent',
          message: 'Verification code sent to phone',
          expiresIn: 900, // 15 minutes
        },
        { status: 200 }
      );
    }

    // Verify code
    if (action === 'verify') {
      if (!phoneNumber || !code) {
        const errorId = uuidv4();
        return NextResponse.json(
          {
            error: 'Validation Error',
            message: 'phoneNumber and code are required',
            errorId,
          },
          { status: 400 }
        );
      }

      // TODO: In production
      // - Check rate limit: 5 failed attempts per 15 minutes = lockout
      // - Verify code from cache
      // - Check code hasn't expired
      // - Find user associated with phone number
      // - Create emergency session (limited duration, limited scope)
      // - Delete code from cache
      // - Log verification for audit trail
      // - Return temporary session token

      const isValid = code === '123456'; // Placeholder validation

      if (!isValid) {
        const errorId = uuidv4();
        return NextResponse.json(
          {
            error: 'Authentication Error',
            message: 'Invalid or expired code',
            errorId,
          },
          { status: 401 }
        );
      }

      const sessionToken = uuidv4();
      return NextResponse.json(
        {
          status: 'authenticated',
          sessionToken,
          expiresIn: 3600, // 1 hour emergency access
          scope: ['read_assessments', 'read_plans', 'read_documents'],
          message: 'Emergency authentication successful. Token expires in 1 hour.',
        },
        { status: 200 }
      );
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid JSON',
          errorId,
        },
        { status: 400 }
      );
    }

    const errorId = uuidv4();
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        errorId,
      },
      { status: 500 }
    );
  }
}
