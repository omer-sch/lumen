// Layer 3 (API route-handler). File under test:
// src/app/api/bq/dashboard-kpis/route.ts.
// Priority: P0.
// Handler is a thin parse/dispatch/translate wrapper. Tests cover:
//   B. authed happy path → 200 with the lib's payload echoed back
//   C. missing param → 400 with a safe error
//   D. lib throws ClientNotPermitted / InvalidDate / generic → 403 / 400 / 500
// Auth is enforced by Clerk middleware (src/middleware.ts), not the handler,
// so the "unauth returns 401" contract lives in the middleware / Playwright
// suite. The same shape applies to every bq/* test in this file family.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson, expectSafeError } from "../_lib/route-test-utils";

const { queryDashboardKPIs } = vi.hoisted(() => ({
  queryDashboardKPIs: vi.fn(),
}));


vi.mock("@/lib/bq-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/bq-queries")>(
    "@/lib/bq-queries",
  );
  return { ...actual, queryDashboardKPIs };
});

beforeEach(() => {
  vi.resetModules();
  queryDashboardKPIs.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/bq/dashboard-kpis", () => {
  it("returns 200 with the lib payload on the authed happy path", async () => {
    const payload = {
      spend: 285_000,
      installs: 199_475,
      cpi: 1.49,
      roas: 0.298,
      spendDelta: 0.12,
      installsDelta: 0.08,
      cpiDelta: -0.04,
      roasDelta: 0.01,
    };
    queryDashboardKPIs.mockResolvedValue(payload);

    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    const body = await expectJson<typeof payload>(res, 200);
    expect(body).toEqual(payload);
    expect(queryDashboardKPIs).toHaveBeenCalledWith(
      "globalcomix",
      "2026-04-15",
      "2026-05-14",
      {},
    );
  });

  it("normalizes the client param to lowercase before dispatch", async () => {
    queryDashboardKPIs.mockResolvedValue({});
    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=GlobalComix&from=2026-04-15&to=2026-05-14",
      ),
    );
    expect(queryDashboardKPIs.mock.calls[0][0]).toBe("globalcomix");
  });

  it("returns 400 when the `to` param is missing", async () => {
    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest("/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15"),
    );
    await expectSafeError(res, 400, /Missing required param: to/);
    expect(queryDashboardKPIs).not.toHaveBeenCalled();
  });

  it("translates ClientNotPermittedError -> 403 Forbidden", async () => {
    const { ClientNotPermittedError } = await import("@/lib/bq-security");
    queryDashboardKPIs.mockImplementation(async () => { throw new ClientNotPermittedError("evil_client"); });
    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=evil_client&from=2026-04-15&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 403, /Forbidden/);
  });

  it("translates InvalidDateError -> 400 (no echo of the bad value)", async () => {
    const { InvalidDateError } = await import("@/lib/bq-queries");
    queryDashboardKPIs.mockImplementation(async () => { throw new InvalidDateError("not-a-date"); });
    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=not-a-date&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 400, /Bad request/);
  });

  it("does not leak a raw BQ error message on a generic throw -> 500", async () => {
    queryDashboardKPIs.mockImplementation(async () => { throw new Error("BQ permission denied for table dwh_fb2_globalcomix_adjust"); });
    // Silence the [bq:*] console.error log the handler emits.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    // Probe the raw body to confirm the BQ error did not leak (most
    // important assertion of this entire route-test family).
    expect(probe).not.toMatch(/dwh_fb2/);
    expect(probe).not.toMatch(/permission denied/i);
  });
});
