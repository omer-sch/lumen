import { test, expect } from "@playwright/test";

// File-based agent memory persistence (MVP). The "Save to agent memory" button
// in the Aria detail panel POSTs the most-recent run's verdict, score, and note
// to /api/agents/aria/memory, which appends the entry to
// data/agents/aria/memory.json. These tests pin the UI→API contract and the
// round-trip through the route handler.
//
// Run mode: this suite drives /agents and /api/agents/* directly, both of
// which are gated by Clerk in normal mode. Rather than depend on the Clerk
// e2e credentials (which aren't always provisioned in dev environments), the
// suite runs against a server started with LUMEN_PREVIEW=1 — the same auth
// bypass used for local design work. The probe below skips the suite cleanly
// if the running server isn't in PREVIEW mode, so this spec stays inert in
// the default Playwright run.
//
//   LUMEN_PREVIEW=1 PORT=3001 npx playwright test agents-memory --project=chromium
//
// The first test intercepts the POST so it does not pollute the on-disk store.
// The second test exercises the real route end-to-end with a uniquely scoped
// runId.

test.describe("agents · memory persistence", () => {
  test.beforeAll(async ({ request }) => {
    const probe = await request.get("/api/agents/aria/memory", {
      maxRedirects: 0,
    });
    test.skip(
      probe.status() !== 200,
      "agents-memory specs require the dev server to run with LUMEN_PREVIEW=1 " +
        "so /agents and /api/agents/* are reachable without a Clerk session.",
    );
  });

  test("Save to agent memory POSTs runId/thumbs/note/score", async ({
    page,
  }) => {
    let captured: Record<string, unknown> | null = null;

    // Intercept memory route. POST is asserted; GET is short-circuited so the
    // page never reads a real on-disk entry that could shift behaviour.
    await page.route("**/api/agents/aria/memory", async (route) => {
      const req = route.request();
      if (req.method() === "POST") {
        captured = JSON.parse(req.postData() ?? "{}");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [] }),
      });
    });

    await page.goto("/agents");

    // Open Aria's detail panel — the card's accessible name starts with
    // "Aria avatar Aria".
    await page.getByRole("button", { name: /^Aria avatar Aria/ }).click();

    const detail = page.locator('[id="agent-detail-aria"]');
    await expect(detail).toBeVisible();

    // Click "Good run" and confirm the pressed state before saving — this
    // guards against a regression where the verdict didn't make it into the
    // POST body.
    await detail.getByRole("button", { name: "Good run" }).click();
    await expect(
      detail.getByRole("button", { name: "Good run" }),
    ).toHaveAttribute("aria-pressed", "true");

    const NOTE = `e2e memory test ${Date.now()}`;
    await detail.getByRole("textbox", { name: /Note for Aria/i }).fill(NOTE);

    // Wait for the POST while clicking, so we don't race the network.
    const [request] = await Promise.all([
      page.waitForRequest(
        (r) =>
          r.url().endsWith("/api/agents/aria/memory") && r.method() === "POST",
      ),
      detail.getByRole("button", { name: /Save to agent memory/i }).click(),
    ]);

    expect(request.method()).toBe("POST");
    expect(captured).toMatchObject({
      runId: "aria-run-1", // mostRecent is the first item in mock history
      thumbs: "up",
      note: NOTE,
      score: 81, // initial score in mock data
      date: "May 09",
    });

    // The "Saved" toast should appear after the POST resolves.
    await expect(detail.getByText(/Saved to Aria.*memory/i)).toBeVisible();
  });

  test("memory route round-trips a POST and surfaces it on GET", async ({
    request,
  }) => {
    // Hits the real route handler which writes to
    // data/agents/aria/memory.json. We use a unique runId so we can find and
    // identify our entry; we don't try to clean up the file because the route
    // doesn't expose a delete and the developer-local store is gitignored.
    const uniqueRunId = `e2e-roundtrip-${Date.now()}`;

    const post = await request.post("/api/agents/aria/memory", {
      data: {
        runId: uniqueRunId,
        thumbs: "down",
        note: "round-trip probe",
        score: 42,
        date: "May 10",
      },
    });
    expect(post.ok()).toBe(true);
    expect(await post.json()).toEqual({ ok: true });

    const get = await request.get("/api/agents/aria/memory");
    expect(get.ok()).toBe(true);
    const body = (await get.json()) as {
      entries: Array<{
        runId: string;
        thumbs: "up" | "down" | null;
        note: string;
        score: number;
        date: string;
        savedAt: string;
      }>;
    };
    expect(Array.isArray(body.entries)).toBe(true);

    const found = body.entries.find((e) => e.runId === uniqueRunId);
    expect(found, "POSTed entry should appear in subsequent GET").toBeDefined();
    expect(found).toMatchObject({
      runId: uniqueRunId,
      thumbs: "down",
      note: "round-trip probe",
      score: 42,
      date: "May 10",
    });
    // The route stamps savedAt server-side as an ISO string.
    expect(found?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
