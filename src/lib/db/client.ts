import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Create a Supabase client instance
 * Note: Service role key should only be used in backend contexts (API routes, server components)
 * Regular clients should use anon key with RLS enforcing tenant isolation
 */
export function createSupabaseClient(isServiceRole: boolean = false): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = isServiceRole
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: !isServiceRole,
      autoRefreshToken: !isServiceRole,
    },
  });
}

/**
 * Set the tenant context for RLS policies
 * This must be called before executing queries to ensure tenant isolation
 * @param client - Supabase client instance
 * @param tenantId - UUID of the tenant
 * @param userId - UUID of the current user (optional)
 */
export async function setTenantContext(
  client: SupabaseClient<Database>,
  tenantId: string,
  userId?: string
): Promise<void> {
  // Set tenant context
  const { error: tenantError } = await client.rpc('set_config', {
    p_setting: 'app.current_tenant_id',
    p_value: tenantId,
  });

  if (tenantError) {
    throw new Error(`Failed to set tenant context: ${tenantError.message}`);
  }

  // Set user context if provided
  if (userId) {
    const { error: userError } = await client.rpc('set_config', {
      p_setting: 'app.current_user_id',
      p_value: userId,
    });

    if (userError) {
      throw new Error(`Failed to set user context: ${userError.message}`);
    }
  }
}

/**
 * Execute a query with tenant context automatically set
 * This is a wrapper that handles tenant isolation automatically
 * @param client - Supabase client instance
 * @param tenantId - UUID of the tenant
 * @param queryFn - Async function that performs the query
 * @param userId - UUID of the current user (optional)
 */
export async function withTenantContext<T>(
  client: SupabaseClient<Database>,
  tenantId: string,
  queryFn: (client: SupabaseClient<Database>) => Promise<T>,
  userId?: string
): Promise<T> {
  try {
    await setTenantContext(client, tenantId, userId);
    return await queryFn(client);
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Database query helper for common tenant-scoped operations
 */
export class TenantQueries {
  constructor(
    private client: SupabaseClient<Database>,
    private tenantId: string,
    private userId?: string
  ) {}

  /**
   * Execute a query with tenant context
   */
  private async execute<T>(
    queryFn: (client: SupabaseClient<Database>) => Promise<T>
  ): Promise<T> {
    return withTenantContext(this.client, this.tenantId, queryFn, this.userId);
  }

  /**
   * Get all users for the tenant
   */
  async getUsers() {
    return this.execute((client) =>
      client.from('users').select('*').eq('tenant_id', this.tenantId)
    );
  }

  /**
   * Get a specific user
   */
  async getUser(userId: string) {
    return this.execute((client) =>
      client
        .from('users')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('id', userId)
        .single()
    );
  }

  /**
   * Get assessment sessions for the tenant
   */
  async getAssessmentSessions(status?: string) {
    let query = this.client
      .from('assessment_sessions')
      .select('*')
      .eq('tenant_id', this.tenantId);

    if (status) {
      query = query.eq('status', status);
    }

    return this.execute(() => query);
  }

  /**
   * Get a specific assessment session
   */
  async getAssessmentSession(sessionId: string) {
    return this.execute((client) =>
      client
        .from('assessment_sessions')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('id', sessionId)
        .single()
    );
  }

  /**
   * Get responses for an assessment session
   */
  async getAssessmentResponses(sessionId: string) {
    return this.execute((client) =>
      client
        .from('assessment_responses')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tenant_id', this.tenantId)
    );
  }

  /**
   * Get action plan for a session
   */
  async getActionPlan(sessionId: string) {
    return this.execute((client) =>
      client
        .from('action_plans')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tenant_id', this.tenantId)
        .single()
    );
  }

  /**
   * Get generated documents for a session
   */
  async getGeneratedDocuments(sessionId: string) {
    return this.execute((client) =>
      client
        .from('generated_documents')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tenant_id', this.tenantId)
    );
  }

  /**
   * Get organization profile
   */
  async getOrgProfile() {
    return this.execute((client) =>
      client
        .from('org_profiles')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .single()
    );
  }

  /**
   * Get audit events for the tenant
   */
  async getAuditEvents(limit: number = 100) {
    return this.execute((client) =>
      client
        .from('audit_events')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .order('created_at', { ascending: false })
        .limit(limit)
    );
  }

  /**
   * Create an audit event
   */
  async createAuditEvent(
    eventType: string,
    eventData: Record<string, unknown>,
    userId?: string,
    ipAddress?: string
  ) {
    return this.execute((client) =>
      client.from('audit_events').insert({
        tenant_id: this.tenantId,
        user_id: userId,
        event_type: eventType,
        event_data: eventData,
        ip_address: ipAddress,
      })
    );
  }

  /**
   * Get conversation state for a session
   */
  async getConversationState(sessionId: string) {
    return this.execute((client) =>
      client
        .from('conversation_state')
        .select('*')
        .eq('session_id', sessionId)
        .eq('tenant_id', this.tenantId)
        .single()
    );
  }

  /**
   * Update conversation state
   */
  async updateConversationState(
    sessionId: string,
    updates: Partial<{
      context_summary: string;
      current_section_qa: Record<string, unknown>;
      retrieved_knowledge_ids: string[];
      token_count: number;
    }>
  ) {
    return this.execute((client) =>
      client
        .from('conversation_state')
        .update(updates)
        .eq('session_id', sessionId)
        .eq('tenant_id', this.tenantId)
    );
  }

  /**
   * Get notification preferences for a user
   */
  async getNotificationPreferences(userId: string) {
    return this.execute((client) =>
      client
        .from('notification_preferences')
        .select('*')
        .eq('tenant_id', this.tenantId)
        .eq('user_id', userId)
        .single()
    );
  }

  /**
   * Search knowledge documents by category
   */
  async searchKnowledgeDocuments(category: string, subcategory?: string) {
    let query = this.client
      .from('knowledge_documents')
      .select('*')
      .eq('category', category);

    if (subcategory) {
      query = query.eq('subcategory', subcategory);
    }

    return this.execute(() => query);
  }

  /**
   * Vector similarity search for knowledge documents
   * Note: This requires pgvector and custom RPC function
   */
  async similaritySearchKnowledge(embedding: number[], limit: number = 5) {
    return this.execute((client) =>
      client.rpc('search_knowledge_documents', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
      })
    );
  }
}

/**
 * Create a TenantQueries instance for a specific tenant
 */
export function getTenantQueries(
  client: SupabaseClient<Database>,
  tenantId: string,
  userId?: string
): TenantQueries {
  return new TenantQueries(client, tenantId, userId);
}

/**
 * Get the current user from Clerk auth
 * This is a placeholder - actual implementation depends on your Clerk setup
 */
export async function getCurrentClerkUser() {
  // Implementation depends on your Clerk integration
  // For Next.js with middleware, this might come from headers
  return null;
}
