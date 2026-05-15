// Layer 2 (lib unit). File under test: src/lib/rag/reindex-knowledge.ts.
// The fs reader is injected, so tests pass a fake reader; supabaseAdmin
// and indexKnowledgeDocument are mocked.
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const indexKnowledgeMock = vi.hoisted(() => vi.fn());
const limitTerminal = vi.hoisted(() => vi.fn());

const supabaseChain: Record<string, unknown> = {};
supabaseChain.from = () => supabaseChain;
supabaseChain.select = () => supabaseChain;
supabaseChain.eq = () => supabaseChain;
supabaseChain.order = () => supabaseChain;
supabaseChain.limit = limitTerminal;

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => supabaseChain,
}));

vi.mock("@/lib/rag/indexers/knowledge", () => ({
  indexKnowledgeDocument: indexKnowledgeMock,
}));

beforeEach(() => {
  indexKnowledgeMock.mockReset();
  limitTerminal.mockReset();
  limitTerminal.mockResolvedValue({ data: [], error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reindexEntries", () => {
  const entry = {
    source: "repo" as const,
    path: "CLAUDE.md",
    source_path: "lumen/CLAUDE.md",
    metadata: { tags: ["context"] },
  };

  it("indexes a fresh entry when no row exists for the source_path", async () => {
    indexKnowledgeMock.mockResolvedValueOnce({
      chunks_indexed: 2,
      embedding_tokens: 80,
      cost_usd: 0.00001,
    });
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const reader = vi.fn().mockResolvedValue("new content");
    const r = await reindexEntries([entry], "/repo", reader);
    expect(r.processed).toBe(1);
    expect(r.results[0]).toMatchObject({
      source_path: "lumen/CLAUDE.md",
      status: "indexed",
      chunks_indexed: 2,
    });
    expect(r.chunks_indexed).toBe(2);
    expect(indexKnowledgeMock).toHaveBeenCalledTimes(1);
    expect(reader).toHaveBeenCalledWith(expect.stringContaining("CLAUDE.md"));
  });

  it("short-circuits when the latest indexed chunk_id prefix matches the file hash", async () => {
    const content = "stable content";
    const prefix = createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 8);
    limitTerminal.mockResolvedValueOnce({
      data: [{ chunk_id: `${prefix}-0` }],
      error: null,
    });
    const reader = vi.fn().mockResolvedValue(content);
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const r = await reindexEntries([entry], "/repo", reader);
    expect(r.results[0].status).toBe("unchanged");
    expect(indexKnowledgeMock).not.toHaveBeenCalled();
  });

  it("re-indexes when the latest chunk_id prefix differs from the file hash", async () => {
    limitTerminal.mockResolvedValueOnce({
      data: [{ chunk_id: "deadbeef-0" }],
      error: null,
    });
    indexKnowledgeMock.mockResolvedValueOnce({
      chunks_indexed: 1,
      embedding_tokens: 30,
      cost_usd: 0.000004,
    });
    const reader = vi.fn().mockResolvedValue("changed content");
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const r = await reindexEntries([entry], "/repo", reader);
    expect(r.results[0].status).toBe("indexed");
    expect(indexKnowledgeMock).toHaveBeenCalledTimes(1);
  });

  it("reports ENOENT as missing without throwing or aborting the loop", async () => {
    const reader = vi
      .fn()
      .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"))
      .mockResolvedValueOnce("hello");
    indexKnowledgeMock.mockResolvedValueOnce({
      chunks_indexed: 1,
      embedding_tokens: 10,
      cost_usd: 0.0000013,
    });
    const e2 = { ...entry, source_path: "lumen/other.md", path: "other.md" };
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const r = await reindexEntries([entry, e2], "/repo", reader);
    expect(r.results[0].status).toBe("missing");
    expect(r.results[1].status).toBe("indexed");
  });

  it("surfaces other errors with status=error", async () => {
    const reader = vi
      .fn()
      .mockRejectedValueOnce(new Error("EACCES: permission denied"));
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const r = await reindexEntries([entry], "/repo", reader);
    expect(r.results[0].status).toBe("error");
    expect(r.results[0].error).toMatch(/EACCES/);
  });

  it("aggregates chunks_indexed + cost across entries", async () => {
    const reader = vi.fn().mockResolvedValue("any content");
    indexKnowledgeMock
      .mockResolvedValueOnce({
        chunks_indexed: 3,
        embedding_tokens: 100,
        cost_usd: 0.00001,
      })
      .mockResolvedValueOnce({
        chunks_indexed: 2,
        embedding_tokens: 60,
        cost_usd: 0.000007,
      });
    const e2 = { ...entry, source_path: "lumen/other.md", path: "other.md" };
    const { reindexEntries } = await import("@/lib/rag/reindex-knowledge");
    const r = await reindexEntries([entry, e2], "/repo", reader);
    expect(r.processed).toBe(2);
    expect(r.chunks_indexed).toBe(5);
    expect(r.cost_usd).toBeCloseTo(0.000017, 10);
  });
});
