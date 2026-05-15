// Layer 2 (lib unit). Comms ingester shell. Required acceptance from
// the RAG scaffold prompt: callable from a unit test with a fake
// thread, no Gmail dependency. Verifies the chunk_id is deterministic,
// each message becomes its own chunk with prefixed context, and
// metadata captures sender + recipient.
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
    chunks_indexed: 2,
    embedding_tokens: 50,
    cost_usd: 0.0000065,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("indexCommsThread", () => {
  const thread = {
    client: "globalcomix",
    thread_id: "gmail-thread-1",
    subject: "Weekly review request",
    participants: [
      { name: "Emily Doe", email: "emily@globalcomix.com" },
      { name: "Lior", email: "lior@yellowhead.com" },
    ],
    messages: [
      {
        from: "emily@globalcomix.com",
        to: ["lior@yellowhead.com"],
        sent_at: "2026-05-12T10:00:00Z",
        body: "Hi Lior, please send the week 19 review focused on Meta.",
      },
      {
        from: "lior@yellowhead.com",
        to: ["emily@globalcomix.com"],
        sent_at: "2026-05-12T10:30:00Z",
        body: "On it - draft tomorrow morning.",
      },
    ],
  };

  it("no-ops on empty messages array", async () => {
    const { indexCommsThread } = await import("@/lib/rag/indexers/comms");
    const r = await indexCommsThread({
      ...thread,
      messages: [],
    });
    expect(r.chunks_indexed).toBe(0);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("emits one prepared chunk per message into the comms corpus", async () => {
    const { indexCommsThread } = await import("@/lib/rag/indexers/comms");
    await indexCommsThread(thread);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [corpus, sourcePath, chunks] = upsertMock.mock.calls[0];
    expect(corpus).toBe("comms");
    expect(sourcePath).toBe("comms/gmail-thread-1");
    expect(chunks).toHaveLength(2);
    // First message content carries subject + From/To + body.
    expect(chunks[0].content).toContain("Thread: Weekly review request");
    expect(chunks[0].content).toContain("From: emily@globalcomix.com");
    expect(chunks[0].content).toContain("To: lior@yellowhead.com");
    expect(chunks[0].content).toContain(
      "Hi Lior, please send the week 19 review focused on Meta.",
    );
  });

  it("attaches metadata that downstream filters can use", async () => {
    const { indexCommsThread } = await import("@/lib/rag/indexers/comms");
    await indexCommsThread(thread);
    const [, , chunks] = upsertMock.mock.calls[0];
    expect(chunks[0].metadata).toEqual({
      client: "globalcomix",
      thread_id: "gmail-thread-1",
      subject: "Weekly review request",
      from: "emily@globalcomix.com",
      to: ["lior@yellowhead.com"],
      sent_at: "2026-05-12T10:00:00Z",
      date: "2026-05-12",
    });
  });

  it("chunk_id is deterministic for the same message content", async () => {
    const { indexCommsThread } = await import("@/lib/rag/indexers/comms");
    await indexCommsThread(thread);
    const first = upsertMock.mock.calls[0][2];
    upsertMock.mockClear();
    await indexCommsThread(thread);
    const second = upsertMock.mock.calls[0][2];
    expect(first.map((c: { chunk_id: string }) => c.chunk_id)).toEqual(
      second.map((c: { chunk_id: string }) => c.chunk_id),
    );
  });
});
