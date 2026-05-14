// Layer 3 (API route-handler). File under test:
// src/app/api/bq/network-breakdown/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryNetworkBreakdown } = vi.hoisted(() => ({
  queryNetworkBreakdown: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryNetworkBreakdown };
});

beforeEach(() => {
  vi.resetModules();
  queryNetworkBreakdown.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL = "/api/bq/network-breakdown?client=globalcomix&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/network-breakdown", () => {
  it("returns 200 with the network rows", async () => {
    queryNetworkBreakdown.mockResolvedValue([
      { network: "Meta", spend: 100, installs: 50, cpi: 2, roas: 1, share: 0.5 },
      { network: "Google", spend: 80, installs: 30, cpi: 2.66, roas: 0.9, share: 0.4 },
    ]);
    const { GET } = await import("@/app/api/bq/network-breakdown/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<{ network: string }[]>(res, 200);
    expect(body.map((r) => r.network)).toEqual(["Meta", "Google"]);
  });

  it("returns 200 with [] for non-multi-source clients", async () => {
    queryNetworkBreakdown.mockResolvedValue([]);
    const { GET } = await import("@/app/api/bq/network-breakdown/route");
    const res = await GET(
      buildRequest(
        "/api/bq/network-breakdown?client=playw3&from=2026-04-15&to=2026-05-14",
      ),
    );
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toEqual([]);
  });

  it("returns 400 when `to` is missing", async () => {
    const { GET } = await import("@/app/api/bq/network-breakdown/route");
    const res = await GET(
      buildRequest("/api/bq/network-breakdown?client=globalcomix&from=2026-04-15"),
    );
    await expectSafeError(res, 400, /Missing required param: to/);
  });

  it("returns 500 safely on generic throw", async () => {
    queryNetworkBreakdown.mockImplementation(async () => { throw new Error("BQ row source error secret"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/network-breakdown/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/secret/);
  });
});
