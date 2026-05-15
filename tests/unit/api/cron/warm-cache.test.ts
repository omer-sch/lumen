// Layer 3 (API route-handler). File under test: src/app/api/cron/warm-cache/route.ts.
//
// Auth model is a constant-time secret-header compare. Tests cover:
//   1. Missing / wrong header → 401
//   2. Correct header → walks the active-clients list and reports per-query results
//   3. `?client=` override scopes to one client
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const warmClientCache = vi.hoisted(() => vi.fn());
vi.mock("@/lib/cache/warm", () => ({ warmClientCache }));

const ORIGINAL_SECRET = process.env.CRON_SECRET;
const ORIGINAL_CLIENTS = process.env.LUMEN_ACTIVE_CLIENTS;

beforeEach(() => {
  vi.resetModules();
  warmClientCache.mockReset();
  process.env.CRON_SECRET = "shh-its-a-secret";
  delete process.env.LUMEN_ACTIVE_CLIENTS;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_CLIENTS === undefined) delete process.env.LUMEN_ACTIVE_CLIENTS;
  else process.env.LUMEN_ACTIVE_CLIENTS = ORIGINAL_CLIENTS;
  vi.restoreAllMocks();
});

describe("GET /api/cron/warm-cache", () => {
  it("rejects requests without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/warm-cache/route");
    const res = await GET(buildRequest("/api/cron/warm-cache"));
    expect(res.status).toBe(401);
    expect(warmClientCache).not.toHaveBeenCalled();
  });

  it("rejects requests with the wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/warm-cache/route");
    const res = await GET(
      buildRequest("/api/cron/warm-cache", {
        headers: { "x-cron-secret": "nope" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("walks the default active-clients list when LUMEN_ACTIVE_CLIENTS is unset", async () => {
    warmClientCache.mockResolvedValue([
      { query: "kpis", ok: true, latencyMs: 50 },
    ]);
    const { GET } = await import("@/app/api/cron/warm-cache/route");
    const res = await GET(
      buildRequest("/api/cron/warm-cache", {
        headers: { "x-cron-secret": "shh-its-a-secret" },
      }),
    );
    const body = await expectJson<{
      clients: Array<{ client: string; queries: Array<{ query: string }> }>;
    }>(res, 200);
    expect(body.clients.length).toBe(1);
    expect(body.clients[0].client).toBe("globalcomix");
    expect(warmClientCache).toHaveBeenCalledWith("globalcomix");
  });

  it("walks every client from LUMEN_ACTIVE_CLIENTS", async () => {
    process.env.LUMEN_ACTIVE_CLIENTS = "globalcomix, playw3";
    warmClientCache.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/warm-cache/route");
    const res = await GET(
      buildRequest("/api/cron/warm-cache", {
        headers: { "x-cron-secret": "shh-its-a-secret" },
      }),
    );
    const body = await expectJson<{ clients: Array<{ client: string }> }>(res, 200);
    expect(body.clients.map((c) => c.client)).toEqual(["globalcomix", "playw3"]);
    expect(warmClientCache).toHaveBeenCalledTimes(2);
  });

  it("scopes to a single client when ?client= is provided", async () => {
    process.env.LUMEN_ACTIVE_CLIENTS = "globalcomix,playw3";
    warmClientCache.mockResolvedValue([]);
    const { GET } = await import("@/app/api/cron/warm-cache/route");
    const res = await GET(
      buildRequest("/api/cron/warm-cache?client=playw3", {
        headers: { "x-cron-secret": "shh-its-a-secret" },
      }),
    );
    const body = await expectJson<{ clients: Array<{ client: string }> }>(res, 200);
    expect(body.clients.map((c) => c.client)).toEqual(["playw3"]);
    expect(warmClientCache).toHaveBeenCalledOnce();
    expect(warmClientCache).toHaveBeenCalledWith("playw3");
  });
});
