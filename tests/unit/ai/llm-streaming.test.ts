import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockStream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn(() => ({
      messages: {
        create: vi.fn(),
        stream: mockStream,
      },
    })),
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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { callModelStreaming, classifyQuery, type StreamEvent } from "@/lib/ai/litellm";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockStreamIterable(chunks: string[], usage = { input_tokens: 100, output_tokens: 50 }) {
  const events = chunks.map((text) => ({
    type: "content_block_delta" as const,
    delta: { text },
    index: 0,
  }));

  const asyncIterable = {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: vi.fn().mockResolvedValue({
      usage,
      content: [{ type: "text", text: chunks.join("") }],
    }),
  };

  return asyncIterable;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LLM Streaming (B9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("yields start, delta, and complete events on success", async () => {
    const chunks = ["Hello, ", "this is ", "a streaming ", "response."];
    const mockStreamObj = createMockStreamIterable(chunks);
    mockStream.mockReturnValue(mockStreamObj);

    const events: StreamEvent[] = [];
    for await (const event of callModelStreaming({
      query: "What is MFA?",
      systemPrompt: "You are a security advisor.",
      tenantId: "tenant-1",
    })) {
      events.push(event);
    }

    // First event: start
    expect(events[0]).toMatchObject({ type: "start" });

    // Middle events: deltas
    const deltas = events.filter((e) => e.type === "delta");
    expect(deltas).toHaveLength(4);
    expect(deltas.map((d) => (d as any).content)).toEqual(chunks);

    // Last event: complete
    const complete = events[events.length - 1];
    expect(complete).toMatchObject({
      type: "complete",
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("yields error event when all models fail", async () => {
    mockStream.mockImplementation(() => {
      throw new Error("API unavailable");
    });

    const events: StreamEvent[] = [];
    for await (const event of callModelStreaming({
      query: "What is MFA?",
      systemPrompt: "You are a security advisor.",
      tenantId: "tenant-1",
    })) {
      events.push(event);
    }

    const errorEvent = events.find((e) => e.type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent).toMatchObject({
      type: "error",
      degraded: true,
    });
  });

  it("classifies the query and routes to appropriate model", async () => {
    const chunks = ["Response"];
    const mockStreamObj = createMockStreamIterable(chunks);
    mockStream.mockReturnValue(mockStreamObj);

    const events: StreamEvent[] = [];
    for await (const event of callModelStreaming({
      query: "Conduct a full security assessment of our infrastructure posture",
      systemPrompt: "You are a security advisor.",
      tenantId: "tenant-1",
    })) {
      events.push(event);
    }

    const startEvent = events.find((e) => e.type === "start") as any;
    expect(startEvent).toBeDefined();
    // Assessment query should classify as "assessment"
    expect(startEvent.classification).toBe("assessment");
  });

  it("falls back to next model on first model failure", async () => {
    let callCount = 0;
    mockStream.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error("Rate limited");
      }
      return createMockStreamIterable(["Fallback response"]);
    });

    const events: StreamEvent[] = [];
    for await (const event of callModelStreaming({
      query: "What is MFA?",
      systemPrompt: "You are a security advisor.",
      tenantId: "tenant-1",
    })) {
      events.push(event);
    }

    // Should have succeeded on fallback
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toBeDefined();
    expect(callCount).toBe(2);
  });

  it("respects maxTokens parameter", async () => {
    const mockStreamObj = createMockStreamIterable(["OK"]);
    mockStream.mockReturnValue(mockStreamObj);

    const events: StreamEvent[] = [];
    for await (const event of callModelStreaming({
      query: "Short answer",
      systemPrompt: "Be brief.",
      tenantId: "tenant-1",
      maxTokens: 256,
    })) {
      events.push(event);
    }

    // Verify stream was called with maxTokens
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 256 })
    );
  });
});

describe("Query Classification for Streaming", () => {
  it("simple queries get fast model tier", () => {
    expect(classifyQuery("What is a firewall?")).toBe("simple");
  });

  it("assessment queries get standard model tier", () => {
    expect(classifyQuery("Conduct a security assessment")).toBe("assessment");
  });

  it("planning queries get standard model tier", () => {
    expect(classifyQuery("Create a security roadmap strategy")).toBe("planning");
  });
});
