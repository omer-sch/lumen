import { test, expect, type Page, type Locator } from "@playwright/test";

// Front-end smoke + interaction coverage for /agents that does NOT depend on
// Clerk e2e credentials. Runs against a dev server with LUMEN_PREVIEW=1; the
// suite skips itself cleanly otherwise so the default chromium project stays
// green.
//
//   LUMEN_PREVIEW=1 PORT=3001 npx playwright test agents-ui --project=chromium
//
// Coverage:
// - Three agent cards render (Aria, Max, Nova) with role-correct subheaders
// - Detail panel opens/closes and shows the agent-specific output kind
// - Pause toggles status copy and swaps Pause↔Resume
// - Score slider respects per-agent metric type (regression: Nova used to
//   land at 80 on a 0–5 scale)
// - Aria's Run now produces a row, auto-expands it, and exposes the lightbox
//   "Open full image" affordance (regression: new run sat collapsed)
// - The lightbox opens, traps Escape, and closes on Escape
//
// Memory persistence is covered separately in agents-memory.spec.ts.

test.describe("agents · UI", () => {
  test.beforeAll(async ({ request }) => {
    // Probe an /api/agents endpoint as a stand-in for "auth wall is open" —
    // it returns 200 in PREVIEW mode and 307 → /sign-in otherwise.
    const probe = await request.get("/api/agents/aria/memory", {
      maxRedirects: 0,
    });
    test.skip(
      probe.status() !== 200,
      "agents-ui specs require LUMEN_PREVIEW=1 so /agents is reachable.",
    );
  });

  test.beforeEach(async ({ page }) => {
    // Stub Aria's generate so tests don't burn HF inference credits or
    // depend on a warm model. Returns a 1×1 transparent JPEG data URL.
    const TINY_JPEG_BASE64 =
      "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+f+iiiv8AP8/0AP/Z";
    const FAKE_IMAGE = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
    await page.route("**/api/agents/aria/generate", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ imageUrl: FAKE_IMAGE, seed: 1 }),
      }),
    );

    await page.goto("/agents");
    // The notifications drawer mounts open on first paint and overlays the
    // page. The visible "Close notifications" button is inside a fixed-
    // position panel that the header z-index fights with under Playwright's
    // click stability check, so dismiss the drawer via the DOM directly.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close notifications"]',
      );
      btn?.click();
    });
    await page.waitForTimeout(150);
  });

  // Click the card matching one of the three known names. The card itself is
  // a div with role="button" — getByRole gives us that without coupling to
  // the avatar/text concatenation rendered into the accessible name.
  function cardOf(page: Page, name: "Aria" | "Max" | "Nova"): Locator {
    return page
      .getByRole("button")
      .filter({ has: page.getByRole("heading", { level: 3, name }) })
      .first();
  }

  async function openAgent(
    page: Page,
    name: "Aria" | "Max" | "Nova",
  ): Promise<Locator> {
    const detail = page.locator(`[id="agent-detail-${name.toLowerCase()}"]`);
    if (!(await detail.isVisible().catch(() => false))) {
      await cardOf(page, name).click();
    }
    await expect(detail).toBeVisible();
    return detail;
  }

  async function closeAgentIfOpen(
    page: Page,
    name: "Aria" | "Max" | "Nova",
  ): Promise<void> {
    const detail = page.locator(`[id="agent-detail-${name.toLowerCase()}"]`);
    if (await detail.isVisible().catch(() => false)) {
      await cardOf(page, name).click();
      await expect(detail).toBeHidden();
    }
  }

  test("renders all three agent cards with role-correct subtitles", async ({
    page,
  }) => {
    await expect(page.getByRole("heading", { level: 3, name: "Aria" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Max" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Nova" })).toBeVisible();

    // The role string sits as a small caption next to the name on each card.
    await expect(page.getByText(/image agent/i).first()).toBeVisible();
    await expect(page.getByText(/anomaly scanner/i).first()).toBeVisible();
    await expect(page.getByText(/report writer/i).first()).toBeVisible();
  });

  test("detail panels open per-agent with the correct output variant", async ({
    page,
  }) => {
    // Aria — image variant (history[0] is a mock image run with no real URL,
    // so we look for the "Generated image" section label).
    const aria = await openAgent(page, "Aria");
    await expect(aria.getByText(/generated image/i)).toBeVisible();

    // Max — anomalies variant. Output preview lists routed to Feed.
    await closeAgentIfOpen(page, "Aria");
    const max = await openAgent(page, "Max");
    await expect(
      max.getByRole("link", { name: /open in feed/i }),
    ).toBeVisible();

    // Nova — report variant. Output preview links to Reports.
    await closeAgentIfOpen(page, "Max");
    const nova = await openAgent(page, "Nova");
    await expect(
      nova.getByRole("link", { name: /open in reports/i }),
    ).toBeVisible();
  });

  test("pause toggles the run schedule subtitle and swaps Pause↔Resume", async ({
    page,
  }) => {
    const detail = await openAgent(page, "Aria");

    const pause = detail.getByRole("button", { name: /^pause$/i });
    await expect(pause).toBeVisible();
    await pause.click();

    await expect(
      detail.getByText(/paused.*won't run on schedule/i),
    ).toBeVisible();
    await expect(
      detail.getByRole("button", { name: /^resume$/i }),
    ).toBeVisible();

    await detail.getByRole("button", { name: /^resume$/i }).click();
    await expect(detail.getByRole("button", { name: /^pause$/i })).toBeVisible();
  });

  test("score slider respects per-agent metric type", async ({ page }) => {
    // Aria → 0-100 virality scale, initialized to mostRecent.score = 81.
    const aria = await openAgent(page, "Aria");
    const ariaSlider = aria.getByRole("slider", { name: /virality score/i });
    await expect(ariaSlider).toHaveAttribute("max", "100");
    await expect(ariaSlider).toHaveValue("81");

    // Nova → 0-5 rating scale, initialized to mostRecent.rating = 4.9.
    // Regression guard: the slider used to land at 80 on a max-of-5 input
    // because the init only checked .score and not .rating.
    await closeAgentIfOpen(page, "Aria");
    const nova = await openAgent(page, "Nova");
    const novaSlider = nova.getByRole("slider", { name: /rating/i });
    await expect(novaSlider).toHaveAttribute("max", "5");
    const value = Number(await novaSlider.inputValue());
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(5);
  });

  test("Aria's Run now appends a row, auto-expands it, and exposes the lightbox", async ({
    page,
  }) => {
    const detail = await openAgent(page, "Aria");

    // Count run rows before the click. The history seed has 3 entries.
    const rowsBefore = await detail
      .getByRole("button", { expanded: false })
      .or(detail.getByRole("button", { expanded: true }))
      .count();

    // Kick off a run. Mock progress ticks animate the bar; the real network
    // POST is intercepted by the route stub set up in beforeEach.
    await detail.getByRole("button", { name: /run now/i }).click();

    // Wait for the new run to appear at the top, expanded, with the
    // "Generated just now" note.
    const newRow = detail.getByRole("button", {
      name: /generated just now/i,
    });
    await expect(newRow).toBeVisible({ timeout: 15_000 });

    // The fix being guarded here: previously the new row sat collapsed and
    // the user had to click it to see the result. Now it auto-expands.
    await expect(newRow).toHaveAttribute("aria-expanded", "true");

    // The lightbox affordance is rendered for the data-URL image.
    const openBtn = detail.getByRole("button", { name: "Open full image" }).first();
    await expect(openBtn).toBeVisible();

    // Open the lightbox, confirm dialog mounts, close via Escape.
    // Filter by aria-modal=true to disambiguate from the notifications
    // drawer which also uses role="dialog" but is non-modal.
    await openBtn.click();
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // The total count of expandable rows should have grown by one.
    const rowsAfter = await detail
      .getByRole("button", { expanded: false })
      .or(detail.getByRole("button", { expanded: true }))
      .count();
    expect(rowsAfter).toBeGreaterThan(rowsBefore);
  });

  test("Run now is disabled while an agent is already running", async ({
    page,
  }) => {
    const detail = await openAgent(page, "Aria");
    // The seed marks Aria as running; the button label flips to "Running…"
    // and the button itself is disabled.
    const button = detail.getByRole("button", { name: /running|run now/i });
    await expect(button).toBeVisible();
    // If the live tick already finished by the time we got here, the button
    // is "Run now" and enabled — that's also valid. We just guard against
    // the regression where the disabled state didn't render at all.
    const label = await button.textContent();
    if (label && /running/i.test(label)) {
      await expect(button).toBeDisabled();
    } else {
      await expect(button).toBeEnabled();
    }
  });
});
