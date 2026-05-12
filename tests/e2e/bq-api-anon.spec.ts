import { test, expect } from "@playwright/test";

/**
 * Anonymous-caller probe for /api/bq/dashboard-kpis. Runs in the default
 * unauthenticated 'chromium' project — no storageState. Must observe a
 * gate (307 redirect / 401 / 403 / 404), never a 200.
 *
 * SKIPPED in preview mode (LUMEN_PREVIEW=1) — preview deliberately
 * bypasses Clerk, so the gate is intentionally off. The preview-flag
 * source guards in preview-flag.spec.ts cover the "must stay off in
 * production" half of this contract.
 *
 * Lives in its own file because tests/.auth/user.json is loaded
 * per-project, not per-describe, in playwright.config.ts.
 */
const PREVIEW = process.env.LUMEN_PREVIEW === "1";

test.describe("api auth gating — /api/bq/dashboard-kpis", () => {
  test.skip(PREVIEW, "auth gate is intentionally off in preview mode");

  test("anonymous request is gated (no 200)", async ({ request }) => {
    const from = "2026-04-01";
    const to = "2026-04-30";
    const res = await request.get(
      `/api/bq/dashboard-kpis?client=globalcomix&from=${from}&to=${to}`,
      { maxRedirects: 0 },
    );
    const status = res.status();
    expect(
      [307, 401, 403, 404].includes(status),
      `anonymous request must be gated; got ${status}`,
    ).toBe(true);
    expect(status).not.toBe(200);
  });
});
