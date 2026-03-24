import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "emergency_rate_limits") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: () =>
                    // Simulate DB failure for fail-closed test
                    (globalThis as any).__DB_FAIL__
                      ? Promise.resolve({ data: null, error: { message: "connection refused" } })
                      : Promise.resolve({ data: [{ attempt_count: 99 }], error: null }),
                }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "users") {
        // For cross-tenant PII test: return a user belonging to a *different* tenant
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                single: () =>
                  (globalThis as any).__CROSS_TENANT_DB_FAIL__
                    ? Promise.reject(new Error("db down"))
                    : Promise.resolve({
                        data: { id: "u1", tenant_id: "OTHER_TENANT", email: "x@y.com" },
                        error: null,
                      }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
    },
  }),
}));

// ---------------------------------------------------------------------------
// 1. Rate limiter — returns 429 after limit exceeded
// ---------------------------------------------------------------------------

describe("Global Rate Limiter", () => {
  let rateLimiter: typeof import("@/middleware/rate-limiter");

  beforeEach(async () => {
    // Re-import to get a fresh module with cleared memory store
    rateLimiter = await import("@/middleware/rate-limiter");
    rateLimiter._resetMemoryStore();
  });

  it("allows requests under the per-IP limit (100/min)", async () => {
    const result = await rateLimiter.checkIPRateLimit("10.0.0.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
  });

  it("returns 429 after per-IP limit exceeded", async () => {
    for (let i = 0; i < 100; i++) {
      await rateLimiter.checkIPRateLimit("10.0.0.2");
    }
    const result = await rateLimiter.checkIPRateLimit("10.0.0.2");
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);

    const response = rateLimiter.getRateLimitErrorResponse(result);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
  });

  it("enforces per-user limit (60/min) independently of IP limit", async () => {
    for (let i = 0; i < 60; i++) {
      await rateLimiter.checkUserRateLimit("user-abc");
    }
    const result = await rateLimiter.checkUserRateLimit("user-abc");
    expect(result.allowed).toBe(false);
  });

  it("enforces per-tenant limit (200/min)", async () => {
    for (let i = 0; i < 200; i++) {
      await rateLimiter.checkTenantRateLimit("tenant-xyz");
    }
    const result = await rateLimiter.checkTenantRateLimit("tenant-xyz");
    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Emergency endpoint fails closed when DB unavailable
// ---------------------------------------------------------------------------

describe("Emergency endpoint fail-closed", () => {
  beforeEach(() => {
    (globalThis as any).__DB_FAIL__ = false;
  });

  it("denies request when rate-limit DB query fails", async () => {
    (globalThis as any).__DB_FAIL__ = true;

    // Dynamically import the route's internal checkRateLimit (tested via module)
    // We re-import to pick up the mock state
    const mod = await import("@/app/api/v1/auth/emergency/route");

    // We can't call the internal function directly, but we can verify the
    // behaviour through the exported POST handler by sending a request
    // that will trigger the rate-limit code path.
    const req = new Request("http://localhost/api/v1/auth/emergency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", code: "ABC123" }),
    });

    // NextRequest wrapper
    const { NextRequest } = await import("next/server");
    const nextReq = new NextRequest(req);
    const response = await mod.POST(nextReq);

    // When DB fails, the rate-limit check should fail closed → 429
    expect(response.status).toBe(429);
  });
});

// ---------------------------------------------------------------------------
// 3. Output validator blocks when cross-tenant PII scan fails
// ---------------------------------------------------------------------------

describe("Output validator fail-closed on PII scan failure", () => {
  beforeEach(() => {
    (globalThis as any).__CROSS_TENANT_DB_FAIL__ = false;
  });

  it("marks leaked=true when cross-tenant PII scan throws", async () => {
    (globalThis as any).__CROSS_TENANT_DB_FAIL__ = true;

    // The scanCrossTenantPII is private; we exercise it through validateOutput
    const { validateOutput } = await import("@/lib/ai/guardrails/output-validator");

    // Output contains an email that will trigger the cross-tenant lookup,
    // which our mock will make throw
    const result = await validateOutput("Contact alice@other-corp.com for details", {
      tenantId: "MY_TENANT",
    });

    // The validator should have recorded a critical cross-tenant leakage issue
    const criticalIssues = result.issues.filter(
      (i) => i.severity === "critical" && i.message.includes("Cross-tenant"),
    );
    expect(criticalIssues.length).toBeGreaterThan(0);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Timeout utility
// ---------------------------------------------------------------------------

describe("withTimeout", () => {
  it("resolves when promise finishes before deadline", async () => {
    const { withTimeout } = await import("@/lib/utils/timeout");
    const result = await withTimeout(Promise.resolve(42), 1000, "fast-op");
    expect(result).toBe(42);
  });

  it("throws TimeoutError after specified duration", async () => {
    const { withTimeout, TimeoutError } = await import("@/lib/utils/timeout");

    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000));

    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(TimeoutError);
    await expect(withTimeout(slow, 50, "slow-op")).rejects.toThrow(/slow-op/);
  });
});
