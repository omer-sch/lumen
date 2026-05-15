// Layer 2 (lib unit). File under test: src/lib/rag/indexers/_upsert.ts.
// embedBatch + supabaseAdmin are mocked. We verify: empty input is a
// no-op (no embed, no upsert), the embed result is laid alongside the
// prepared chunks, the vector is formatted as a pgvector literal, and
// errors from Supabase surface.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const embedBatchMock = vi.hoisted(() => vi.fn());
const upsertMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn(() => ({ upsert: upsertMock })));

vi.mock("@/lib/rag/embed", () => ({
  embedBatch: embedBatchMock,
}));

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => ({ from: fromMock }),
}));

beforeEach(() => {
  embedBatchMock.mockReset();
  upsertMock.mockReset();
  fromMock.mockClear();
  embedBatchMock.mockResolvedValue({
    vectors: [[0.1, 0.2, 0.3]],
    total_tokens: 5,
    total_cost_usd: 0.0000006,
  });
  upsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("upsertRagChunks", () => {
  it("no-ops for empty chunks: no embed, no DB call", async () => {
    const { upsertRagChunks } = await import("@/lib/rag/indexers/_upsert");
    const r = await upsertRagChunks("knowledge", "vault/x.md", []);
    expect(r).toEqual({ chunks_indexed: 0, embedding_tokens: 0, cost_usd: 0 });
    expect(embedBatchMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("embeds, formats vectors as pgvector literals, and upserts onto the right key", async () => {
    embedBatchMock.mockResolvedValueOnce({
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4],
      ],
      total_tokens: 10,
      total_cost_usd: 0.0000013,
    });
    const { upsertRagChunks } = await import("@/lib/rag/indexers/_upsert");
    const r = await upsertRagChunks("knowledge", "vault/x.md", [
      { chunk_id: "abc-0", content: "first", metadata: { client: "globalcomix" } },
      { chunk_id: "abc-1", content: "second", metadata: { client: "globalcomix" } },
    ]);
    expect(fromMock).toHaveBeenCalledWith("rag_chunks");
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [rows, options] = upsertMock.mock.calls[0];
    expect(options).toEqual({ onConflict: "corpus,source_path,chunk_id" });
    expect(rows).toEqual([
      {
        corpus: "knowledge",
        source_path: "vault/x.md",
        chunk_id: "abc-0",
        content: "first",
        embedding: "[0.1,0.2]",
        metadata: { client: "globalcomix" },
      },
      {
        corpus: "knowledge",
        source_path: "vault/x.md",
        chunk_id: "abc-1",
        content: "second",
        embedding: "[0.3,0.4]",
        metadata: { client: "globalcomix" },
      },
    ]);
    expect(r).toEqual({
      chunks_indexed: 2,
      embedding_tokens: 10,
      cost_usd: 0.0000013,
    });
  });

  it("surfaces upsert errors as exceptions", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: "RLS denied" } });
    const { upsertRagChunks } = await import("@/lib/rag/indexers/_upsert");
    await expect(
      upsertRagChunks("knowledge", "x.md", [
        { chunk_id: "a", content: "c", metadata: {} },
      ]),
    ).rejects.toThrow(/RLS denied/);
  });
});
