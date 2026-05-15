// Layer 3 (API route-handler). File under test:
// src/app/api/cron/rag-reindex-knowledge/route.ts. The orchestration
// logic lives in src/lib/rag/reindex-knowledge.ts and is exercised by
// its own unit test; here we only verify auth + thin wiring.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest } from "../_lib/route-test-utils";

const reindexMock = vi.hoisted(() => vi.fn());
const loadManifestMock = vi.hoisted(() => vi.fn());
const filterMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/reindex-knowledge", () => ({
  reindexEntries: reindexMock,
}));

vi.mock("@/lib/rag/manifests/reader", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/rag/manifests/reader")
  >("@/lib/rag/manifests/reader");
  return {
    ...actual,
    loadKnowledgeManifest: loadManifestMock,
    filterEntriesBySource: filterMock,
  };
});

beforeEach(() => {
  reindexMock.mockReset();
  loadManifestMock.mockReset();
  filterMock.mockReset();
  loadManifestMock.mockReturnValue({ version: 1, entries: [] });
  filterMock.mockReturnValue([]);
  reindexMock.mockResolvedValue({
    processed: 0,
    chunks_indexed: 0,
    cost_usd: 0,
    results: [],
  });
  vi.stubEnv("CRON_SECRET", "test-cron-secret-with-some-entropy-1234");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/rag-reindex-knowledge", () => {
  it("returns 401 with no x-cron-secret header", async () => {
    const { GET } = await import(
      "@/app/api/cron/rag-reindex-knowledge/route"
    );
    const res = await GET(buildRequest("/api/cron/rag-reindex-knowledge"));
    expect(res.status).toBe(401);
    expect(reindexMock).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong x-cron-secret header", async () => {
    const { GET } = await import(
      "@/app/api/cron/rag-reindex-knowledge/route"
    );
    const res = await GET(
      buildRequest("/api/cron/rag-reindex-knowledge", {
        headers: { "x-cron-secret": "definitely-not-the-secret" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("passes only repo-filtered entries into reindexEntries", async () => {
    const entries = [
      { source: "repo", path: "CLAUDE.md", source_path: "lumen/CLAUDE.md" },
    ];
    filterMock.mockImplementation((_m, sources: string[]) => {
      expect(sources).toEqual(["repo"]);
      return entries;
    });
    reindexMock.mockResolvedValueOnce({
      processed: 1,
      chunks_indexed: 3,
      cost_usd: 0.000005,
      results: [{ source_path: "lumen/CLAUDE.md", status: "indexed", chunks_indexed: 3 }],
    });
    const { GET } = await import(
      "@/app/api/cron/rag-reindex-knowledge/route"
    );
    const res = await GET(
      buildRequest("/api/cron/rag-reindex-knowledge", {
        headers: {
          "x-cron-secret": "test-cron-secret-with-some-entropy-1234",
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(reindexMock).toHaveBeenCalledTimes(1);
    expect(reindexMock).toHaveBeenCalledWith(entries, expect.any(String));
    const body = (await res.json()) as { chunks_indexed: number };
    expect(body.chunks_indexed).toBe(3);
  });
});
