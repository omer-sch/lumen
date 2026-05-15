// Layer 3 (API route-handler). File under test:
// src/app/api/rag/index-history/route.ts. CRON_SECRET bearer auth +
// JSON body validation. Verifies that Hermes-shaped output (bullets +
// findings) gets rendered to markdown and forwarded to the History
// indexer.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const indexHistoryMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/indexers/history", () => ({
  indexAgentRunOutput: indexHistoryMock,
}));

beforeEach(() => {
  indexHistoryMock.mockReset();
  indexHistoryMock.mockResolvedValue({
    chunks_indexed: 1,
    embedding_tokens: 30,
    cost_usd: 0.000004,
  });
  vi.stubEnv("CRON_SECRET", "test-secret-with-enough-entropy-12345");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/rag/index-history", () => {
  it("returns 401 when no Authorization header is sent", async () => {
    const { POST } = await import("@/app/api/rag/index-history/route");
    const res = await POST(
      buildRequest("/api/rag/index-history", {
        method: "POST",
        body: { agent_id: "hermes", run_id: "r1", output: {} },
      }),
    );
    expect(res.status).toBe(401);
    expect(indexHistoryMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token does not match CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/rag/index-history/route");
    const res = await POST(
      buildRequest("/api/rag/index-history", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
        body: { agent_id: "hermes", run_id: "r1", output: {} },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid body", async () => {
    const { POST } = await import("@/app/api/rag/index-history/route");
    const res = await POST(
      buildRequest("/api/rag/index-history", {
        method: "POST",
        headers: { authorization: "Bearer test-secret-with-enough-entropy-12345" },
        body: { agent_id: "" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("renders bullets + findings into markdown and forwards to indexer", async () => {
    const { POST } = await import("@/app/api/rag/index-history/route");
    const res = await POST(
      buildRequest("/api/rag/index-history", {
        method: "POST",
        headers: { authorization: "Bearer test-secret-with-enough-entropy-12345" },
        body: {
          agent_id: "hermes",
          run_id: "r1",
          output: {
            bullets: [
              { claim: "Meta iOS CPI dropped 18% since Tuesday" },
              "Google ASA CPA stable",
            ],
            findings: [
              { kind: "anomaly", text: "Meta CPI z=-2.4 since 2026-05-12" },
            ],
          },
          client: "globalcomix",
          completed_at: "2026-05-15T10:30:00Z",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(indexHistoryMock).toHaveBeenCalledTimes(1);
    const args = indexHistoryMock.mock.calls[0][0];
    expect(args.agent).toBe("hermes");
    expect(args.run_id).toBe("r1");
    expect(args.metadata).toEqual({
      client: "globalcomix",
      completed_at: "2026-05-15T10:30:00Z",
    });
    expect(args.content).toContain("## Bullets");
    expect(args.content).toContain("- Meta iOS CPI dropped 18% since Tuesday");
    expect(args.content).toContain("- Google ASA CPA stable");
    expect(args.content).toContain("## Findings");
  });

  it("falls back to a JSON dump for non-Hermes-shaped output", async () => {
    const { POST } = await import("@/app/api/rag/index-history/route");
    await POST(
      buildRequest("/api/rag/index-history", {
        method: "POST",
        headers: { authorization: "Bearer test-secret-with-enough-entropy-12345" },
        body: {
          agent_id: "aria",
          run_id: "r2",
          output: { images: [{ title: "x" }] },
        },
      }),
    );
    const args = indexHistoryMock.mock.calls[0][0];
    expect(args.content).toMatch(/```json[\s\S]*"images"[\s\S]*```/);
  });
});
