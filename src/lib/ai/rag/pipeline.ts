import { embedQuery } from "./embeddings";
import { getSupabaseAdmin } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { getSectorPrompt } from "@/lib/ai/prompts/sector-prompts";
import { validateRecommendation } from "@/lib/ai/guardrails/recommendation-validator";
import type { OrgProfile } from "@/types";

const EMBEDDING_TIMEOUT_MS = 20_000;
const VECTOR_SEARCH_TIMEOUT_MS = 15_000;

/**
 * Retrieved knowledge item from vector store
 */
interface KnowledgeItem {
  id: string;
  type: "compliance" | "control" | "threat" | "remediation" | "framework";
  content: string;
  source: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

/**
 * Hybrid search result combining vector and SQL results
 */
interface HybridSearchResult {
  items: KnowledgeItem[];
  vectorResults: number;
  sqlResults: number;
  executionTime: number;
}

/**
 * Response generation input
 */
interface GenerateResponseInput {
  query: string;
  context: KnowledgeItem[];
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
}

/**
 * Citation from retrieved context
 */
interface Citation {
  source: string;
  content: string;
  similarity: number;
}

/**
 * Regulation pattern matching for hybrid search
 */
const REGULATION_PATTERNS = [
  /§\s*\d+[\.\-]\d+/g, // § 123.45
  /CFR\s*§?\s*\d+[\.\-]\d+/gi, // CFR § 123.45
  /\b(HIPAA|GDPR|SOC\s*2|ISO\s*27001|PCI-DSS|CIS|NIST|FedRAMP)\b/gi,
  /\b(Rule|Standard|Control)\s*\d+/gi, // Rule 123, Control AB-C-1
];

/**
 * Validate retrieved context size
 */
const ContextSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["compliance", "control", "threat", "remediation", "framework"]),
      content: z.string(),
      source: z.string(),
      similarity: z.number().min(0).max(1),
      metadata: z.record(z.unknown()),
    })
  ),
  maxItems: z.number().default(8),
});

type ContextValidation = z.infer<typeof ContextSchema>;

/**
 * Extract regulatory citations from query for hybrid search
 */
function extractRegulatoryCitations(query: string): string[] {
  const citations: Set<string> = new Set();

  for (const pattern of REGULATION_PATTERNS) {
    const matches = query.match(pattern);
    if (matches) {
      matches.forEach((match) => citations.add(match.toUpperCase().trim()));
    }
  }

  return Array.from(citations);
}

/**
 * Retrieve context from vector store using semantic search
 * Returns top-k most similar items
 */
export async function retrieveContext(
  query: string,
  topK: number = 8,
  minSimilarity: number = 0.5
): Promise<KnowledgeItem[]> {
  try {
    logger.debug("Retrieving context from vector store", {
      queryLength: query.length,
      topK,
      minSimilarity,
    });

    // Generate embedding for query with timeout
    const queryEmbedding = await Promise.race([
      embedQuery(query),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Embedding generation timed out")), EMBEDDING_TIMEOUT_MS)
      ),
    ]);

    // Search pgvector with cosine similarity (with timeout)
    const supabase = getSupabaseAdmin();
    const { data: results, error } = await Promise.race([
      supabase.rpc('search_knowledge_documents', {
        query_embedding: JSON.stringify(queryEmbedding),
        match_threshold: minSimilarity,
        match_count: topK,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Vector search timed out")), VECTOR_SEARCH_TIMEOUT_MS)
      ),
    ]);

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }

    const items: KnowledgeItem[] = (results || []).map((r: any) => ({
      id: r.id,
      type: r.type as KnowledgeItem["type"],
      content: r.content,
      source: r.source,
      similarity: r.similarity,
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));

    logger.debug("Vector search completed", {
      resultsCount: items.length,
      avgSimilarity: items.length > 0
        ? (items.reduce((sum, i) => sum + i.similarity, 0) / items.length).toFixed(3)
        : 0,
    });

    return items;
  } catch (error) {
    logger.error("Failed to retrieve context from vector store", {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
    });
    throw error;
  }
}

/**
 * Fallback keyword search using SQL ILIKE
 * Used when vector search fails (embedding error, timeout, etc.)
 */
