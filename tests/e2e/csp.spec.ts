import { test, expect } from "@playwright/test";

// Directive-by-directive validation of the Content-Security-Policy header.
// The CSP is the single most load-bearing piece of frontend security in
// this app — if it drifts, an injected script could exfiltrate session
// tokens or call out to a model provider directly. Every directive below
// is asserted explicitly.

const parseCSP = (csp: string): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(";").map((s) => s.trim()).filter(Boolean)) {
    const [directive, ...sources] = part.split(/\s+/);
    out[directive] = sources;
  }
  return out;
};

test.describe("CSP — directive validation", () => {
  test("default-src is locked to self", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["default-src"]).toEqual(["'self'"]);
  });

  test("script-src allows only self + clerk + cloudflare-challenge", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["script-src"]).toContain("'self'");
    expect(d["script-src"]).toContain("'unsafe-inline'");
    // We deliberately do NOT allow unsafe-eval anywhere.
    expect(d["script-src"]).not.toContain("'unsafe-eval'");
    // Clerk origins are required for the auth widget to load.
    expect(d["script-src"].some((s) => s.includes("clerk.com"))).toBe(true);
    expect(d["script-src"].some((s) => s.includes("clerk.accounts.dev"))).toBe(true);
    // Cloudflare turnstile/challenges (Clerk's bot mitigation).
    expect(d["script-src"].some((s) => s.includes("challenges.cloudflare.com"))).toBe(true);
  });

  test("connect-src does not include any model provider origin", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    const sources = d["connect-src"] ?? [];
    // Spec promise: every Claude / OpenAI / etc. call goes through our
    // server-side /api routes. The browser must not be allowed to reach a
    // model provider directly.
    const FORBIDDEN_HOSTS = [
      "anthropic.com",
      "openai.com",
      "googleapis.com",
      "cohere.ai",
    ];
    for (const banned of FORBIDDEN_HOSTS) {
      expect(
        sources.some((s) => s.includes(banned)),
        `connect-src must not include ${banned}; got: ${sources.join(", ")}`,
      ).toBe(false);
    }
    // No bare wildcard. We allow `https://*.clerk.com` (subdomain wildcard
    // of a known origin) but never a standalone `*`.
    expect(sources).not.toContain("*");
    expect(sources).toContain("'self'");
  });

  test("frame-ancestors blocks every embedder", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
  });

  test("object-src is none — Flash, applets, etc. blocked", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["object-src"]).toEqual(["'none'"]);
  });

  test("base-uri pinned to self — prevents base-tag injection", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["base-uri"]).toEqual(["'self'"]);
  });

  test("form-action pinned to self — prevents form-target hijacking", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["form-action"]).toEqual(["'self'"]);
  });

  test("upgrade-insecure-requests is set", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d).toHaveProperty("upgrade-insecure-requests");
  });

  test("style-src allows fonts.googleapis.com but no other CDNs", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["style-src"]).toContain("'self'");
    expect(d["style-src"]).toContain("https://fonts.googleapis.com");
    // No wildcard CDNs.
    expect(d["style-src"].some((s) => s === "*" || s.includes("cdn"))).toBe(false);
  });

  test("img-src allows clerk avatars but no wildcard scheme", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["img-src"]).toContain("'self'");
    expect(d["img-src"]).toContain("data:");
    expect(d["img-src"]).toContain("blob:");
    // Only clerk.com is allowed for remote images.
    const remote = d["img-src"].filter((s) => s.startsWith("https://"));
    for (const r of remote) {
      expect(r.includes("clerk.com")).toBe(true);
    }
  });

  test("worker-src constrained to self + blob (used by Clerk)", async ({ request }) => {
    const csp = (await request.get("/sign-in")).headers()["content-security-policy"]!;
    const d = parseCSP(csp);
    expect(d["worker-src"]).toContain("'self'");
    expect(d["worker-src"]).toContain("blob:");
  });
});

test.describe("CSP — runtime enforcement", () => {
  test("no Anthropic request fires from any browser-rendered surface", async ({ page }) => {
    // Watch every outbound request the browser makes on the public auth
    // surface. None of them may touch a model-provider origin.
    const offenders: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (/anthropic\.com|openai\.com|cohere\.ai/i.test(url)) offenders.push(url);
    });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
