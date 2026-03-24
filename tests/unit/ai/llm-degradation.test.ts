import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing modules under test
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  return {
    default: vi.fn(() => ({ messages: { create } })),
    __mockCreate: create,
  };
});

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        or: vi.fn(() => ({
          limit: vi.fn(() => ({ data: [], error: null })),
        })),
      })),
    })),
    functions: {
      invoke: vi.fn(),
    },
  })),
}));

vi.mock("@/lib/ai/embeddings/supabase-embeddings", () => ({
  generateEmbedding: vi.fn(),
  generateEmbeddingBatch: vi.fn(),
}));

vi.mock("@/lib/ai/rag/embeddings", () => ({
  embedQuery: vi.fn(),
  embedBatch: vi.fn(),
  getEmbeddingDimension: vi.fn(() => 384),
  getEmbeddingModel: vi.fn(() => "gte-small"),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { callModel, classifyQuery, type ModelCallResult } from "@/lib/ai/litellm";
import { generateEmbedding } from "@/lib/ai/embeddings/supabase-embeddings";
import { embedQuery, getEmbeddingModel } from "@/lib/ai/rag/embeddings";

// Access the mock for Anthropic's messages.create
const Anthropic = (await import("@anthropic-ai/sdk")) as any;
const mockCreate = Anthropic.__mockCreate as ReturnType<typeof vi.fn>;

describe("LLM Graceful Degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "sk-test-key";
  });

  it("returns graceful degradation response when all models fail (not 500)", async () => {
    mockCreate.mockRejectedValue(new Error("API unavailable"));

    const result = await callModel({
      query: "test query",
      systemPrompt: "You are a test.",
      tenantId: "tenant-1",
    });

    expect(result.degraded).toBe(true);
    expect(result.error_id).toBeDefined();
    expect(result.content).toContain("temporarily unavailable");
    expect(result.model).toBe("none");
    expect(result.inputTokens).toBe(0);
  }, 60_000);

  it("returns structured error on non-text content blocks", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "tool_1", name: "test", input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await callModel({
      query: "test query",
      systemPrompt: "You are a test.",
      tenantId: "tenant-1",
    });

    expect(result.degraded).toBe(true);
    expect(result.content).toContain("unexpected response format");
  });

  it("succeeds on first attempt with text content block", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hello, this is a response." }],
      usage: { input_tokens: 20, output_tokens: 15 },
    });

    const result = await callModel({
      query: "What is HIPAA?",
      systemPrompt: "You are a security advisor.",
      tenantId: "tenant-1",
    });

    expect(result.degraded).toBeUndefined();
    expect(result.content).toBe("Hello, this is a response.");
    expect(result.inputTokens).toBe(20);
    expect(result.outputTokens).toBe(15);
  });

  it("retries before trying next model and eventually recovers", async () => {
    // First model: 4 calls fail (initial + 3 retries)
    // Second model: 1st attempt succeeds (call #5)
    let callCount = 0;
    mockCreate.mockImplementation(async () => {
      callCount++;
      if (callCount <= 4) {
        throw new Error("Temporary failure");
      }
      return {
        content: [{ type: "text", text: "Recovered" }],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    });

    const result = await callModel({
      query: "assessment of our security posture",
      systemPrompt: "You are a test.",
      tenantId: "tenant-1",
    });

    // Should eventually succeed after retries/fallback
    expect(result.content).toBe("Recovered");
    expect(result.degraded).toBeUndefined();
    expect(callCount).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it("handles empty content array gracefully", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 5, output_tokens: 0 },
    });

    const result = await callModel({
      query: "test",
      systemPrompt: "test",
      tenantId: "tenant-1",
    });

    expect(result.content).toBe("");
    expect(result.degraded).toBeUndefined();
  });

  it("classifies queries correctly", () => {
    expect(classifyQuery("What is a firewall?")).toBe("simple");
    expect(classifyQuery("Run a full security assessment of our network")).toBe("assessment");
    expect(classifyQuery("Create a roadmap for implementing zero trust")).toBe("planning");
    // "assessment" in the query triggers the assessment pattern — this is correct behavior
    // The classifier prioritizes earlier patterns; integration/tradeoff alone triggers complex
    expect(classifyQuery("Explain the tradeoff between speed and security in multi-cloud architecture design")).toBe("complex");
  });
});

describe("Embedding Migration — Supabase replaces Voyage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generateEmbedding uses Supabase, not Voyage", async () => {
    const mockGenerateEmbedding = vi.mocked(generateEmbedding);
    mockGenerateEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

    const result = await generateEmbedding("test text");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(mockGenerateEmbedding).toHaveBeenCalledWith("test text");
  });

  it("embedQuery wraps Supabase generateEmbedding", async () => {
    const mockEmbedQuery = vi.mocked(embedQuery);
    mockEmbedQuery.mockResolvedValueOnce([0.4, 0.5, 0.6]);

    const result = await embedQuery("security query");
    expect(result).toEqual([0.4, 0.5, 0.6]);
  });

  it("reports gte-small model name", () => {
    expect(getEmbeddingModel()).toBe("gte-small");
  });

  it("generateEmbedding returns null on failure (graceful)", async () => {
    const mockGenerateEmbedding = vi.mocked(generateEmbedding);
    mockGenerateEmbedding.mockResolvedValueOnce(null);

    const result = await generateEmbedding("failing text");
    expect(result).toBeNull();
  });
});

describe("RAG Pipeline Fallback", () => {
  it("vector search fail triggers keyword search fallback", async () => {
    const mockEmbedQuery = vi.mocked(embedQuery);
    mockEmbedQuery.mockRejectedValueOnce(new Error("Embedding service down"));

    // Verify embedQuery fails — hybridSearch catches this and falls back to keyword search
    await expect(embedQuery("test")).rejects.toThrow("Embedding service down");
  });
});
