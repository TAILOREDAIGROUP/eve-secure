import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import {
  DocumentGenerationSchema,
  DocumentSchema,
  ListResponseSchema,
} from '@/lib/validation/schemas';

/**
 * GET /api/v1/documents
 * List generated documents for a session
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

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '10', 10)));

    if (!sessionId) {
      const errorId = uuidv4();
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'sessionId query parameter is required',
          errorId,
        },
        { status: 400 }
      );
    }

    // TODO: In production
    // - Verify user has access to session
    // - Query documents from database
    // - Filter by sessionId
    const documents = [
      {
        docId: uuidv4(),
        sessionId,
        docType: 'assessment_report',
        status: 'ready' as const,
        createdAt: new Date().toISOString(),
        downloadUrl: 'https://example.com/docs/report.pdf',
        size: 2500000,
      },
    ];

    const response = {
      items: documents,
      total: documents.length,
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
 * POST /api/v1/documents
 * Generate document (cost_of_inaction, assessment_report, ir_package, tabletop, insurance_questionnaire)
 * Rate limit: 10 per minute
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

    // Validate request
    const validatedRequest = DocumentGenerationSchema.parse(body);

    // TODO: In production
    // - Verify session exists and user has access
    // - Queue document generation job:
    //   * Fetch assessment data and plan
    //   * Render template based on docType
    //   * Generate PDF
    //   * Store in cloud storage
    // - Return document record with status 'generating'

    const docId = uuidv4();
    const doc = {
      docId,
      sessionId: validatedRequest.sessionId,
      docType: validatedRequest.docType,
      status: 'generating' as const,
      createdAt: new Date().toISOString(),
    };

    const validated = DocumentSchema.parse(doc);
    return NextResponse.json(validated, { status: 202 });
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
