import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { PlanSchema } from '@/lib/validation/schemas';

type RouteContext = {
  params: Promise<{ planId: string }>;
};

/**
 * GET /api/v1/plan/[planId]
 * Get plan details
 * Rate limit: 60 per minute
 */
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
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

    const { planId } = await context.params;

    // TODO: In production
    // - Validate planId is valid UUID
    // - Query from database
    // - Verify user has access to this plan
    const plan = {
      planId,
      sessionId: uuidv4(),
      status: 'generated' as const,
      createdAt: new Date().toISOString(),
      recommendations: [
        {
          priority: 'critical' as const,
          title: 'Implement Zero Trust Network Access',
          description: 'Deploy network segmentation and endpoint verification',
          estimatedCost: 50000,
        },
        {
          priority: 'high' as const,
          title: 'Establish Incident Response Procedures',
          description: 'Document and test IR procedures with tabletop exercises',
          estimatedCost: 15000,
        },
        {
          priority: 'medium' as const,
          title: 'Enable Multi-Factor Authentication',
          description: 'Implement MFA across all user accounts',
          estimatedCost: 5000,
        },
      ],
    };

    const validated = PlanSchema.parse(plan);
    return NextResponse.json(validated);
  } catch (error) {
    if (error instanceof ZodError) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'Invalid plan data',
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
