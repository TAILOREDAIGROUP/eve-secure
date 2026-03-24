import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/v1/knowledge?q=...&category=...&limit=...&offset=...
 * Public search endpoint for the NIST CSF knowledge base
 */

const SearchParamsSchema = z.object({
  q: z.string().min(1).max(500),
  category: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { searchParams } = request.nextUrl;
    const parsed = SearchParamsSchema.safeParse({
      q: searchParams.get('q') ?? '',
      category: searchParams.get('category') ?? undefined,
      limit: searchParams.get('limit') ?? '10',
      offset: searchParams.get('offset') ?? '0',
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: parsed.error.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
          errorId: requestId,
        },
        { status: 400 }
      );
    }

    const { q, category, limit, offset } = parsed.data;
    const db = getSupabaseAdmin();

    // Detect citation pattern for hybrid search
    const isCitation = /§\d+|CFR|Rule\s+\d/i.test(q);

    // Text-based search (works without embeddings)
    let query = db
      .from('knowledge_documents')
      .select('id, category, subcategory, title, content, metadata, source_reference, version')
      .or(`title.ilike.%${q}%,content.ilike.%${q}%,source_reference.ilike.%${q}%`)
      .order('category', { ascending: true })
      .range(offset, offset + limit - 1);

    if (category) {
      query = query.eq('category', category as any);
    }

    const { data: textResults, error: textError } = await query;

    if (textError) {
      logger.error('Knowledge search failed', { error: textError.message, requestId });
      return NextResponse.json(
        { error: 'Search Error', message: 'Knowledge base search failed', errorId: requestId },
        { status: 500 }
      );
    }

    // If citation detected, also do exact match on source_reference
    let citationResults: typeof textResults = [];
    if (isCitation) {
      const { data: exactResults } = await db
        .from('knowledge_documents')
        .select('id, category, subcategory, title, content, metadata, source_reference, version')
        .ilike('source_reference', `%${q}%`)
        .limit(limit);

      citationResults = exactResults ?? [];
    }

    // Merge and deduplicate
    const seen = new Set<string>();
    const merged = [];

    // Citation matches first (higher priority)
    for (const r of citationResults) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push({ ...r, match_type: 'exact_citation', score: 1.0 });
      }
    }

    // Then text matches
    for (const r of (textResults ?? [])) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        merged.push({ ...r, match_type: isCitation ? 'text_fallback' : 'text', score: 0.7 });
      }
    }

    // Count total
    const { count } = await db
      .from('knowledge_documents')
      .select('id', { count: 'exact', head: true })
      .or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    return NextResponse.json({
      results: merged,
      total: count ?? merged.length,
      query: q,
      category: category ?? null,
      searchType: isCitation ? 'hybrid' : 'text',
    });
  } catch (error) {
    logger.error('Knowledge GET error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/knowledge
 * Admin-only: trigger re-ingestion of knowledge base
 */
export async function POST(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId, supabaseUid } = await requireAuth();

    // Check super_admin role
    const db = getSupabaseAdmin();

    if (user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Super admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    // Get current knowledge base stats
    const { count: docCount } = await db
      .from('knowledge_documents')
      .select('id', { count: 'exact', head: true });

    // Log the re-ingestion request
    await db.from('audit_events').insert({
      user_id: user.id,
      event_type: 'knowledge_reingestion_requested',
      event_data: {
        requestedBy: user.id,
        currentDocCount: docCount,
        requestId,
      },
    });

    logger.info('Knowledge re-ingestion requested', {
      requestedBy: user.id,
      currentDocCount: docCount,
      requestId,
    });

    return NextResponse.json(
      {
        status: 'accepted',
        message: 'Re-ingestion queued. Run `npx ts-node scripts/ingest-knowledge.ts` to execute.',
        currentDocCount: docCount ?? 0,
        requestId,
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Knowledge POST error', {
      error: error instanceof Error ? error.message : 'unknown',
      requestId,
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
