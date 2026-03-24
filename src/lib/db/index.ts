/**
 * Database barrel export
 * Central entry point for all database operations
 */
export {
  createSupabaseClient,
  setTenantContext,
  withTenantContext,
  TenantQueries,
  getTenantQueries,
} from './client';

export type { Database } from './types';

/**
 * Pre-configured Supabase clients
 * - supabase: anon client with RLS (for client-side or RLS-enforced queries)
 * - supabaseAdmin: service role client (for admin operations, bypasses RLS)
 */
import { createSupabaseClient } from './client';

let _supabase: ReturnType<typeof createSupabaseClient> | null = null;
let _supabaseAdmin: ReturnType<typeof createSupabaseClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    _supabase = createSupabaseClient(false);
  }
  return _supabase;
}

export function getSupabaseAdmin() {
  if (!_supabaseAdmin) {
    _supabaseAdmin = createSupabaseClient(true);
  }
  return _supabaseAdmin;
}

/**
 * Legacy alias for code that imports { db } from '@/lib/db'
 */
export const db = getSupabaseAdmin;

/**
 * Health check for database connectivity
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const client = getSupabaseAdmin();
    const { error } = await client.from('tenants').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      return { connected: false, latencyMs, error: error.message };
    }

    return { connected: true, latencyMs };
  } catch (err) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
