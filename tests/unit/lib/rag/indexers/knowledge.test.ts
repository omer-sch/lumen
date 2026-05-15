// Layer 2 (lib unit). Verifies knowledge indexer wires chunkMarkdown +
// upsertRagChunks correctly. The lower-level upsert is mocked; chunker
// is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/indexers/_upsert", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rag/indexers/_upsert")>(
    "@/lib/rag/indexers/_upsert",
  );
  return {
    ...actual,
    upsertRagChunks: upsertMock,
  };
});

beforeEach(() => {
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({
    chunks_indexed: 1,
    embedding_tokens: 5,
    cost_usd: 0.0000007,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("indexKnowledgeDocument", () => {
  it("chunks the content and forwards to upsertRagChunks with corpus=knowledge", async () => {
    const { indexKnowledgeDocument } = await import(
      "@/lib/rag/indexers/knowledge"
    );
    await indexKnowledgeDocument({
      source_path: "vault/playbook.md",
      content: "## Section A\nBody.",
      metadata: { client: "globalcomix", tags: ["playbook"] },
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [corpus, sourcePath, chunks] = upsertMock.mock.calls[0];
    expect(corpus).toBe("knowledge");
    expect(sourcePath).toBe("vault/playbook.md");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toMatch(/Section A/);
    expect(chunks[0].metadata).toEqual({
      client: "globalcomix",
      tags: ["playbook"],
    });
    expect(chunks[0].chunk_id).toMatch(/^[0-9a-f]{8}-0$/);
  });

  it("returns the upsert result verbatim", async () => {
    upsertMock.mockResolvedValueOnce({
      chunks_indexed: 4,
      embedding_tokens: 100,
      cost_usd: 0.000013,
    });
    const { indexKnowledgeDocument } = await import(
      "@/lib/rag/indexers/knowledge"
    );
    const r = await indexKnowledgeDocument({
      source_path: "x",
      content: "## A\nbody\n\n## B\nbody2",
    });
    expect(r).toEqual({
      chunks_indexed: 4,
      embedding_tokens: 100,
      cost_usd: 0.000013,
    });
  });

  it("passes empty metadata when none supplied", async () => {
    const { indexKnowledgeDocument } = await import(
      "@/lib/rag/indexers/knowledge"
    );
    await indexKnowledgeDocument({
      source_path: "x",
      content: "simple body",
    });
    const [, , chunks] = upsertMock.mock.calls[0];
    expect(chunks[0].metadata).toEqual({});
  });
});
