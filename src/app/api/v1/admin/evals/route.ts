import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/supabase-auth-server';
import { v4 as uuidv4 } from 'uuid';
import { getSupabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';


/**
 * GET /api/v1/admin/evals
 * Eval dashboard data. Super-admin only.
 * Returns template eval metrics (will be replaced by real eval runner later).
 */
export async function GET(request: NextRequest) {
  const requestId = uuidv4();

  try {
    const { user, tenantId } = await requireAuth();

    const db = getSupabaseAdmin();

    // Super-admin only
    if (user.role !== 'super_admin') {
      logger.warn('Non-super_admin attempted to access evals', { requestId, userId: user.id, role: user.role });
      return NextResponse.json(
        { error: 'Forbidden', message: 'Super admin access required', errorId: requestId },
        { status: 403 }
      );
    }

    // Template eval metrics — will be replaced by real eval runner
    const evalMetrics = {
      generatedAt: new Date().toISOString(),
      source: 'template',
      accuracy: {
        overallScore: 0.942,
        assessmentResponseRelevance: 0.96,
        planRecommendationSpecificity: 0.885,
        documentContentAccuracy: 0.913,
        complianceMappingCorrectness: 0.95,
        sampleSize: 1247,
      },
      injectionDetection: {
        overallScore: 0.987,
        promptInjectionBlocked: 0.99,
        indirectInjectionBlocked: 0.98,
        jailbreakAttemptBlocked: 0.99,
        templateInjectionBlocked: 0.985,
        sampleSize: 500,
      },
      harmDetection: {
        overallScore: 0.995,
        harmfulContentBlocked: 0.998,
        biasDetectionRate: 0.985,
        piiLeakageBlocked: 0.999,
        misinformationCaught: 0.975,
        sampleSize: 800,
      },
      isolationTests: {
        overallPassRate: 0.998,
        tenantDataIsolation: 1.0,
        crossSessionLeakage: 1.0,
        roleEscalationBlocked: 1.0,
        apiAuthBypass: 0.995,
        sampleSize: 300,
      },
      summary: {
        totalTestsRun: 2847,
        passRate: 0.978,
        lastRunAt: new Date(Date.now() - 86400000).toISOString(),
        nextScheduledRun: new Date(Date.now() + 86400000).toISOString(),
        trend: 'stable',
      },
    };

    logger.info('Eval dashboard accessed', {
      requestId,
      userId: user.id,
    });

    return NextResponse.json(evalMetrics);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.statusCode === 401 ? 'Unauthorized' : 'Forbidden', message: error.message, errorId: requestId },
        { status: error.statusCode }
      );
    }
    logger.error('Unhandled error in GET /admin/evals', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'An unexpected error occurred', errorId: requestId },
      { status: 500 }
    );
  }
}
