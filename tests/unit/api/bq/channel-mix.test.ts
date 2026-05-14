// Layer 3 (API route-handler). File under test:
// src/app/api/bq/channel-mix/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryChannelMix } = vi.hoisted(() => ({
  queryChannelMix: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryChannelMix };
});

beforeEach(() => {
  vi.resetModules();
  queryChannelMix.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL = "/api/bq/channel-mix?client=globalcomix&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/channel-mix", () => {
  it("returns 200 with the channel breakdown array", async () => {
    queryChannelMix.mockResolvedValue([
      { network: "Meta", spend: 100, share: 0.5 },
      { network: "Google", spend: 80, share: 0.4 },
    ]);
    const { GET } = await import("@/app/api/bq/channel-mix/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<{ network: string }[]>(res, 200);
    expect(body.map((r) => r.network)).toEqual(["Meta", "Google"]);
  });

  it("returns 400 when client is missing", async () => {
    const { GET } = await import("@/app/api/bq/channel-mix/route");
    const res = await GET(
      buildRequest("/api/bq/channel-mix?from=2026-04-15&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: client/);
  });

  it("returns 400 when from is whitespace-only", async () => {
    const { GET } = await import("@/app/api/bq/channel-mix/route");
    const res = await GET(
      buildRequest("/api/bq/channel-mix?client=globalcomix&from=%20&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: from/);
  });

  it("returns 500 safely when BQ throws", async () => {
    queryChannelMix.mockImplementation(async () => { throw new Error("BQ unknown column foo"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/channel-mix/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/unknown column/);
  });
});
