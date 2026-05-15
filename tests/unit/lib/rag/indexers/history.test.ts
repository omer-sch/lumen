// Layer 2 (lib unit). History indexer wires agent + run_id into the
// chunk metadata so Quill can later filter History by client + channel
// without losing the back-reference to the agent_runs row.
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

describe("indexAgentRunOutput", () => {
  it("source_path is agent_runs/{run_id} and metadata carries agent + run_id", async () => {
    const { indexAgentRunOutput } = await import("@/lib/rag/indexers/history");
    await indexAgentRunOutput({
      agent: "hermes",
      run_id: "abc-123",
      content: "## Bullets\n\n- Meta CPI dropped 18%",
      metadata: { client: "globalcomix", channel: "meta" },
    });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [corpus, sourcePath, chunks] = upsertMock.mock.calls[0];
    expect(corpus).toBe("history");
    expect(sourcePath).toBe("agent_runs/abc-123");
    expect(chunks[0].metadata).toEqual({
      agent: "hermes",
      run_id: "abc-123",
      client: "globalcomix",
      channel: "meta",
    });
  });

  it("works without caller-supplied metadata", async () => {
    const { indexAgentRunOutput } = await import("@/lib/rag/indexers/history");
    await indexAgentRunOutput({
      agent: "hermes",
      run_id: "r1",
      content: "body",
    });
    const [, , chunks] = upsertMock.mock.calls[0];
    expect(chunks[0].metadata).toEqual({ agent: "hermes", run_id: "r1" });
  });
});
