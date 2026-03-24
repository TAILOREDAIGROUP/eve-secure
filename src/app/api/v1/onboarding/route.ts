import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ZodError } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  OnboardingSchema,
  OnboardingResponseSchema,
  ErrorResponseSchema,
} from '@/lib/validation/schemas';

/**
 * POST /api/v1/onboarding
 * Create tenant and organization profile
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

    // Parse request body
    const body = await request.json();

    // Validate against schema
    const validatedData = OnboardingSchema.parse(body);

    // TODO: In production, store in database
    // - Create tenant record
    // - Create organization profile
    // - Create initial assessment session
    const tenantId = uuidv4();
    const orgId = uuidv4();
    const sessionId = uuidv4();

    const response = {
      tenantId,
      orgId,
      sessionId,
      status: 'created' as const,
    };

    const validated = OnboardingResponseSchema.parse(response);
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
