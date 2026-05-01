import { test, expect } from "@playwright/test";

// Bundle / page scanning for accidental secret leaks. The two ways a
// production secret can leak into a Next.js app:
//   1) NEXT_PUBLIC_* env var that should have been server-only
//   2) A secret hard-coded into the JS bundle by mistake
// These tests fetch the rendered HTML for /sign-in (a public surface
// that loads Clerk + brand chrome — the heaviest surface a leak would
// likely sit on) and pattern-match against known secret formats.

// Patterns we never want to see on the wire. Each pattern targets the
// canonical shape of the secret as the issuer publishes it; if any
// matches, a real key has been leaked.
const SECRET_PATTERNS: { name: string; pat: RegExp }[] = [
  { name: "Anthropic API key",     pat: /sk-ant-[a-z0-9_-]{32,}/i },
  { name: "OpenAI API key",        pat: /sk-(?:proj-)?[a-z0-9_-]{40,}/i },
  { name: "Clerk SECRET key",      pat: /sk_(?:test|live)_[a-z0-9]{40,}/i },
  { name: "AWS access key",        pat: /AKIA[0-9A-Z]{16}/ },
  { name: "Google API key",        pat: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: "Generic JWT",           pat: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: "GitHub PAT",            pat: /ghp_[A-Za-z0-9]{36}/ },
  { name: "Stripe secret",         pat: /sk_(?:test|live)_[A-Za-z0-9]{24}/ },
  { name: "Slack token",           pat: /xox[abp]-[A-Za-z0-9-]{10,}/ },
  { name: "Private key block",     pat: /-----BEGIN (?:RSA|EC|OPENSSH|PRIVATE) KEY-----/ },
];

const fetchAllScripts = async (page: import("@playwright/test").Page): Promise<string[]> => {
  const srcs = await page.locator("script[src]").evaluateAll((nodes) =>
    nodes
      .map((n) => (n as HTMLScriptElement).src)
      .filter((s) => s && s.startsWith(window.location.origin)),
  );
  // Deduplicate.
  return [...new Set(srcs)];
};

test.describe("secrets — page HTML", () => {
  test("/sign-in HTML carries no recognisable secret", async ({ request }) => {
    const html = await (await request.get("/sign-in")).text();
    for (const { name, pat } of SECRET_PATTERNS) {
      const m = html.match(pat);
      // Clerk's PUBLIC publishable key starts with `pk_test_` or `pk_live_`
      // and is intended to ship to the browser — we don't flag those.
      // Anything matching SECRET-shape patterns is a real leak.
      expect(m, `Found possible ${name} in /sign-in HTML: ${m?.[0]}`).toBeNull();
    }
  });
});

test.describe("secrets — JS chunks", () => {
  test("first-party JS chunks carry no recognisable secret", async ({
    page,
    request,
  }) => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    const scripts = await fetchAllScripts(page);
    expect(scripts.length, "expected first-party scripts").toBeGreaterThan(0);

    for (const url of scripts) {
      const r = await request.get(url);
      if (!r.ok()) continue;
      const body = await r.text();
      for (const { name, pat } of SECRET_PATTERNS) {
        const m = body.match(pat);
        expect(m, `Found possible ${name} in ${url}: ${m?.[0]}`).toBeNull();
      }
    }
  });
});

test.describe("secrets — env exposure", () => {
  test("no NEXT_PUBLIC_ var with a secret-y suffix appears in HTML", async ({
    request,
  }) => {
    // Catches the classic mistake of exposing a backend secret via
    // NEXT_PUBLIC_*. The pattern matches anything that looks like an
    // env-var dump containing words like SECRET / PRIVATE / KEY.
    const html = await (await request.get("/sign-in")).text();
    const suspicious = /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|API_KEY)/i.exec(html);
    expect(suspicious, suspicious?.[0]).toBeNull();
  });

  test("no source map URLs ship in the HTML", async ({ request }) => {
    // Source maps in production leak the original TypeScript and any
    // strings that lived there. next.config.ts sets
    // productionBrowserSourceMaps: false — this is the regression guard.
    const html = await (await request.get("/sign-in")).text();
    expect(html).not.toMatch(/sourceMappingURL=[^"]+\.map/);
  });
});
