// Layer 3 (API route-handler). File under test:
// src/app/api/bq/100play/dashboard-kpis/route.ts. Priority: P0.
// Lumen-union routes refuse any non-100play slug at the boundary because
// they're tied 1:1 to the 100play warehouse table.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query100playKPIs } = vi.hoisted(() => ({
  query100playKPIs: vi.fn(),
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
  return { ...actual, query100playKPIs };
});

beforeEach(() => {
  vi.resetModules();
  query100playKPIs.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const URL =
  "/api/bq/100play/dashboard-kpis?client=100play&from=2026-04-15&to=2026-05-14";

describe("GET /api/bq/100play/dashboard-kpis", () => {
  it("returns 200 with the KPI payload", async () => {
    query100playKPIs.mockResolvedValue({ spend: 1234, installs: 0, cpi: 0, roas: 0 });
    const { GET } = await import("@/app/api/bq/100play/dashboard-kpis/route");
    const res = await GET(buildRequest(URL));
    const body = await expectJson<{ spend: number }>(res, 200);
    expect(body.spend).toBe(1234);
  });

  it("returns 403 when the client is allowlisted but not 100play (cache-key safety)", async () => {
    const { GET } = await import("@/app/api/bq/100play/dashboard-kpis/route");
    const res = await GET(
      buildRequest(
        "/api/bq/100play/dashboard-kpis?client=globalcomix&from=2026-04-15&to=2026-05-14",
      ),
    );
    await expectSafeError(res, 403, /Forbidden/);
    expect(query100playKPIs).not.toHaveBeenCalled();
  });

  it("returns 400 when from is missing", async () => {
    const { GET } = await import("@/app/api/bq/100play/dashboard-kpis/route");
    const res = await GET(
      buildRequest("/api/bq/100play/dashboard-kpis?client=100play&to=2026-05-14"),
    );
    await expectSafeError(res, 400, /Missing required param: from/);
  });

  it("returns 500 safely on generic throw", async () => {
    query100playKPIs.mockImplementation(async () => { throw new Error("BQ 100play table error"); });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/bq/100play/dashboard-kpis/route");
    const res = await GET(buildRequest(URL));
    const probe = await res.clone().text();
    await expectSafeError(res, 500, /Query failed/);
    expect(probe).not.toMatch(/100play table/);
  });
});
