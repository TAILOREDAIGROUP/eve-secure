import { logger } from "@/lib/logger";
import { z } from "zod";

/**
 * Voyage AI embedding response
 */
interface VoyageEmbeddingResponse {
  data: Array<{
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

/**
 * Batch embedding request/response
 */
interface BatchEmbeddingResult {
  texts: string[];
  embeddings: number[][];
  model: string;
  totalTokens: number;
}

/**
 * Configuration validation
 */
const ConfigSchema = z.object({
  apiKey: z.string().min(1, "VOYAGE_API_KEY required"),
  model: z.string().default("voyage-3"),
  dimension: z.number().default(1024),
  baseUrl: z.string().default("https://api.voyageai.com/v1"),
  timeout: z.number().default(30000),
  maxBatchSize: z.number().default(128),
});

type Config = z.infer<typeof ConfigSchema>;

/**
 * Voyage AI embedding client
 * Provides single and batch embedding capabilities for RAG pipeline
 */
class VoyageEmbeddingsClient {
  private config: Config;

  constructor() {
    this.config = ConfigSchema.parse({
      apiKey: process.env.VOYAGE_API_KEY,
      model: process.env.VOYAGE_MODEL || "voyage-3",
      dimension: parseInt(process.env.VOYAGE_DIMENSION || "1024"),
      baseUrl: process.env.VOYAGE_BASE_URL,
      maxBatchSize: parseInt(process.env.VOYAGE_BATCH_SIZE || "128"),
    });

    logger.info("Voyage embeddings client initialized", {
      model: this.config.model,
      dimension: this.config.dimension,
    });
  }

  /**
   * Embed a single query string
   * Used during RAG retrieval for semantic search
   */
  async embedQuery(query: string): Promise<number[]> {
    if (!query || query.trim().length === 0) {
      throw new Error("Query cannot be empty");
    }

    if (query.length > 32000) {
      throw new Error("Query exceeds maximum length of 32000 characters");
    }

    try {
      logger.debug("Embedding query", { queryLength: query.length });

      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          input: [query],
          model: this.config.model,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Voyage API error: ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = (await response.json()) as VoyageEmbeddingResponse;

      if (!data.data || !data.data[0] || !data.data[0].embedding) {
        throw new Error("Invalid response format from Voyage API");
      }

      return data.data[0].embedding;
    } catch (error) {
      logger.error("Failed to embed query", {
        error: error instanceof Error ? error.message : String(error),
        queryLength: query.length,
      });
      throw error;
    }
  }

  /**
   * Embed multiple texts in batch
   * Used during knowledge ingestion for creating vector store
   */
  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!texts || texts.length === 0) {
      throw new Error("Texts array cannot be empty");
    }

    if (texts.length > this.config.maxBatchSize) {
      throw new Error(
        `Batch size exceeds maximum of ${this.config.maxBatchSize}`
      );
    }

    // Validate individual texts
    const validatedTexts = texts.map((text, idx) => {
      if (!text || typeof text !== "string") {
        throw new Error(`Text at index ${idx} is not a valid string`);
      }
      if (text.length > 32000) {
        throw new Error(
          `Text at index ${idx} exceeds maximum length of 32000 characters`
        );
      }
      return text.trim();
    });

    try {
      logger.info("Batch embedding texts", {
        count: validatedTexts.length,
        totalChars: validatedTexts.reduce((sum, t) => sum + t.length, 0),
      });

      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          input: validatedTexts,
          model: this.config.model,
        }),
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Voyage API error: ${response.statusText} - ${JSON.stringify(errorData)}`
        );
      }

      const data = (await response.json()) as VoyageEmbeddingResponse;

      if (!data.data || data.data.length !== validatedTexts.length) {
        throw new Error(
          `Unexpected number of embeddings returned: expected ${validatedTexts.length}, got ${data.data?.length || 0}`
        );
      }

      // Extract embeddings in order
      const embeddings = data.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      logger.info("Batch embedding completed", {
        count: embeddings.length,
        dimension: embeddings[0]?.length,
        totalTokens: data.usage.total_tokens,
      });

      return {
        texts: validatedTexts,
        embeddings,
        model: data.model,
        totalTokens: data.usage.total_tokens,
      };
    } catch (error) {
      logger.error("Failed to batch embed texts", {
        error: error instanceof Error ? error.message : String(error),
        count: validatedTexts.length,
      });
      throw error;
    }
  }

  /**
   * Embed multiple texts with automatic batching
   * Splits large requests into optimal batch sizes
   */
  async embedBatchWithAutoBatching(texts: string[]): Promise<BatchEmbeddingResult> {
    if (!texts || texts.length === 0) {
      throw new Error("Texts array cannot be empty");
    }

    if (texts.length <= this.config.maxBatchSize) {
      return this.embedBatch(texts);
    }

    logger.info("Auto-batching large embedding request", {
      totalTexts: texts.length,
      batchSize: this.config.maxBatchSize,
    });

    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += this.config.maxBatchSize) {
      const batch = texts.slice(
        i,
        Math.min(i + this.config.maxBatchSize, texts.length)
      );
      const result = await this.embedBatch(batch);

      allEmbeddings.push(...result.embeddings);
      totalTokens += result.totalTokens;

      // Add delay between batches to avoid rate limiting
      if (i + this.config.maxBatchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return {
      texts,
      embeddings: allEmbeddings,
      model: this.config.model,
      totalTokens,
    };
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    return this.config.dimension;
  }

  /**
   * Get model name
   */
  getModel(): string {
    return this.config.model;
  }
}

/**
 * Singleton instance
 */
let client: VoyageEmbeddingsClient | null = null;

/**
 * Get or create the embeddings client
 */
function getClient(): VoyageEmbeddingsClient {
  if (!client) {
    client = new VoyageEmbeddingsClient();
  }
  return client;
}

/**
 * Embed a single query
 * @param query - The text to embed
 * @returns Vector embedding
 */
export async function embedQuery(query: string): Promise<number[]> {
  return getClient().embedQuery(query);
}

/**
 * Embed multiple texts
 * @param texts - Array of texts to embed
 * @returns Batch embedding result with all embeddings and metadata
 */
export async function embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
  return getClient().embedBatch(texts);
}

/**
 * Embed multiple texts with automatic batching for large requests
 * @param texts - Array of texts to embed
 * @returns Batch embedding result with all embeddings and metadata
 */
export async function embedBatchWithAutoBatching(
  texts: string[]
): Promise<BatchEmbeddingResult> {
  return getClient().embedBatchWithAutoBatching(texts);
}

/**
 * Get the embedding dimension
 */
export function getEmbeddingDimension(): number {
  return getClient().getDimension();
}

/**
 * Get the embedding model name
 */
export function getEmbeddingModel(): string {
  return getClient().getModel();
}
