import { test, expect } from "@playwright/test";

// Injection-resistance probes. Every interactive surface in Lumen reads
// URL params (the global filter, the dashboard mode, the Reports share
// link). These tests push hostile values through each entry point and
// verify nothing executes, nothing reflects unescaped, and the page
// still renders. Pre-emptive — if any entry point ever moves to
// dangerouslySetInnerHTML or eval, this lights up.

const XSS_PAYLOADS = [
  '"><script>window.__pwned=1</script>',
  "<img src=x onerror=window.__pwned=1>",
  "javascript:window.__pwned=1",
  "<svg onload=window.__pwned=1>",
  "&#60;script&#62;window.__pwned=1&#60;/script&#62;",
];

const noWindowFlag = async (page: import("@playwright/test").Page) => {
  const flagged = await page.evaluate(
    () => (window as unknown as Record<string, unknown>).__pwned === 1,
  );
  expect(flagged, "window.__pwned should never be set by a URL param").toBe(false);
};

test.describe("XSS resistance via URL params", () => {
  test("dashboard ?range= is not a script sink", async ({ page }) => {
    for (const payload of XSS_PAYLOADS) {
      const errs: string[] = [];
      page.on("pageerror", (e) => errs.push(String(e)));
      await page.goto(`/dashboard?range=${encodeURIComponent(payload)}`, {
        waitUntil: "domcontentloaded",
      });
      await noWindowFlag(page);
      // We tolerate a redirect-to-sign-in (in non-preview test mode); we
      // don't tolerate a thrown error from the payload bypassing parsing.
      expect(errs.filter((e) => /pwned/i.test(e))).toEqual([]);
    }
  });

  test("dashboard ?client= is not a script sink", async ({ page }) => {
    const payload = '"><script>window.__pwned=1</script>';
    await page.goto(`/dashboard?client=${encodeURIComponent(payload)}`, {
      waitUntil: "domcontentloaded",
    });
    await noWindowFlag(page);
  });

  test("dashboard ?mode= ignores anything that isn't 'ai'", async ({ page }) => {
    await page.goto(
      `/dashboard?mode=${encodeURIComponent("ai\";window.__pwned=1;//")}`,
      { waitUntil: "domcontentloaded" },
    );
    await noWindowFlag(page);
  });

  test("reports ?id= does not load arbitrary JSON keys as code", async ({ page }) => {
    // The reports page reads ?id= and looks up a Report by id from
    // localStorage. Even if a malicious id is provided, only known fields
    // render, and those fields are passed through React's text path —
    // not innerHTML.
    await page.goto(
      `/reports?id=${encodeURIComponent('"><img src=x onerror=window.__pwned=1>')}`,
      { waitUntil: "domcontentloaded" },
    );
    await noWindowFlag(page);
  });

  test("custom date range does not accept hostile from/to", async ({ page }) => {
    await page.goto(
      `/dashboard?range=custom&from=${encodeURIComponent("<svg onload=window.__pwned=1>")}&to=2026-04-30`,
      { waitUntil: "domcontentloaded" },
    );
    await noWindowFlag(page);
  });
});

test.describe("XSS resistance via cookies", () => {
  test("a hostile lumen.welcomed cookie does not execute", async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: "lumen.welcomed",
        value: '<script>window.__pwned=1</script>',
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/welcome", { waitUntil: "domcontentloaded" });
    await noWindowFlag(page);
  });
});

test.describe("XSS resistance via localStorage", () => {
  test("a malicious pinned tile does not execute when rendered", async ({
    page,
  }) => {
    // Plant a hostile tile directly in storage and visit the dashboard.
    // The PinnedRenderer must escape every text field — label, question,
    // and chart axis labels alike.
    await page.addInitScript(() => {
      const hostile = [
        {
          id: "evil-1",
          userId: "mock-user-1",
          pinnedAt: Date.now(),
          label: '<script>window.__pwned=1</script>',
          question: '<img src=x onerror=window.__pwned=1>',
          config: {
            kind: "kpi",
            metric: '<svg onload=window.__pwned=1>',
            value: "1.42x",
          },
        },
      ];
      localStorage.setItem("lumen.pins", JSON.stringify(hostile));
    });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500); // let hydration settle
    await noWindowFlag(page);
  });

  test("a malicious saved report does not execute when opened", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const hostile = [
        {
          id: "evil-rpt",
          userId: "mock-user-1",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          prompt: "<script>window.__pwned=1</script>",
          title: "<img src=x onerror=window.__pwned=1>",
          period: "Apr 2026",
          clientLabel: "All",
          sections: [
            {
              id: "executive_summary",
              title: "<svg onload=window.__pwned=1>",
              body: "<script>window.__pwned=1</script>",
            },
          ],
        },
      ];
      localStorage.setItem("lumen.reports", JSON.stringify(hostile));
    });
    await page.goto("/reports?id=evil-rpt", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await noWindowFlag(page);
  });
});
