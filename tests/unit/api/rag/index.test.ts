// Layer 3 (API route-handler). File under test: src/app/api/rag/index/route.ts.
// Admin allowlist auth (Clerk session + LUMEN_ADMIN_USER_IDS) and Zod
// validation are both enforced before the indexer is touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const authMock = vi.hoisted(() => vi.fn());
const getAdminUserIdMock = vi.hoisted(() => vi.fn());
const indexKnowledgeMock = vi.hoisted(() => vi.fn());
const indexHistoryMock = vi.hoisted(() => vi.fn());
const indexCommsMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/auth/admin", () => ({ getAdminUserId: getAdminUserIdMock }));
vi.mock("@/lib/rag/indexers/knowledge", () => ({
  indexKnowledgeDocument: indexKnowledgeMock,
}));
vi.mock("@/lib/rag/indexers/history", () => ({
  indexAgentRunOutput: indexHistoryMock,
}));
vi.mock("@/lib/rag/indexers/comms", () => ({
  indexCommsThread: indexCommsMock,
}));

beforeEach(() => {
  authMock.mockReset();
  getAdminUserIdMock.mockReset();
  indexKnowledgeMock.mockReset();
  indexHistoryMock.mockReset();
  indexCommsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/rag/index", () => {
  it("returns 401 when no Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", { method: "POST", body: {} }),
    );
    expect(res.status).toBe(401);
    expect(indexKnowledgeMock).not.toHaveBeenCalled();
  });

  it("returns 403 when signed in but not on the admin allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_1" });
    getAdminUserIdMock.mockResolvedValue(null);
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", { method: "POST", body: {} }),
    );
    expect(res.status).toBe(403);
    expect(indexKnowledgeMock).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    getAdminUserIdMock.mockResolvedValue("user_admin_1");
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        body: "{ not json",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on an unknown corpus", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    getAdminUserIdMock.mockResolvedValue("user_admin_1");
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        body: {
          corpus: "benchmarks",
          source_path: "x",
          content: "y",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("dispatches knowledge corpus to indexKnowledgeDocument", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    getAdminUserIdMock.mockResolvedValue("user_admin_1");
    indexKnowledgeMock.mockResolvedValue({
      chunks_indexed: 3,
      embedding_tokens: 100,
      cost_usd: 0.000013,
    });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        body: {
          corpus: "knowledge",
          source_path: "vault/x.md",
          content: "## A\nbody",
          metadata: { client: "globalcomix" },
        },
      }),
    );
    const body = await expectJson<{ chunks_indexed: number }>(res, 200);
    expect(body.chunks_indexed).toBe(3);
    expect(indexKnowledgeMock).toHaveBeenCalledWith({
      source_path: "vault/x.md",
      content: "## A\nbody",
      metadata: { client: "globalcomix" },
    });
  });

  it("dispatches history corpus to indexAgentRunOutput", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    getAdminUserIdMock.mockResolvedValue("user_admin_1");
    indexHistoryMock.mockResolvedValue({
      chunks_indexed: 1,
      embedding_tokens: 30,
      cost_usd: 0.000004,
    });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        body: {
          corpus: "history",
          agent: "hermes",
          run_id: "r1",
          content: "## Bullets\n\n- meta cpi down 18%",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(indexHistoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "hermes", run_id: "r1" }),
    );
  });

  it("accepts the x-backfill-secret header in place of Clerk auth", async () => {
    // CRON_SECRET path: no Clerk session needed. Use the same value as
    // the header.
    process.env.CRON_SECRET = "backfill-secret-with-enough-entropy-12345";
    indexKnowledgeMock.mockResolvedValue({
      chunks_indexed: 1,
      embedding_tokens: 10,
      cost_usd: 0.0000013,
    });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        headers: {
          "x-backfill-secret": "backfill-secret-with-enough-entropy-12345",
        },
        body: {
          corpus: "knowledge",
          source_path: "vault/x.md",
          content: "body",
        },
      }),
    );
    expect(res.status).toBe(200);
    // Clerk auth helpers are NOT called when the backfill secret is
    // valid.
    expect(authMock).not.toHaveBeenCalled();
    expect(getAdminUserIdMock).not.toHaveBeenCalled();
    delete process.env.CRON_SECRET;
  });

  it("rejects a wrong x-backfill-secret and falls through to Clerk auth (then 401)", async () => {
    process.env.CRON_SECRET = "real-secret-with-enough-entropy-12345678";
    authMock.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        headers: { "x-backfill-secret": "wrong" },
        body: {
          corpus: "knowledge",
          source_path: "x",
          content: "body",
        },
      }),
    );
    expect(res.status).toBe(401);
    delete process.env.CRON_SECRET;
  });

  it("dispatches comms corpus to indexCommsThread", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    getAdminUserIdMock.mockResolvedValue("user_admin_1");
    indexCommsMock.mockResolvedValue({
      chunks_indexed: 2,
      embedding_tokens: 50,
      cost_usd: 0.0000065,
    });
    const { POST } = await import("@/app/api/rag/index/route");
    const res = await POST(
      buildRequest("/api/rag/index", {
        method: "POST",
        body: {
          corpus: "comms",
          thread: {
            client: "globalcomix",
            thread_id: "t1",
            subject: "x",
            participants: [],
            messages: [
              { from: "a", to: ["b"], sent_at: "2026-05-12T10:00:00Z", body: "hi" },
            ],
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(indexCommsMock).toHaveBeenCalledTimes(1);
  });
});
