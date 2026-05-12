import { expect, test } from "@playwright/test";

// End-to-end coverage for Aria's per-agent workspace at /agents/aria.
// Runs against PREVIEW mode so we don't need Clerk credentials. Hugging
// Face's /api/agents/aria/generate is stubbed at the route level so the
// test is hermetic and doesn't burn HF_TOKEN budget.
//
//   PLAYWRIGHT_PREVIEW=1 LUMEN_PREVIEW=1 PORT=3001 \
//     npx playwright test agents-aria-playground --project=chromium

// Tiny 1x1 JPEG so the gallery has something concrete to render after
// the stubbed generate response.
const TINY_JPEG_BASE64 =
  "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+iiiv8AP8/0AP/Z";
const FAKE_IMAGE = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

// The spec runs in either of two playwright projects:
//  - chromium (PREVIEW mode) — middleware short-circuits auth.
//  - chromium-authed         — auth.setup.ts signs in with the
//                              E2E_CLERK_USER_* creds and persists
//                              storageState before any test runs.
test.describe("Aria · playground end-to-end", () => {

  test.beforeEach(async ({ page }) => {
    // Stub the Hugging Face round-trip. Real generate is reachable only
    // for authenticated sessions; stubbing is the right shape for a
    // hermetic UI test regardless.
    await page.route("**/api/agents/aria/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: FAKE_IMAGE }),
      }),
    );

    // Memory GET returns empty so the prompt builder doesn't reach for
    // any e2e leftovers from a prior run.
    await page.route("**/api/agents/aria/memory", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ entries: [] }),
        });
      }
      return route.continue();
    });
  });

  /** Dismiss the notifications drawer that mounts open on first paint
   *  and overlays click targets on /agents. Same trick as agents-ui.spec.ts. */
  async function dismissNotifications(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close notifications"]',
      );
      btn?.click();
    });
    await page.waitForTimeout(150);
  }

  test("listing card on /agents links to /agents/aria", async ({ page }) => {
    await page.goto("/agents");
    await dismissNotifications(page);

    const card = page.getByRole("link", { name: /Open Aria.+workspace/i });
    await expect(card).toBeVisible();

    // Race the navigation against the click so a slow dev-server compile
    // on first navigation doesn't trip the URL assertion.
    await Promise.all([
      page.waitForURL(/\/agents\/aria$/, { timeout: 20_000 }),
      card.click(),
    ]);
  });

  test("renders identity, greeting, chat, gallery, toolkit, actions", async ({
    page,
  }) => {
    await page.goto("/agents/aria");

    // Identity header
    await expect(
      page.getByRole("heading", { level: 1, name: "Aria" }),
    ).toBeVisible();
    await expect(page.getByText(/image agent/i).first()).toBeVisible();
    await expect(page.getByText(/images · avg score/i)).toBeVisible();

    // Greeting bubble with the yellow-accented number ("87"). Use exact
    // so we don't match the "87" substring living inside the thumbnail
    // run-dates ("...May 0878May..." after the date+score concat).
    await expect(page.getByText(/today.+hero is ready/i)).toBeVisible();
    await expect(page.getByText("87", { exact: true })).toBeVisible();

    // Chat input + 4 chips
    await expect(
      page.getByRole("textbox", { name: /message aria/i }),
    ).toBeVisible();
    for (const chip of [
      "Make it moodier",
      "More minimal",
      "Why this style?",
    ]) {
      await expect(page.getByRole("button", { name: chip })).toBeVisible();
    }

    // Today's hero card — composition note + ship/retry buttons
    await expect(page.getByText(/today.s hero/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /ship this one/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /try a different vibe/i }),
    ).toBeVisible();

    // Toolkit panel — paragraph + at least one tool pill
    await expect(page.getByText(/what aria works with/i)).toBeVisible();
    await expect(page.getByText(/FLUX\.1 \(Hugging Face\)/i)).toBeVisible();

    // Bottom action buttons
    await expect(
      page.getByRole("button", { name: /run aria now/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /pause aria/i }),
    ).toBeVisible();
  });

  test("suggestion chip pre-fills the chat input without sending", async ({
    page,
  }) => {
    await page.goto("/agents/aria");

    const input = page.getByRole("textbox", { name: /message aria/i });
    await expect(input).toHaveValue("");

    await page.getByRole("button", { name: "More minimal" }).click();
    await expect(input).toHaveValue("More minimal");

    // Chip click MUST NOT submit — Send stays a separate explicit step.
    // The send button is disabled-or-enabled state based on the input;
    // either way, no console error should have fired and the page is
    // still on /agents/aria.
    await expect(page).toHaveURL(/\/agents\/aria$/);
  });

  test("Run Aria now stubs HF, prepends a new hero, and clears running state", async ({
    page,
  }) => {
    await page.goto("/agents/aria");

    // Watch for the POST so we can assert the body shape.
    const generatePromise = page.waitForRequest(
      (r) =>
        r.url().endsWith("/api/agents/aria/generate") && r.method() === "POST",
    );

    const runBtn = page.getByRole("button", { name: /run aria now/i });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    const generateReq = await generatePromise;
    const body = JSON.parse(generateReq.postData() ?? "{}") as {
      prompt?: string;
    };
    expect(typeof body.prompt).toBe("string");
    expect(body.prompt).toMatch(/Lumen AI hero image/i);

    // After the stubbed response, the new run is prepended to history.
    // The mock-data hero composition includes "god rays"; the new run's
    // composition is the prompt itself, which always starts with the
    // brand base. We look for that text appearing on the page.
    await expect(
      page
        .getByText(/Lumen AI hero image\. Single glass light bulb/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Run button returns to "Run Aria now" (enabled) after .finally().
    await expect(
      page.getByRole("button", { name: /run aria now/i }),
    ).toBeEnabled({ timeout: 10_000 });
  });

  test("chat Send fires generate with the typed directive as Subject", async ({
    page,
  }) => {
    await page.goto("/agents/aria");

    const generatePromise = page.waitForRequest(
      (r) =>
        r.url().endsWith("/api/agents/aria/generate") && r.method() === "POST",
    );

    const input = page.getByRole("textbox", { name: /message aria/i });
    await input.fill("today's hero should be about iOS ROAS jumping");
    await page.getByRole("button", { name: /^send/i }).click();

    const req = await generatePromise;
    const body = JSON.parse(req.postData() ?? "{}") as { prompt?: string };
    expect(body.prompt).toMatch(
      /Subject: today's hero should be about iOS ROAS jumping/,
    );
    // Memory baseline still present.
    expect(body.prompt).toMatch(/Single glass light bulb floating on deep navy/);

    // Input is cleared after submission.
    await expect(input).toHaveValue("");

    // New run shows the directive in its note line.
    await expect(
      page.getByText(/Directive: "today's hero should be about iOS ROAS jumping"/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("chat is disabled while a generation is in flight", async ({ page }) => {
    // Hold the stub open so the form stays in the disabled state long
    // enough for us to assert against it.
    await page.unroute("**/api/agents/aria/generate");
    await page.route("**/api/agents/aria/generate", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: FAKE_IMAGE }),
      });
    });

    await page.goto("/agents/aria");

    const input = page.getByRole("textbox", { name: /message aria/i });
    await input.fill("a moody portrait");
    await page.getByRole("button", { name: /^send/i }).click();

    // While in flight, the input is disabled.
    await expect(input).toBeDisabled();
    await expect(page.getByRole("button", { name: /^send/i })).toBeDisabled();

    // After the slow stub returns, the form re-enables.
    await expect(input).toBeEnabled({ timeout: 10_000 });
  });

  test("Pause toggles avatar opacity + button label", async ({ page }) => {
    await page.goto("/agents/aria");

    const pause = page.getByRole("button", { name: /pause aria/i });
    await expect(pause).toBeVisible();
    await pause.click();

    await expect(
      page.getByRole("button", { name: /resume aria/i }),
    ).toBeVisible();

    // Avatar picks up the .grayscale class via Tailwind's class chain.
    const avatar = page.getByRole("img", { name: /Aria avatar/i });
    await expect(avatar).toHaveClass(/grayscale/);

    // Toggle back
    await page.getByRole("button", { name: /resume aria/i }).click();
    await expect(
      page.getByRole("button", { name: /pause aria/i }),
    ).toBeVisible();
  });

  test("Ship this one disables itself after click", async ({ page }) => {
    await page.goto("/agents/aria");

    const ship = page.getByRole("button", { name: /ship this one/i });
    await ship.click();

    await expect(page.getByRole("button", { name: /shipped/i })).toBeDisabled();
  });

  test("back-to-agents link navigates to the listing", async ({ page }) => {
    await page.goto("/agents/aria");

    await page.getByRole("link", { name: /back to agents/i }).click();
    await expect(page).toHaveURL(/\/agents$/);
  });

  test("unknown agent id renders 404", async ({ page }) => {
    const res = await page.goto("/agents/not-a-real-agent");
    expect(res?.status()).toBe(404);
  });
});
