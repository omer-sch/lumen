// Layer 2 (lib unit). File under test: src/lib/rag/retrieve.ts.
// embed() and supabaseAdmin() are both mocked. We verify: Zod arg
// validation (good and bad), filter wiring into the RPC, citation
// extraction, empty-corpus behavior, latency + cost accounting, and
// surfacing of a Supabase error.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/rag/embed", () => ({
  embed: (text: string) => embedMock(text),
}));

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => ({ rpc: rpcMock }),
}));

beforeEach(() => {
  embedMock.mockReset();
  rpcMock.mockReset();
  // Sensible defaults so each test sets only what matters.
  embedMock.mockResolvedValue({
    vector: new Array(1536).fill(0.01),
    tokens: 5,
    cost_usd: 0.00000065,
  });
  rpcMock.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RetrieveArgs (Zod)", () => {
  it("rejects an unknown corpus", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await expect(
      retrieve({ corpus: "not-a-corpus" as never, query: "x" }),
    ).rejects.toThrow();
  });

  it("rejects an empty query", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await expect(
      retrieve({ corpus: "knowledge", query: "" }),
    ).rejects.toThrow();
  });

  it("rejects k outside [1, 50]", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await expect(
      retrieve({ corpus: "knowledge", query: "x", k: 0 }),
    ).rejects.toThrow();
    await expect(
      retrieve({ corpus: "knowledge", query: "x", k: 51 }),
    ).rejects.toThrow();
  });

  it("defaults k to 10 and filters to {}", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await retrieve({ corpus: "knowledge", query: "x" });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [, args] = rpcMock.mock.calls[0];
    expect(args.match_count).toBe(10);
    expect(args.filter_client).toBeNull();
    expect(args.filter_channel).toBeNull();
    expect(args.filter_platform).toBeNull();
    expect(args.filter_date_from).toBeNull();
    expect(args.filter_date_to).toBeNull();
    expect(args.filter_tags).toBeNull();
  });
});

describe("retrieve filter wiring", () => {
  it("passes client / channel / platform straight through", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await retrieve({
      corpus: "history",
      query: "ROAS",
      filters: { client: "globalcomix", channel: "meta", platform: "android" },
      k: 5,
    });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.match_corpus).toBe("history");
    expect(args.match_count).toBe(5);
    expect(args.filter_client).toBe("globalcomix");
    expect(args.filter_channel).toBe("meta");
    expect(args.filter_platform).toBe("android");
  });

  it("unpacks date_range tuple into from/to", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await retrieve({
      corpus: "knowledge",
      query: "x",
      filters: { date_range: ["2026-04-01", "2026-05-15"] },
    });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.filter_date_from).toBe("2026-04-01");
    expect(args.filter_date_to).toBe("2026-05-15");
  });

  it("passes tags through as an array", async () => {
    const { retrieve } = await import("@/lib/rag/retrieve");
    await retrieve({
      corpus: "knowledge",
      query: "x",
      filters: { tags: ["playbook", "ua"] },
    });
    const [, args] = rpcMock.mock.calls[0];
    expect(args.filter_tags).toEqual(["playbook", "ua"]);
  });
});

describe("retrieve result shape", () => {
  it("returns empty arrays + zero latency floor when corpus has no matches", async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    const { retrieve } = await import("@/lib/rag/retrieve");
    const r = await retrieve({ corpus: "knowledge", query: "x" });
    expect(r.chunks).toEqual([]);
    expect(r.citations).toEqual([]);
    expect(r.total_searched).toBe(0);
    expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    expect(r.query_embedding_cost_usd).toBeGreaterThanOrEqual(0);
  });

  it("maps rows to chunks and citations", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          id: "u1",
          chunk_id: "abc-0",
          source_path: "vault/x.md",
          content: "body 1",
          metadata: { client: "globalcomix" },
          similarity: 0.82,
        },
        {
          id: "u2",
          chunk_id: "abc-1",
          source_path: "vault/x.md",
          content: "body 2",
          metadata: null,
          similarity: 0.71,
        },
      ],
      error: null,
    });
    const { retrieve } = await import("@/lib/rag/retrieve");
    const r = await retrieve({ corpus: "knowledge", query: "x" });
    expect(r.chunks).toHaveLength(2);
    expect(r.chunks[0]).toEqual({
      chunk_id: "abc-0",
      source_path: "vault/x.md",
      content: "body 1",
      metadata: { client: "globalcomix" },
      similarity: 0.82,
    });
    expect(r.chunks[1].metadata).toEqual({});
    expect(r.citations).toEqual([
      { source_path: "vault/x.md", chunk_id: "abc-0" },
      { source_path: "vault/x.md", chunk_id: "abc-1" },
    ]);
  });

  it("surfaces the embedding cost from embed()", async () => {
    embedMock.mockResolvedValueOnce({
      vector: new Array(1536).fill(0),
      tokens: 100,
      cost_usd: 0.000013,
    });
    const { retrieve } = await import("@/lib/rag/retrieve");
    const r = await retrieve({ corpus: "knowledge", query: "x" });
    expect(r.query_embedding_cost_usd).toBe(0.000013);
  });
});

describe("retrieve error handling", () => {
  it("throws when the RPC returns an error", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "ANN index missing" },
    });
    const { retrieve } = await import("@/lib/rag/retrieve");
    await expect(
      retrieve({ corpus: "knowledge", query: "x" }),
    ).rejects.toThrow(/ANN index missing/);
  });
});
