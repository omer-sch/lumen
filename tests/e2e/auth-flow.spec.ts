import { test, expect } from "@playwright/test";

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
    await expect(page.getByText(/sign in to lumen/i)).toBeVisible();
  });

  test("/sign-up renders the branded auth shell", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();
  });

  test("protected routes redirect to /sign-in", async ({ page }) => {
    for (const path of ["/dashboard", "/feed", "/queries", "/knowledge"]) {
      await page.goto(path);
      await expect(page, `path: ${path}`).toHaveURL(/\/sign-in/);
    }
  });
});

test.describe("security headers", () => {
  test("security headers present on /sign-in", async ({ request }) => {
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
    // Spec promise: no unsafe-eval.
    expect(h["content-security-policy"]).not.toContain("'unsafe-eval'");
  });
});
