import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * POST /api/v1/insurance/upload
 * Upload insurance questionnaire PDF.
 * Validates file type and size, stores metadata. Does NOT process file content.
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const session = await auth();
    if (!session.userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required', errorId: requestId },
        { status: 401 }
      );
    }

    const db = getSupabaseAdmin();

    // Resolve tenant
    const { data: user, error: userError } = await db
      .from('users')
      .select('id, tenant_id, role')
      .eq('clerk_id', session.userId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for clerk_id', { requestId, clerkId: session.userId });
      return NextResponse.json(
        { error: 'Forbidden', message: 'User record not found', errorId: requestId },
        { status: 403 }
      );
    }

    // Validate content type
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Content-Type must be multipart/form-data', errorId: requestId },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'file field is required', errorId: requestId },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Validation Error', message: 'File must be a PDF (application/pdf)', errorId: requestId },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'File size exceeds 25MB limit', errorId: requestId },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'File is empty', errorId: requestId },
        { status: 400 }
      );
    }

    // Magic byte validation — PDF must start with %PDF
    const arrayBuffer = await file.arrayBuffer();
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 4));
    const isPdf = PDF_MAGIC_BYTES.every((byte, i) => firstBytes[i] === byte);

    if (!isPdf) {
      logger.warn('File failed magic byte validation', {
        requestId,
        fileName: file.name,
        firstBytes: Array.from(firstBytes).map((b) => b.toString(16)).join(' '),
      });
      return NextResponse.json(
        { error: 'Validation Error', message: 'File does not appear to be a valid PDF', errorId: requestId },
        { status: 400 }
      );
    }

    // Store metadata in generated_documents
    const docId = uuidv4();
    const fileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_'); // sanitize filename
    const s3Key = `uploads/${user.tenant_id}/insurance/${docId}/${fileName}`;

    const { data: doc, error: docError } = await db
      .from('generated_documents')
      .insert({
        id: docId,
        tenant_id: user.tenant_id,
        session_id: null,
        doc_type: 'insurance_questionnaire',
        status: 'uploaded',
        file_name: fileName,
        s3_key: s3Key,
      } as any)
      .select()
      .single();

    if (docError) {
      logger.error('Failed to store insurance upload metadata', { requestId, error: docError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to store upload metadata', errorId: requestId },
        { status: 500 }
      );
    }

    // Audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'insurance.questionnaire_uploaded',
      event_data: {
        docId,
        fileName,
        fileSize: file.size,
      } as any,
    } as any);

    logger.info('Insurance questionnaire uploaded', {
      requestId,
      docId,
      tenantId: user.tenant_id,
      fileName,
      fileSize: file.size,
    });

    return NextResponse.json(
      {
        id: docId,
        fileName,
        fileSize: file.size,
        docType: 'insurance_questionnaire',
        status: 'uploaded',
        message: 'Insurance questionnaire uploaded successfully. Processing has not yet started.',
        createdAt: doc?.created_at ?? new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Unhandled error in POST /insurance/upload', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
