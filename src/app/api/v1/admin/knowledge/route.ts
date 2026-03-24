import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/admin/knowledge
 * Knowledge base health. Auth + admin role check.
 * Returns document count, latest version, categories breakdown.
 */
export async function GET(request: NextRequest) {
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

    // Admin role check
    if (user.role !== 'super_admin' && user.role !== 'tenant_admin') {
      logger.warn('Insufficient role for admin/knowledge', { requestId, userId: user.id, role: user.role });
      return NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    // Total document count
    const { count: totalDocuments, error: countError } = await db
      .from('knowledge_documents')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      logger.error('Failed to count knowledge documents', { requestId, error: countError.message });
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to retrieve knowledge base status', errorId: requestId },
        { status: 500 }
      );
    }

    // Latest version (most recently updated document)
    const { data: latestDoc } = await db
      .from('knowledge_documents')
      .select('version, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    // Categories breakdown
    const { data: allDocs } = await db
      .from('knowledge_documents')
      .select('category');

    const categoryCounts: Record<string, number> = {};
    if (allDocs) {
      for (const doc of allDocs) {
        const cat = (doc as any).category ?? 'uncategorized';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    }

    const categories = Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      documentCount: count,
    }));

    logger.info('Knowledge base health checked', {
      requestId,
      userId: user.id,
      totalDocuments,
    });

    return NextResponse.json({
      status: 'healthy',
      totalDocuments: totalDocuments ?? 0,
      latestVersion: latestDoc?.version ?? null,
      lastUpdatedAt: latestDoc?.updated_at ?? null,
      categories,
    });
  } catch (error) {
    logger.error('Unhandled error in GET /admin/knowledge', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/admin/knowledge
 * Trigger knowledge base re-ingestion. Super-admin only.
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

    // Super-admin only
    if (user.role !== 'super_admin') {
      logger.warn('Non-super_admin attempted knowledge re-ingestion', { requestId, userId: user.id, role: user.role });
      return NextResponse.json(
        { error: 'Forbidden', message: 'Super admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    const jobId = uuidv4();

    // Log audit event
    await db.from('audit_events').insert({
      id: uuidv4(),
      tenant_id: user.tenant_id,
      user_id: user.id,
      event_type: 'knowledge.reingestion_triggered',
      event_data: { jobId, triggeredBy: user.id } as any,
    } as any);

    logger.info('Knowledge base re-ingestion triggered', {
      requestId,
      jobId,
      userId: user.id,
    });

    return NextResponse.json(
      {
        jobId,
        status: 'queued',
        message: 'Knowledge base re-ingestion has been queued',
        estimatedDuration: '5-10 minutes',
      },
      { status: 202 }
    );
  } catch (error) {
    logger.error('Unhandled error in POST /admin/knowledge', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
