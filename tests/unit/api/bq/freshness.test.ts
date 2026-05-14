// Layer 3 (API route-handler). File under test:
// src/app/api/bq/freshness/route.ts. Priority: P0.
// Freshness has an optional `client` param. No-client invocations are valid
// — they return the Rivery loader heartbeat without a client-scoped
// dataAsOf. Param validation is essentially a no-op here; the interesting
// surface is the error translation.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryFreshness } = vi.hoisted(() => ({
  queryFreshness: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryFreshness };
});

beforeEach(() => {
  vi.resetModules();
  queryFreshness.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/bq/freshness", () => {
  it("returns 200 with hoursAgo + lastUpdated when no client is provided", async () => {
    queryFreshness.mockResolvedValue({
      hoursAgo: 3,
      lastUpdated: "2026-05-14T08:00:00Z",
    });
    const { GET } = await import("@/app/api/bq/freshness/route");
    const res = await GET(buildRequest("/api/bq/freshness"));
    const body = await expectJson<{
      hoursAgo: number;
      lastUpdated: string;
    }>(res, 200);
    expect(body.hoursAgo).toBe(3);
    expect(queryFreshness).toHaveBeenCalledWith(undefined);
  });

  it("passes the optional client through to the lib", async () => {
    queryFreshness.mockResolvedValue({ hoursAgo: 1, lastUpdated: "now" });
    const { GET } = await import("@/app/api/bq/freshness/route");
    await GET(buildRequest("/api/bq/freshness?client=globalcomix"));
    expect(queryFreshness).toHaveBeenCalledWith("globalcomix");
  });

  it("translates ClientNotPermittedError to 403", async () => {
    const { ClientNotPermittedError } = await import("@/lib/bq-security");
    queryFreshness.mockImplementation(async () => { throw new ClientNotPermittedError("x"); });
    const { GET } = await import("@/app/api/bq/freshness/route");
    const res = await GET(buildRequest("/api/bq/freshness?client=x"));
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 500 safely on generic throw", async () => {
    queryFreshness.mockImplementation(async () => { throw new Error("BQ details leaked here"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/freshness/route");
    const res = await GET(buildRequest("/api/bq/freshness"));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/leaked here/);
  });
});
