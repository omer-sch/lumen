// E2E: admin-only "Sync now" button on the dashboard header.
//
// The button is the user-visible side of the Redis cache subsystem:
//   1. It must render only when the signed-in user is on
//      `LUMEN_ADMIN_EMAILS` (server-authoritative via /api/me/admin).
//   2. Clicking it must POST /api/cache/refresh and the dashboard must
//      re-render against fresh data (no 30-minute stale shadow — that's
//      the bug the layer-A removal fixed).
//
// This spec runs in the chromium-authed project (storageState loaded
// from auth.setup.ts). The signed-in user's email must be in
// LUMEN_ADMIN_EMAILS for the visibility test to pass; if it isn't, the
// "hidden for non-admin" test still asserts a useful invariant.
import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

test.describe("Sync now (admin-only cache refresh)", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupClerkTestingToken({ page });
    // Pre-seed the welcome cookie so we land on /dashboard directly.
    const todayISO = new Date().toISOString().slice(0, 10);
    await context.addCookies([
      {
        name: "lumen.welcomed.last",
        value: todayISO,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);
  });

  test("admin probe drives button visibility", async ({ page }) => {
    // Probe /api/me/admin directly to know what to assert. The server is
    // the source of truth — env config could differ from local
    // expectations and we want this spec to be honest about either case.
    const probe = await page.request.get("/api/me/admin");
    expect(probe.ok()).toBeTruthy();
    const { isAdmin } = (await probe.json()) as { isAdmin: boolean };

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    if (isAdmin) {
      await expect(page.getByTestId("sync-now-button")).toBeVisible();
    } else {
      // Negative path: non-admin sessions must NEVER see the button. The
      // server gate enforces the same on /api/cache/refresh; the hidden
      // UI is a UX nicety on top.
      await expect(page.getByTestId("sync-now-button")).toHaveCount(0);
    }
  });

  test("clicking Sync now hits /api/cache/refresh and shows a success indicator", async ({
    page,
  }) => {
    const probe = await page.request.get("/api/me/admin");
    const { isAdmin } = (await probe.json()) as { isAdmin: boolean };
    test.skip(
      !isAdmin,
      "Skipping click test: signed-in user is not on LUMEN_ADMIN_EMAILS. The admin gate is still verified by the visibility test above.",
    );

    // Capture the refresh request before clicking. Use the response
    // promise pattern so we don't race the network.
    const refreshResponse = page.waitForResponse(
      (res) =>
        res.url().includes("/api/cache/refresh") && res.request().method() === "POST",
    );

    await page.goto("/dashboard");
    const btn = page.getByTestId("sync-now-button");
    await expect(btn).toBeVisible();
    await btn.click();

    // The button flips to a disabled "Syncing…" state during the call.
    await expect(btn).toContainText(/Syncing/i);

    const res = await refreshResponse;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      client: string;
      invalidatedKeys: number;
      warmedQueries: number;
    };
    expect(body.client).toBe("globalcomix");
    expect(body.warmedQueries).toBeGreaterThan(0);

    // Success indicator appears.
    await expect(page.getByTestId("sync-now-success")).toBeVisible();
    await expect(page.getByTestId("sync-now-success")).toContainText(
      /Synced\. Data current as of/,
    );
  });

  test("unauthenticated POST to /api/cache/refresh is rejected by Clerk", async ({
    browser,
  }) => {
    // Use a fresh anonymous context (no storageState) to assert the
    // server gate. Even if someone strips the button from the UI, the
    // route must refuse anon traffic.
    const anon = await browser.newContext();
    try {
      const res = await anon.request.post(
        "/api/cache/refresh?client=globalcomix",
        // maxRedirects: 0 so we observe the gate's exact response instead
        // of following Clerk's 307 to the sign-in HTML — that conflates
        // "route allowed me through to a redirect" with "route returned
        // a redirect to keep me out."
        { maxRedirects: 0 },
      );
      // Three valid gate outcomes:
      //   - 3xx: Clerk middleware redirects to /sign-in (no session)
      //   - 401: route's own auth gate refuses (no session reached the handler)
      //   - 403: route's admin-allowlist gate refuses (session but non-admin)
      // What's NOT valid is a 200 with the refresh JSON shape.
      const status = res.status();
      const gated =
        (status >= 300 && status < 400) || status === 401 || status === 403;
      expect(gated, `expected gate, got status ${status}`).toBeTruthy();

      // Defensive: confirm the success-shape JSON didn't leak through.
      const body = await res.text().catch(() => "");
      expect(body).not.toMatch(/"invalidatedKeys"/);
      expect(body).not.toMatch(/"warmedQueries"/);
    } finally {
      await anon.close();
    }
  });
});
