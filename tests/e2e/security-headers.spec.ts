import { test, expect, type APIRequestContext } from "@playwright/test";

// Comprehensive header matrix. Every public route must carry the full
// security header set with the same values — drift between routes is a
// regression. We also assert each header is present on a redirect (the
// /dashboard → /sign-in case) so a misconfigured middleware can't ship
// auth redirects without security headers attached.

const PUBLIC_ROUTES = ["/sign-in", "/sign-up", "/welcome"];
const REDIRECTING_ROUTES = ["/", "/dashboard", "/campaigns", "/queries", "/reports", "/feed", "/knowledge"];

const REQUIRED_HEADERS: Record<string, string | RegExp> = {
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security":
    /^max-age=63072000;\s*includeSubDomains;\s*preload$/,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-site",
};

const FORBIDDEN_HEADERS = [
  // Next's "X-Powered-By: Next.js" leaks framework details. We disable it
  // in next.config.ts; this guard makes regressions visible.
  "x-powered-by",
  // The legacy XSS auditor header is harmful to leave on (re-enables a
  // browser feature that's been removed for years and can be abused).
  "x-xss-protection",
];

const expectMatch = (actual: string | undefined, expected: string | RegExp, label: string) => {
  if (typeof expected === "string") {
    expect(actual, label).toBe(expected);
  } else {
    expect(actual ?? "", label).toMatch(expected);
  }
};

const assertHeaders = async (request: APIRequestContext, path: string, opts: { allowRedirect?: boolean } = {}) => {
  const r = await request.get(path, { maxRedirects: 0 });
  if (!opts.allowRedirect) {
    expect(r.status(), `${path} should respond 200`).toBe(200);
  }
  const h = r.headers();
  for (const [name, expected] of Object.entries(REQUIRED_HEADERS)) {
    expectMatch(h[name], expected, `${path} → ${name}`);
  }
  for (const banned of FORBIDDEN_HEADERS) {
    expect(h[banned], `${path} → ${banned} should not be set`).toBeUndefined();
  }
  // Permissions-Policy: must lock down camera/mic/geo/FLoC at minimum.
  const pp = h["permissions-policy"] ?? "";
  expect(pp, `${path} → permissions-policy`).toContain("camera=()");
  expect(pp, `${path} → permissions-policy`).toContain("microphone=()");
  expect(pp, `${path} → permissions-policy`).toContain("geolocation=()");
  expect(pp, `${path} → permissions-policy`).toContain("interest-cohort=()");
};

test.describe("security headers — public routes", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`every required header present on ${path}`, async ({ request }) => {
      await assertHeaders(request, path);
    });
  }
});

test.describe("security headers — protected routes (on the redirect)", () => {
  for (const path of REDIRECTING_ROUTES) {
    test(`headers attached to the auth-redirect for ${path}`, async ({ request }) => {
      await assertHeaders(request, path, { allowRedirect: true });
    });
  }
});

test.describe("security headers — drift", () => {
  test("CSP value is identical across public routes", async ({ request }) => {
    const csps = await Promise.all(
      PUBLIC_ROUTES.map((p) => request.get(p, { maxRedirects: 0 }).then((r) => r.headers()["content-security-policy"])),
    );
    const first = csps[0];
    expect(first, "first route should have CSP").toBeDefined();
    for (const csp of csps) {
      expect(csp).toBe(first);
    }
  });
});
