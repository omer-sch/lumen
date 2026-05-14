// Layer 3 (API route-handler). File under test:
// src/app/api/bq/100play/channel-mix/route.ts. Priority: P0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query100playChannelMix } = vi.hoisted(() => ({
  query100playChannelMix: vi.fn(),
}));

import {
  buildRequest,
  expectJson,
  expectSafeError,
} from "../../_lib/route-test-utils";


vi.mock("@/lib/bq-queries-100play", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/bq-queries-100play")
  >("@/lib/bq-queries-100play");
  return { ...actual, query100playChannelMix };
});

beforeEach(() => {
  vi.resetModules();
  query100playChannelMix.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL =
  "/api/bq/100play/channel-mix?client=100play&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/100play/channel-mix", () => {
  it("returns 200 with the channel rows", async () => {
    query100playChannelMix.mockResolvedValue([
      { network: "Meta", spend: 100, share: 1 },
    ]);
    const { GET } = await import("@/app/api/bq/100play/channel-mix/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<unknown[]>(res, 200);
    expect(body).toHaveLength(1);
  });

  it("returns 403 when client is not 100play", async () => {
    const { GET } = await import("@/app/api/bq/100play/channel-mix/route");
    const res = await GET(
      buildRequest(
        "/api/bq/100play/channel-mix?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("returns 400 when client is missing", async () => {
    const { GET } = await import("@/app/api/bq/100play/channel-mix/route");
    const res = await GET(
      buildRequest("/api/bq/100play/channel-mix?from=2026-04-15&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: client/);
  });

  it("returns 500 safely on generic throw", async () => {
    query100playChannelMix.mockImplementation(async () => { throw new Error("BQ pii_value error"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/100play/channel-mix/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/pii_value/);
  });
});
