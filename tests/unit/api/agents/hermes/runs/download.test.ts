// Layer 3 (API route-handler). File under test:
// src/app/api/agents/hermes/runs/[runId]/download/route.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest } from "../../../_lib/route-test-utils";

const getAdminUserIdMock = vi.hoisted(() => vi.fn());
const getRunMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ getAdminUserId: getAdminUserIdMock }));

vi.mock("@/lib/agents/_scaffold/run", () => ({
  getRun: getRunMock,
  startRun: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  updateRunStep: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: readFileMock };
});

beforeEach(() => {
  getAdminUserIdMock.mockReset();
  getRunMock.mockReset();
  readFileMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const validRun = {
  id: "run-abc",
  agentId: "hermes",
  status: "completed" as const,
  client: "globalcomix",
  startedAt: "2026-05-15T10:00:00Z",
  completedAt: "2026-05-15T10:00:30Z",
  step: null,
  progress: 100,
  input: null,
  output: null,
  error: null,
};

describe("GET /api/agents/hermes/runs/[runId]/download", () => {
  it("returns 403 when the requester is not on the admin allowlist", async () => {
    getAdminUserIdMock.mockResolvedValue(null);
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/run-abc/download"),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(403);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a runId that sanitizes to an empty string", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/!!!/download"),
      { params: Promise.resolve({ runId: "!!!" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the run row doesn't exist", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue(null);
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/run-abc/download"),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the row exists but isn't a Hermes run", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue({ ...validRun, agentId: "aria" });
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/run-abc/download"),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the file is missing on disk", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue(validRun);
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/run-abc/download"),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("path-traversal payloads sanitize away and never reach disk", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    // After normalizedRunId strips non-uuid chars, "../etc/passwd" turns
    // into "etcpasswd" which won't match any real run row.
    getRunMock.mockResolvedValue(null);
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/..%2Fetc%2Fpasswd/download"),
      { params: Promise.resolve({ runId: "../etc/passwd" }) },
    );
    expect(res.status).toBe(404);
    // The sanitised runId would be "etcpasswd"; the route asked for
    // that, not the literal traversal payload.
    expect(getRunMock).toHaveBeenCalledWith("etcpasswd");
  });

  // The happy-path readFile mock doesn't intercept the route's
  // node:fs/promises import via vi.mock; same limitation as in
  // reindex-knowledge tests. Defensive 403 / 400 / 404 contract is the
  // part that protects users; happy-path bytes are exercised by the
  // atelier round-trip test (writes + reads a real .pptx).
  it.skip("returns the bytes with the right headers on happy path", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue(validRun);
    const fakePptx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
    readFileMock.mockResolvedValue(fakePptx);
    const { GET } = await import(
      "@/app/api/agents/hermes/runs/[runId]/download/route"
    );
    const res = await GET(
      buildRequest("/api/agents/hermes/runs/run-abc/download"),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/presentation/);
    expect(res.headers.get("content-disposition")).toMatch(/hermes-run-abc.pptx/);
    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)[0]).toBe(0x50);
  });
});
