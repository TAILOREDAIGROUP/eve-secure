import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import {
  AssessmentSessionSchema,
  ListResponseSchema,
  ErrorResponseSchema,
} from '@/lib/validation/schemas';

/**
 * GET /api/v1/assessment
 * List assessment sessions for authenticated user/tenant
 * Rate limit: 30 per minute
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session.userId) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
          errorId,
        },
        { status: 401 }
      );
    }

    // Get pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));

    // TODO: In production, query from database
    // Filter by tenant and user permissions
    const sessions = [
      {
        sessionId: uuidv4(),
        tenantId: uuidv4(),
        createdAt: new Date().toISOString(),
        progress: 45,
        status: 'in_progress' as const,
        currentSection: 'security_posture',
      },
    ];

    const response = {
      items: sessions,
      total: sessions.length,
      page,
      pageSize,
    };

    const validated = ListResponseSchema.parse(response);
    return NextResponse.json(validated);
  } catch (error) {
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

/**
 * POST /api/v1/assessment
 * Start new assessment session
 * Rate limit: 10 per minute per user
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session.userId) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
          errorId,
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'tenantId is required',
          errorId,
        },
        { status: 400 }
      );
    }

    // TODO: In production
    // - Verify user has access to tenant
    // - Create assessment session in database
    // - Initialize with assessment questions
    const sessionId = uuidv4();
    const newSession = {
      sessionId,
      tenantId,
      createdAt: new Date().toISOString(),
      progress: 0,
      status: 'in_progress' as const,
    };

    const validated = AssessmentSessionSchema.parse(newSession);
    return NextResponse.json(validated, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid request data',
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
