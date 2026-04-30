import { test, expect } from "@playwright/test";

// One test per "level" the spec cares about. Auth-flow + basic security
// headers are covered in auth-flow.spec.ts; this file covers everything else.

// ---------- SECURITY ----------
test.describe("security", () => {
  test("CSP is strict and the Anthropic origin is not browser-reachable", async ({
    request,
  }) => {
    const r = await request.get("/sign-in");
    const csp = r.headers()["content-security-policy"];
    expect(csp).toBeDefined();
    // SPEC.md: Claude calls never touch the browser. CSP must reflect that.
    expect(csp).not.toMatch(/api\.anthropic\.com/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");

    // Next.js's "x-powered-by" leak is disabled in next.config.ts.
    expect(r.headers()["x-powered-by"]).toBeUndefined();

    // Permissions-Policy locks down camera/mic/geo even on auth surfaces.
    const pp = r.headers()["permissions-policy"];
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
  });
});

// ---------- ROUTING ----------
test.describe("routing", () => {
  test("static asset paths bypass the auth wall, deep app routes do not", async ({
    request,
  }) => {
    // Middleware matcher excludes _next/* and files with extensions.
    // A missing static file should 404 from Next, not redirect to /sign-in.
    const staticMiss = await request.get("/_next/static/does-not-exist.js", {
      maxRedirects: 0,
    });
    expect(staticMiss.status()).toBe(404);
    expect(staticMiss.url()).not.toMatch(/\/sign-in/);

    // A deep app route under (app) must be gated by Clerk → 3xx to /sign-in.
    const deep = await request.get("/dashboard/anything/nested", {
      maxRedirects: 0,
    });
    expect([302, 307, 308]).toContain(deep.status());
    expect(deep.headers()["location"] ?? "").toMatch(/\/sign-in/);
  });
});

// ---------- API SURFACE ----------
test.describe("api surface", () => {
  test("no /api route serves data unauthenticated and the browser never calls Anthropic", async ({
    page,
    request,
  }) => {
    // Phase 0: no /api routes shipped yet. If one slips through without
    // auth, this guard turns red. The middleware matcher includes
    // "/(api|trpc)(.*)", so a probe should get redirected, not 200.
    const probe = await request.get("/api/health", { maxRedirects: 0 });
    expect(probe.status()).not.toBe(200);
    expect([302, 307, 308, 404]).toContain(probe.status());

    // Watch every request the browser makes on the public auth page —
    // none of them may target Anthropic. Spec promise: server-side only.
    const offenders: string[] = [];
    page.on("request", (req) => {
      if (/anthropic\.com/i.test(req.url())) offenders.push(req.url());
    });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    expect(offenders).toEqual([]);
  });
});

// ---------- PERFORMANCE ----------
test.describe("performance", () => {
  test("/sign-in is interactive within budget and emits no critical console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const start = Date.now();
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /welcome back/i }),
    ).toBeVisible();
    const elapsed = Date.now() - start;

    // Generous budget — dev server, Clerk hydration, fonts. Tightens later.
    expect(elapsed).toBeLessThan(15_000);

    // Filter noisy dev-only Clerk warnings; everything else must be clean.
    const critical = errors.filter(
      (e) => !/clerk/i.test(e) && !/development keys/i.test(e),
    );
    expect(critical, critical.join("\n")).toEqual([]);
  });
});

// ---------- ACCESSIBILITY / META ----------
test.describe("accessibility & meta", () => {
  test("documents are lang-tagged, titled, and have a meaningful h1", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveTitle(/Lumen/);
    const h1Count = await page.getByRole("heading", { level: 1 }).count();
    expect(h1Count).toBeGreaterThanOrEqual(1);
  });
});

// ---------- BRAND CHROME ----------
test.describe("brand chrome", () => {
  test("auth surface carries the yellowHEAD lockup and tagline", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    // AuthShell renders these regardless of Clerk state — they're the brand
    // promise that this is Lumen, not a stock auth widget.
    await expect(page.getByText("Lumen", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/yellowHEAD · performance with intelligence/i),
    ).toBeVisible();
  });
});
