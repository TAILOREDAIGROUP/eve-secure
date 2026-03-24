import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


/**
 * GET /api/v1/documents/[docId]
 * Return document metadata + pre-signed download URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } }
) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    const { docId } = params;

    const { data: doc, error: docError } = await db
      .from('generated_documents')
      .select('*')
      .eq('id', docId)
      .eq('tenant_id', tenantId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Document not found', errorId: requestId },
        { status: 404 }
      );
    }

    // Generate pre-signed URL placeholder (in production: use S3 getSignedUrl)
    const presignedUrl = `https://${process.env.AWS_S3_BUCKET ?? 'eve-secure-docs'}.s3.amazonaws.com/${doc.s3_key}?X-Amz-Expires=3600`;

    logger.info('Document accessed', { requestId, docId, tenantId: tenantId });

    return NextResponse.json({
      id: doc.id,
      sessionId: doc.session_id,
      docType: doc.doc_type,
      fileName: doc.file_name,
      s3Key: doc.s3_key,
      downloadUrl: presignedUrl,
      createdAt: doc.created_at,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Document GET error', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