async function keywordFallbackSearch(
  query: string,
  topK: number = 8
): Promise<KnowledgeItem[]> {
  try {
    logger.info("Falling back to SQL ILIKE keyword search", { queryLength: query.length });

    const supabase = getSupabaseAdmin();

    // Extract meaningful keywords (3+ chars, skip common words)
    const stopWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one", "our", "out", "has", "have", "with", "that", "this", "from", "what", "how", "when", "where", "which", "who", "will", "about", "into", "does"]);
    const keywords = query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    if (keywords.length === 0) {
      return [];
    }

    const orConditions = keywords
      .slice(0, 5)
      .map((kw) => `content.ilike.%${kw}%`)
      .join(",");

    const { data: results, error } = await supabase
      .from("knowledge_documents")
      .select("id, type, content, source, metadata")
      .or(orConditions)
      .limit(topK);

    if (error) {
      logger.error("Keyword fallback search failed", { error: error.message });
      return [];
    }

    const items: KnowledgeItem[] = (results || []).map((r: any) => ({
      id: r.id,
      type: (r.type as KnowledgeItem["type"]) || "compliance",
      content: r.content,
      source: r.source || "keyword-search",
      similarity: 0.5,
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));

    logger.info("Keyword fallback search completed", { resultsCount: items.length });
    return items;
  } catch (error) {
    logger.error("Keyword fallback search error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Perform regulatory compliance search using exact SQL matching
 * Triggered when query contains regulatory citations
 */
async function regulatoryComplianceSearch(
  citations: string[]
): Promise<KnowledgeItem[]> {
  if (citations.length === 0) {
    return [];
  }

  try {
    logger.debug("Searching compliance matrix by regulation", {
      citationCount: citations.length,
      citations,
    });

    // Parameterized citation lookup — sanitize user-provided values
    const supabase = getSupabaseAdmin();
    const sanitizedCitations = citations.map((c) =>
      c.replace(/[^a-zA-Z0-9§.\-\s/()]/g, '').trim()
    ).filter((c) => c.length > 0);

    if (sanitizedCitations.length === 0) {
      return [];
    }

    const { data: results, error } = await supabase
      .from('compliance_matrix')
      .select('id, type, content, source, metadata')
      .or(
        sanitizedCitations
          .map((_, i) => `regulation_id.eq.${sanitizedCitations[i]}`)
          .concat(
            sanitizedCitations.map((_, i) => `regulation_citation.eq.${sanitizedCitations[i]}`)
          )
          .join(',')
      );

    if (error) {
      throw new Error(`Compliance search failed: ${error.message}`);
    }

    const items: KnowledgeItem[] = (results || []).map((r: any) => ({
      id: r.id,
      type: r.type as KnowledgeItem["type"],
      content: r.content,
      source: r.source,
      similarity: 1.0, // Exact match gets perfect score
      metadata: (r.metadata as Record<string, unknown>) || {},
    }));

    logger.debug("Compliance matrix search completed", {
      resultsCount: items.length,
    });

    return items;
  } catch (error) {
    logger.error("Failed to search compliance matrix", {
      error: error instanceof Error ? error.message : String(error),
      citationCount: citations.length,
    });
    // Don't throw - hybrid search should continue even if compliance search fails
    return [];
  }
}

/**
 * Perform hybrid search combining vector semantic search and regulatory exact matching
 * Merges results, deduplicates, and ranks by relevance
 */
export async function hybridSearch(
  query: string,
  topK: number = 8
): Promise<HybridSearchResult> {
  const startTime = Date.now();

  try {
    logger.info("Starting hybrid search", { queryLength: query.length, topK });

    // Check for regulatory citations
    const regulatoryCitations = extractRegulatoryCitations(query);
    logger.debug("Extracted regulatory citations", {
      count: regulatoryCitations.length,
      citations: regulatoryCitations,
    });

    // Run both searches in parallel; fall back to keyword search if vector fails
    let vectorResults: KnowledgeItem[];
    try {
      vectorResults = await retrieveContext(query, topK);
    } catch (vectorError) {
      logger.warn("Vector search failed, falling back to keyword search", {
        error: vectorError instanceof Error ? vectorError.message : String(vectorError),
      });
      vectorResults = await keywordFallbackSearch(query, topK);
    }

    const complianceResults = regulatoryCitations.length > 0
      ? await regulatoryComplianceSearch(regulatoryCitations)
      : [];

    // Merge and deduplicate results
    const itemMap = new Map<string, KnowledgeItem>();

    // Add vector results (prioritized by similarity)
    for (const item of vectorResults) {
      if (!itemMap.has(item.id)) {
        itemMap.set(item.id, item);
      }
    }

    // Add compliance results (boost exact matches to top)
    for (const item of complianceResults) {
      if (itemMap.has(item.id)) {
        // Update similarity if this is a better match
        const existing = itemMap.get(item.id)!;
        if (item.similarity > existing.similarity) {
          itemMap.set(item.id, item);
        }
      } else {
        itemMap.set(item.id, item);
      }
    }

    // Sort by similarity and limit to topK
    const mergedItems = Array.from(itemMap.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);

    const executionTime = Date.now() - startTime;

    logger.info("Hybrid search completed", {
      vectorResults: vectorResults.length,
      complianceResults: complianceResults.length,
      mergedResults: mergedItems.length,
      executionTime,
    });

    return {
      items: mergedItems,
      vectorResults: vectorResults.length,
      sqlResults: complianceResults.length,
      executionTime,
    };
  } catch (error) {
    logger.error("Hybrid search failed completely, returning empty results", {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
    });

    // Never throw — return empty result set for graceful degradation
    return {
      items: [],
      vectorResults: 0,
      sqlResults: 0,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Format retrieved context into citations for response
 * Extracts key information for attribution
 */
function formatCitations(items: KnowledgeItem[]): Citation[] {
  return items.map((item) => ({
    source: item.source,
    content: item.content.substring(0, 200), // First 200 chars as preview
    similarity: parseFloat(item.similarity.toFixed(2)),
  }));
}

/**
 * Build RAG context for model prompt
 * Combines retrieved knowledge with query for LLM processing
 */
function buildRAGContext(
  query: string,
  context: KnowledgeItem[]
): { contextBlock: string; citations: Citation[] } {
  if (context.length === 0) {
    return {
      contextBlock: "No relevant context retrieved from knowledge base.",
      citations: [],
    };
  }

  const citations = formatCitations(context);

  const contextBlock = `## Retrieved Knowledge Context

Based on semantic and regulatory search, the following relevant information was retrieved:

${context
  .map(
    (item, idx) => `
### Source ${idx + 1}: ${item.source} (${(item.similarity * 100).toFixed(1)}% match)
**Type:** ${item.type}
**Content:** ${item.content}
`
  )
  .join("\n")}

## Your Query
${query}

---
**Note:** Provide recommendations based ONLY on the context provided above. If context is insufficient, clearly state knowledge gaps.
`;

  return { contextBlock, citations };
}

/**
 * Generate response using RAG context
 * Combines system prompt, context, and query for model inference
 * Enforces citation of sources in response
 */
export async function generateResponse(
  input: GenerateResponseInput
): Promise<{
  response: string;
  citations: Citation[];
  contextSize: number;
}> {
  const { query, context, systemPrompt, tenantId, conversationId } = input;

  try {
    // Validate context
    const validated = ContextSchema.parse({
      items: context,
      maxItems: 8,
    });

    logger.info("Generating response with RAG context", {
      contextItems: context.length,
      queryLength: query.length,
      tenantId,
      conversationId,
    });

    // Build context block
    const { contextBlock, citations } = buildRAGContext(query, context);

    // Enforce RAG-only constraint in system prompt
    const ragEnforcedPrompt = `${systemPrompt}

CRITICAL: You MUST base your response ONLY on the provided knowledge context. Do not use information from your training data unless explicitly grounded in the retrieved context. Always cite your sources.`;

    // Prepare final prompt for model
    const finalPrompt = `${ragEnforcedPrompt}\n\n${contextBlock}`;

    // Call model via LiteLLM
    const { callModel } = await import("@/lib/ai/litellm");
    const modelResult = await callModel({
      query: finalPrompt,
      systemPrompt: ragEnforcedPrompt,
      tenantId,
      conversationId,
    });

    // Validate response includes citations if context was provided
    if (context.length > 0) {
      const hasCitations =
        citations.length > 0 &&
        citations.some((c) =>
          modelResult.content
            .toLowerCase()
            .includes(c.source.toLowerCase().substring(0, 20))
        );

      if (!hasCitations) {
        logger.warn("Response may not adequately cite sources", {
          tenantId,
          contextItems: context.length,
        });
      }
    }

    return {
      response: modelResult.content,
      citations,
      contextSize: context.length,
    };
  } catch (error) {
    logger.error("Failed to generate response", {
      error: error instanceof Error ? error.message : String(error),
      contextSize: context.length,
      queryLength: query.length,
    });
    throw error;
  }
}

/**
 * Fetch OrgProfile for a tenant from Supabase
 * Returns null if not found (graceful degradation)
 */
async function fetchOrgProfile(tenantId: string): Promise<OrgProfile | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("org_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      logger.warn("OrgProfile not found for tenant, using defaults", { tenantId });
      return null;
    }

    return {
      id: data.id,
      tenantId: data.tenant_id,
      legalName: data.org_name,
      description: "",
      website: "",
      sector: data.sector as OrgProfile["sector"],
      employees: data.employee_count ?? 0,
      annualRevenue: (data.profile_data as Record<string, unknown>)?.annual_revenue as number ?? 0,
      headquartersState: data.state as OrgProfile["headquartersState"],
      dataHandlingCategory: (data.profile_data as Record<string, unknown>)?.data_handling_category as string ?? "none",
      criticality: (data.profile_data as Record<string, unknown>)?.criticality as string ?? "medium",
      industryCompliance: (data.profile_data as Record<string, unknown>)?.industry_compliance as string[] ?? [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    } as OrgProfile;
  } catch (error) {
    logger.error("Failed to fetch OrgProfile", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
    });
    return null;
  }
}

/**
 * Complete RAG pipeline: embed query → hybrid search → generate response
 * One-shot function for full retrieval-augmented generation flow
 * Now includes OrgProfile context and recommendation validation
 */
export async function ragPipeline(input: {
  query: string;
  systemPrompt: string;
  tenantId: string;
  conversationId?: string;
  topK?: number;
}): Promise<{
  response: string;
  citations: Citation[];
  searchMetrics: {
    vectorResults: number;
    sqlResults: number;
    executionTime: number;
  };
  validationFlags?: string[];
}> {
  const { query, systemPrompt, tenantId, conversationId, topK = 8 } = input;

  try {
    logger.info("Starting RAG pipeline", {
      queryLength: query.length,
      topK,
      tenantId,
    });

    // Step 1: Fetch OrgProfile and run hybrid search in parallel
    const [searchResult, orgProfile] = await Promise.all([
      hybridSearch(query, topK),
      fetchOrgProfile(tenantId),
    ]);

    // Step 2: Build sector-aware system prompt if OrgProfile available
    let enrichedPrompt = systemPrompt;
    if (orgProfile) {
      const sectorContext = getSectorPrompt(orgProfile.sector, orgProfile);
      enrichedPrompt = `${systemPrompt}\n\n${sectorContext}`;

      logger.info("Enriched prompt with OrgProfile context", {
        tenantId,
        sector: orgProfile.sector,
        employees: orgProfile.employees,
        revenue: orgProfile.annualRevenue,
      });
    }

    // Step 3: Generate response with enriched context
    const responseResult = await generateResponse({
      query,
      context: searchResult.items,
      systemPrompt: enrichedPrompt,
      tenantId,
      conversationId,
    });

    // Step 4: Validate recommendation if OrgProfile available
    let finalResponse = responseResult.response;
    let validationFlags: string[] | undefined;

    if (orgProfile) {
      const validation = validateRecommendation(finalResponse, orgProfile);
      if (!validation.valid) {
        finalResponse = validation.validatedText;
        validationFlags = validation.flags.map((f) => f.type);

        logger.warn("Recommendation validation flags appended", {
          tenantId,
          flags: validationFlags,
        });
      }
    }

    return {
      response: finalResponse,
      citations: responseResult.citations,
      searchMetrics: {
        vectorResults: searchResult.vectorResults,
        sqlResults: searchResult.sqlResults,
        executionTime: searchResult.executionTime,
      },
      validationFlags,
    };
  } catch (error) {
    logger.error("RAG pipeline failed — returning degraded response", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      queryLength: query.length,
    });

    // Never throw — return safe degraded response
    return {
      response: "Our advisory system is temporarily unavailable. Please try again shortly.",
      citations: [],
      searchMetrics: {
        vectorResults: 0,
        sqlResults: 0,
        executionTime: 0,
      },
      validationFlags: ["degraded"],
    };
  }
}
