import { getSupabaseAdmin } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Supabase Automatic Embeddings client
 * Uses Supabase's built-in gte-small model via Edge Functions
 *
 * Note: Supabase Automatic Embeddings can also auto-generate embeddings
 * on INSERT/UPDATE via database triggers on the knowledge_documents table.
 * Enable this in Supabase Dashboard → AI → Automatic Embeddings.
 * When enabled, any row inserted/updated in knowledge_documents will
 * automatically have its embedding column populated — no manual call needed.
 */

const EMBEDDING_TIMEOUT_MS = 20_000;

/**
 * Generate embedding for a single text using Supabase Edge Function (gte-small)
 * Returns null on failure instead of throwing — caller must handle gracefully
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  if (!text || text.trim().length === 0) {
    logger.warn("generateEmbedding called with empty text");
    return null;
  }

  try {
    const supabase = getSupabaseAdmin();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    const { data, error } = await supabase.functions.invoke("embed", {
      body: { input: text.trim() },
    });

    clearTimeout(timeoutId);

    if (error) {
      logger.warn("Supabase embedding generation failed", {
        error: error.message,
        textLength: text.length,
      });
      return null;
    }

    if (!data?.embedding || !Array.isArray(data.embedding)) {
      logger.warn("Supabase embedding returned unexpected format", {
        dataKeys: data ? Object.keys(data) : [],
      });
      return null;
    }

    return data.embedding as number[];
  } catch (error) {
    logger.warn("Supabase embedding generation error", {
      error: error instanceof Error ? error.message : String(error),
      textLength: text.length,
    });
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * Returns array of embeddings (null entries for failures)
 */
export async function generateEmbeddingBatch(
  texts: string[]
): Promise<(number[] | null)[]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    texts.map((text) => generateEmbedding(text))
  );

  return results.map((result) =>
    result.status === "fulfilled" ? result.value : null
  );
}
