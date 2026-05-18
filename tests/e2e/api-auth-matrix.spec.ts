import { test, expect } from "@playwright/test";

/**
 * Anonymous-caller matrix for every /api/bq/* route. Pairs with
 * bq-api-anon.spec.ts (which probes just dashboard-kpis); this spec
 * fans out across the full route table so a future routing-middleware
 * regression that exempts one endpoint shows up here.
 *
 * Runs in the default `chromium` project — no storageState. The auth
 * gate (Clerk middleware) must return a redirect / 401 / 403 / 404
 * for every entry. Never 200.
 *
 * SKIPPED in PREVIEW mode (LUMEN_PREVIEW=1) because preview deliberately
 * bypasses Clerk; the preview-flag.spec.ts source guard covers the
 * "must stay off in production" half of the contract.
 */
const PREVIEW = process.env.LUMEN_PREVIEW === "1";

const FROM = "2026-04-15";
const TO = "2026-05-14";
const CLIENT = "globalcomix";
const HUNDRED = "100play";

// One entry per /api/bq/* route. Param shape matches the route's
// `requireParams` contract — but the request is still going to be
// gated by the middleware, so the validity of the params doesn't
// matter; we never see the handler.
const BQ_ROUTES: Array<{ name: string; url: string }> = [
  { name: "dashboard-kpis", url: `/api/bq/dashboard-kpis?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "campaigns",      url: `/api/bq/campaigns?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "channel-mix",    url: `/api/bq/channel-mix?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "trend",          url: `/api/bq/trend?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "data-bounds",    url: `/api/bq/data-bounds?client=${CLIENT}` },
  { name: "freshness",      url: `/api/bq/freshness` },
  { name: "network-breakdown", url: `/api/bq/network-breakdown?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "payback",        url: `/api/bq/payback?client=${CLIENT}&from=${FROM}&to=${TO}` },
  // WS4 + WS5 routes added 2026-05-17. Each must be gated the same way
  // as the headline dashboard routes — the middleware handles this
  // uniformly, but the matrix proves it for every new entry.
  { name: "total-subs",            url: `/api/bq/total-subs?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "weekends",              url: `/api/bq/weekends?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "geo",                   url: `/api/bq/geo?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "creatives",             url: `/api/bq/creatives?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "attribution-validation", url: `/api/bq/attribution-validation?client=${CLIENT}&from=${FROM}&to=${TO}` },
  { name: "100play:dashboard-kpis", url: `/api/bq/100play/dashboard-kpis?client=${HUNDRED}&from=${FROM}&to=${TO}` },
  { name: "100play:campaigns",      url: `/api/bq/100play/campaigns?client=${HUNDRED}&from=${FROM}&to=${TO}` },
  { name: "100play:channel-mix",    url: `/api/bq/100play/channel-mix?client=${HUNDRED}&from=${FROM}&to=${TO}` },
  { name: "100play:trend",          url: `/api/bq/100play/trend?client=${HUNDRED}&from=${FROM}&to=${TO}` },
  { name: "100play:data-bounds",    url: `/api/bq/100play/data-bounds?client=${HUNDRED}` },
];

test.describe("api auth gating — full /api/bq/* matrix", () => {
  test.skip(PREVIEW, "auth gate is intentionally off in preview mode");

  for (const route of BQ_ROUTES) {
    test(`${route.name}: anonymous request is gated (no 200)`, async ({
      request,
    }) => {
      const res = await request.get(route.url, { maxRedirects: 0 });
      const status = res.status();
      expect(
        [307, 401, 403, 404].includes(status),
        `${route.name}: anonymous request must be gated; got ${status}`,
      ).toBe(true);
      expect(status).not.toBe(200);
    });
  }

  test("/api/agents/aria/generate: anonymous POST is gated", async ({
    request,
  }) => {
    const res = await request.post("/api/agents/aria/generate", {
      data: { prompt: "anything" },
      maxRedirects: 0,
    });
    const status = res.status();
    expect([307, 401, 403, 404].includes(status)).toBe(true);
  });
});
