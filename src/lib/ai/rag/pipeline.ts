import { embedQuery } from "./embeddings";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { z } from "zod";

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

    // Generate embedding for query
    const queryEmbedding = await embedQuery(query);

    // Search pgvector with cosine similarity
    const results = await db.$queryRaw<
      Array<{
        id: string;
        type: string;
        content: string;
        source: string;
        similarity: number;
        metadata: unknown;
      }>
    >`
      SELECT
        id,
        type,
        content,
        source,
        1 - (embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector) as similarity,
        metadata
      FROM knowledge_items
      WHERE 1 - (embedding <=> ${`[${queryEmbedding.join(",")}]`}::vector) > ${minSimilarity}
      ORDER BY similarity DESC
      LIMIT ${topK}
    `;

    const items: KnowledgeItem[] = results.map((r) => ({
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

    // Build SQL IN clause for citations
    const results = await db.$queryRaw<
      Array<{
        id: string;
        type: string;
        content: string;
        source: string;
        metadata: unknown;
      }>
    >`
      SELECT
        id,
        type,
        content,
        source,
        metadata
      FROM compliance_matrix
      WHERE regulation_id IN (${citations.join(",")})
      OR regulation_citation IN (${citations.join(",")})
    `;

    const items: KnowledgeItem[] = results.map((r) => ({
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

    // Run both searches in parallel
    const [vectorResults, complianceResults] = await Promise.all([
      retrieveContext(query, topK),
      regulatoryCitations.length > 0
        ? regulatoryComplianceSearch(regulatoryCitations)
        : Promise.resolve([]),
    ]);

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
    logger.error("Hybrid search failed", {
      error: error instanceof Error ? error.message : String(error),
      queryLength: query.length,
    });
    throw error;
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
    const { callModel } = await import("./litellm");
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
 * Complete RAG pipeline: embed query → hybrid search → generate response
 * One-shot function for full retrieval-augmented generation flow
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
}> {
  const { query, systemPrompt, tenantId, conversationId, topK = 8 } = input;

  try {
    logger.info("Starting RAG pipeline", {
      queryLength: query.length,
      topK,
      tenantId,
    });

    // Step 1: Hybrid search
    const searchResult = await hybridSearch(query, topK);

    // Step 2: Generate response with context
    const responseResult = await generateResponse({
      query,
      context: searchResult.items,
      systemPrompt,
      tenantId,
      conversationId,
    });

    return {
      response: responseResult.response,
      citations: responseResult.citations,
      searchMetrics: {
        vectorResults: searchResult.vectorResults,
        sqlResults: searchResult.sqlResults,
        executionTime: searchResult.executionTime,
      },
    };
  } catch (error) {
    logger.error("RAG pipeline failed", {
      error: error instanceof Error ? error.message : String(error),
      tenantId,
      queryLength: query.length,
    });
    throw error;
  }
}
