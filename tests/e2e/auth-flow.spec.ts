import { test, expect } from "@playwright/test";

// Auth gate + branded shell behaviour. These tests assume the dev server
// is NOT running with LUMEN_PREVIEW=1 (preview mode bypasses Clerk for
// local design work and would make every assertion below pointless).

const PROTECTED_ROUTES = [
  "/dashboard",
  "/campaigns",
  "/queries",
  "/reports",
  "/feed",
  "/knowledge",
];

const PUBLIC_ROUTES = ["/sign-in", "/sign-up", "/welcome"];

test.describe("auth flow (unauthenticated)", () => {
  test("/ redirects unauthed users to /sign-in", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("/sign-in renders the branded auth shell", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveTitle(/Lumen/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    // Use the exact brand-shell subtitle so we don't accidentally match
    // Clerk's own hidden h1, which carries a similar string.
    await expect(page.getByText("Sign in to Lumen.", { exact: true })).toBeVisible();
  });

  test("/sign-up renders the branded auth shell", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  });

  test("every protected route redirects to /sign-in", async ({ page }) => {
    for (const path of PROTECTED_ROUTES) {
      await page.goto(path);
      await expect(page, `path: ${path}`).toHaveURL(/\/sign-in/);
    }
  });

  test("public routes do not redirect to /sign-in", async ({ request }) => {
    for (const path of PUBLIC_ROUTES) {
      const r = await request.get(path, { maxRedirects: 0 });
      expect(
        r.status(),
        `${path} should respond 200, got ${r.status()}`,
      ).toBe(200);
    }
  });

  test("redirect carries an HTTPS-safe Location header", async ({ request }) => {
    // The middleware redirect uses `new URL("/sign-in", req.url).toString()`.
    // That preserves the request scheme — a hijack to `javascript:` URLs
    // or remote origins should never appear in the Location header.
    const r = await request.get("/dashboard", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(r.status());
    const loc = r.headers()["location"] ?? "";
    expect(loc).toMatch(/\/sign-in/);
    expect(loc).not.toMatch(/^javascript:/i);
    expect(loc).not.toMatch(/^data:/i);
    expect(loc).toMatch(/^https?:\/\/localhost|^\/sign-in/);
  });

  test("nested protected paths still get gated", async ({ request }) => {
    // A bug in the middleware matcher would let /dashboard/anything through.
    const r = await request.get("/dashboard/anything/nested", { maxRedirects: 0 });
    expect([302, 307, 308]).toContain(r.status());
    expect(r.headers()["location"] ?? "").toMatch(/\/sign-in/);
  });
});

test.describe("security headers (legacy probe — see security-headers.spec.ts for full matrix)", () => {
  test("baseline headers present on /sign-in", async ({ request }) => {
    const r = await request.get("/sign-in");
    const h = r.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["strict-transport-security"]).toMatch(/max-age=/);
    expect(h["cross-origin-opener-policy"]).toBe("same-origin");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    // Spec promise: browser never talks to Anthropic directly.
    expect(h["content-security-policy"]).not.toContain("api.anthropic.com");
    // Spec promise: no unsafe-eval anywhere.
    expect(h["content-security-policy"]).not.toContain("'unsafe-eval'");
  });
});
