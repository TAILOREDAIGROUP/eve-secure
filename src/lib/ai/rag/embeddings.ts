import { logger } from "@/lib/logger";
import {
  generateEmbedding,
  generateEmbeddingBatch,
} from "@/lib/ai/embeddings/supabase-embeddings";

/**
 * Supabase Automatic Embeddings (gte-small model)
 *
 * Replaces Voyage AI. Uses Supabase Edge Functions for embedding generation.
 * Supabase can also auto-generate embeddings on INSERT/UPDATE via database
 * triggers — enable in Dashboard → AI → Automatic Embeddings.
 */

/**
 * Batch embedding result (compatible interface for ingestion scripts)
 */
export interface BatchEmbeddingResult {
  texts: string[];
  embeddings: number[][];
  model: string;
  totalTokens: number;
}

/**
 * Embed a single query
 * @param query - The text to embed
 * @returns Vector embedding
 * @throws Error if embedding fails (callers should handle gracefully)
 */
export async function embedQuery(query: string): Promise<number[]> {
  if (!query || query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }

  logger.debug("Embedding query via Supabase", { queryLength: query.length });

  const embedding = await generateEmbedding(query);

  if (!embedding) {
    throw new Error("Supabase embedding generation returned null");
  }

  return embedding;
}

/**
 * Embed multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Batch embedding result with all embeddings and metadata
 */
export async function embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
  if (!texts || texts.length === 0) {
    throw new Error("Texts array cannot be empty");
  }

  logger.info("Batch embedding texts via Supabase", { count: texts.length });

  const results = await generateEmbeddingBatch(texts);

  // Filter out nulls — failed embeddings
  const embeddings: number[][] = [];
  const successTexts: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const emb = results[i];
    if (emb) {
      embeddings.push(emb);
      successTexts.push(texts[i]!);
    } else {
      logger.warn(`Embedding failed for text at index ${i}`);
    }
  }

  logger.info("Batch embedding completed", {
    requested: texts.length,
    succeeded: embeddings.length,
  });

  return {
    texts: successTexts,
    embeddings,
    model: "gte-small",
    totalTokens: 0, // Supabase does not report token usage
  };
}

/**
 * Embed multiple texts with automatic batching for large requests
 * (Supabase handles batching internally; this is a pass-through for API compat)
 */
export async function embedBatchWithAutoBatching(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  return embedBatch(texts);
}

/**
 * Get the embedding dimension (gte-small = 384)
 */
export function getEmbeddingDimension(): number {
  return 384;
}

/**
 * Get the embedding model name
 */
export function getEmbeddingModel(): string {
  return "gte-small";
}
