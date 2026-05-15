// Layer 2 (lib unit). File under test: src/lib/rag/embed.ts. The
// OpenAI client is injected through the test seam, so no network is
// touched. We verify: cost accounting, single vs batch, sort by index,
// retry on 429/5xx, and surfacing of permanent failures.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMock = vi.fn();

class FakeOpenAI {
  embeddings = { create: createMock };
}

// Provide a default for OPENAI_API_KEY so getClient() does not throw
// before the test seam swaps the client. Cleaned up in afterEach.
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  createMock.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  const mod = await import("@/lib/rag/embed");
  mod.__setOpenAIClientForTesting(null);
});

async function loadEmbed() {
  const mod = await import("@/lib/rag/embed");
  mod.__setOpenAIClientForTesting(new FakeOpenAI() as never);
  return mod;
}

describe("embed", () => {
  it("returns a 1536-length vector + tokens + cost", async () => {
    createMock.mockResolvedValueOnce({
      data: [{ index: 0, embedding: new Array(1536).fill(0.01) }],
      usage: { total_tokens: 7 },
    });
    const { embed } = await loadEmbed();
    const r = await embed("hello world");
    expect(r.vector).toHaveLength(1536);
    expect(r.tokens).toBe(7);
    expect(r.cost_usd).toBeCloseTo((7 * 0.13) / 1_000_000, 12);
  });

  it("passes the right model + dimensions to OpenAI", async () => {
    createMock.mockResolvedValueOnce({
      data: [{ index: 0, embedding: new Array(1536).fill(0) }],
      usage: { total_tokens: 1 },
    });
    const { embed } = await loadEmbed();
    await embed("x");
    expect(createMock).toHaveBeenCalledWith({
      model: "text-embedding-3-large",
      input: ["x"],
      dimensions: 1536,
    });
  });
});

describe("embedBatch", () => {
  it("returns empty result for empty input without calling OpenAI", async () => {
    const { embedBatch } = await loadEmbed();
    const r = await embedBatch([]);
    expect(r.vectors).toEqual([]);
    expect(r.total_tokens).toBe(0);
    expect(r.total_cost_usd).toBe(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("sorts vectors by index when OpenAI returns them out of order", async () => {
    createMock.mockResolvedValueOnce({
      data: [
        { index: 2, embedding: [0.3] },
        { index: 0, embedding: [0.1] },
        { index: 1, embedding: [0.2] },
      ],
      usage: { total_tokens: 12 },
    });
    const { embedBatch } = await loadEmbed();
    const r = await embedBatch(["a", "b", "c"]);
    expect(r.vectors.map((v) => v[0])).toEqual([0.1, 0.2, 0.3]);
    expect(r.total_tokens).toBe(12);
  });

  // Helper: produce a rejected promise with a noop handler eagerly
  // attached. Vitest fake timers can reorder microtasks so that the
  // await inside withRetry attaches its handler too late for Node's
  // unhandled-rejection tracker; the noop catch silences that warning
  // without preventing withRetry from observing the rejection through
  // its own await on the same promise.
  function rejectQuietly(err: unknown): Promise<never> {
    const p = Promise.reject(err);
    p.catch(() => {});
    return p;
  }

  it("retries on 429 and eventually succeeds", async () => {
    vi.useFakeTimers();
    createMock
      .mockImplementationOnce(() => rejectQuietly({ status: 429, message: "rate limited" }))
      .mockResolvedValueOnce({
        data: [{ index: 0, embedding: new Array(1536).fill(0) }],
        usage: { total_tokens: 1 },
      });
    const { embed } = await loadEmbed();
    const pending = embed("x");
    await vi.runAllTimersAsync();
    const r = await pending;
    expect(r.tokens).toBe(1);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 503 and eventually succeeds", async () => {
    vi.useFakeTimers();
    createMock
      .mockImplementationOnce(() => rejectQuietly({ status: 503 }))
      .mockResolvedValueOnce({
        data: [{ index: 0, embedding: new Array(1536).fill(0) }],
        usage: { total_tokens: 1 },
      });
    const { embed } = await loadEmbed();
    const pending = embed("x");
    await vi.runAllTimersAsync();
    await pending;
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 4xx other than 429", async () => {
    createMock.mockImplementationOnce(() =>
      rejectQuietly({ status: 400, message: "bad input" }),
    );
    const { embed } = await loadEmbed();
    await expect(embed("x")).rejects.toMatchObject({ status: 400 });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after MAX_RETRIES and surfaces the last error", async () => {
    vi.useFakeTimers();
    createMock.mockImplementation(() =>
      rejectQuietly({ status: 429, message: "still hot" }),
    );
    const { embed } = await loadEmbed();
    const settled = embed("x").catch((e) => e);
    await vi.runAllTimersAsync();
    const result = await settled;
    expect(result).toMatchObject({ status: 429 });
    // 1 initial + 2 retries = 3 attempts total.
    expect(createMock).toHaveBeenCalledTimes(3);
  });
});

describe("embed without OPENAI_API_KEY", () => {
  it("throws a helpful error", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("OPENAI_API_KEY", "");
    // Force fresh module evaluation so the new env value takes hold
    // when getClient() runs (the existing test seam already nulled the
    // cached client in afterEach).
    vi.resetModules();
    const { embed } = await import("@/lib/rag/embed");
    await expect(embed("x")).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
