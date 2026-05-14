import { test, expect, type Route } from "@playwright/test";

// Authenticated state is provisioned by a sibling fixture build step.
test.use({ storageState: "tests/.auth/user.json" });

// Same hermeticism contract as ask.spec.ts: today's flow is a local mock,
// but if anything ever fetches an LLM endpoint we want to neutralise it
// at the network layer before it can make a real call.
const stubExternalAi = async (route: Route) => {
  const url = route.request().url();
  if (/anthropic\.com|openai\.com/i.test(url)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, sections: [] }),
    });
    return;
  }
  await route.continue();
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", stubExternalAi);
});

const generateReport = async (page: import("@playwright/test").Page, prompt: string) => {
  const textarea = page.getByRole("textbox", { name: /generate report|cover|report.*prompt/i }).first();
  await textarea.fill(prompt);
  await page.getByRole("button", { name: /generate report/i }).click();
  // The report doc is an <article data-report-doc> — it's the most stable
  // signal that AI generation has finished and the editable doc is mounted.
  await expect(page.locator("article[data-report-doc]")).toBeVisible({ timeout: 15_000 });
};

test.describe("reports page — builder input", () => {
  test("renders a plain-text prompt textarea on first load", async ({ page }) => {
    await page.goto("/reports");

    const textarea = page.locator("textarea#report-prompt");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();

    // Submit is disabled until the user types — confirms the field is wired
    // to the form's submit button rather than just being decorative.
    const submit = page.getByRole("button", { name: /generate report/i });
    await expect(submit).toBeDisabled();
    await textarea.fill("Weekly UA performance summary");
    await expect(submit).toBeEnabled();
  });
});

test.describe("reports page — generated document", () => {
  test("renders the yellowHEAD platform + channel sections after generation", async ({ page }) => {
    await page.goto("/reports");
    await generateReport(
      page,
      "Weekly UA performance summary with channel breakdown and recommendations",
    );

    const doc = page.locator("article[data-report-doc]");
    // yellowHEAD format renders three SectionDividers: Android (overall),
    // Meta (weekly breakdown), Meta (campaign breakdown). The divider is
    // role=separator with a stable aria-label, which is more reliable
    // than scraping the visual h2 (two of them carry the same text).
    await expect(
      doc.getByRole("separator", { name: /android/i }),
    ).toBeVisible();
    await expect(
      doc.getByRole("separator", { name: /meta.*weekly breakdown/i }),
    ).toHaveCount(1);
    await expect(
      doc.getByRole("separator", { name: /meta.*campaign breakdown/i }),
    ).toHaveCount(1);
  });

  test("the report header shows the Nova byline directly under the title", async ({
    page,
  }) => {
    await page.goto("/reports");
    await generateReport(page, "Weekly UA performance summary for GlobalComix");

    const doc = page.locator("article[data-report-doc]");
    // Mock generator stamps `authoredBy: "nova"` on every report — the
    // byline primitive renders a stable data-testid we can pin on.
    const byline = doc.locator('[data-testid="agent-byline-nova"]');
    await expect(byline).toBeVisible();
    await expect(byline.getByText(/drafted by/i)).toBeVisible();
    await expect(byline.getByText("Nova", { exact: true })).toBeVisible();
  });

  test("title and action-item commentary are editable in place", async ({ page }) => {
    await page.goto("/reports");
    await generateReport(page, "Top 5 campaigns this period and what to do next");

    // yellowHEAD format renders editable surfaces for: the cover title +
    // one action-item textbox per commentary group (three groups in the
    // Meta campaign section). Four total.
    const editables = page.locator("article[data-report-doc] [role='textbox']");
    expect(await editables.count()).toBeGreaterThanOrEqual(4);

    // The report title is contentEditable — verify a real edit lands in the DOM.
    const titleBox = page.getByRole("textbox", { name: /report title/i });
    await titleBox.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("My edited report title");
    await expect(titleBox).toHaveText(/my edited report title/i);
  });

  test("exposes a share link affordance and PDF + PPTX export affordances", async ({ page }) => {
    await page.goto("/reports");
    await generateReport(page, "Channel-level read with creative recommendations");

    // The action bar only mounts once a report is active. Accessible
    // names match the visible button text (no aria-label).
    await expect(
      page.getByRole("button", { name: /share link/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^pdf$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^pptx$/i })).toBeVisible();
  });

  test("clicking the share button copies a /reports?id=… deep link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/reports");
    await generateReport(page, "Weekly UA summary");

    await page.getByRole("button", { name: /share link/i }).click();
    // The button swaps to "Copied" once the clipboard write resolves —
    // that's the user-visible confirmation the share link was produced.
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible();

    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/\/reports\?id=rpt_/);
  });

  test("a long prompt produces a title trimmed on a word boundary, not mid-word", async ({
    page,
  }) => {
    await page.goto("/reports");
    // 90+ chars, deliberately chosen so the legacy 80-char slice would
    // have cut "recommendations" into "recommenda".
    await generateReport(
      page,
      "Weekly UA performance summary for GlobalComix with top campaigns and recommendations across every channel",
    );

    const titleBox = page.getByRole("textbox", { name: /report title/i });
    const text = (await titleBox.textContent())?.trim() ?? "";
    // The legacy 80-char slice produced "...and recommenda". A
    // word-boundary trim never lands there.
    expect(text).not.toMatch(/recommenda$/);
    expect(text.endsWith(" ")).toBe(false);
    // The title still leads with the prompt's first words.
    expect(text.toLowerCase()).toMatch(/^weekly ua performance summary/);
  });

  // The "Export PDF" affordance currently calls window.print() rather than
  // producing an actual PDF. Until a real export pipeline ships, we can't
  // assert the PDF artefact — only the affordance, which is covered above.
  test.fixme(
    "export PDF actually produces a downloadable PDF artefact",
    async () => {
      // Awaiting a real export implementation — today this just triggers
      // the browser print dialog, which Playwright cannot intercept cleanly.
    },
  );
});

test.describe("reports page — saved reports list", () => {
  test("a generated report appears in the saved-reports sidebar", async ({ page }) => {
    await page.goto("/reports");
    await generateReport(page, "Weekly UA performance summary");

    const sidebar = page.getByRole("complementary", { name: /saved reports/i });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText(/Saved · \d+/i)).toBeVisible();

    // The new-report CTA is the always-on entry point on the sidebar —
    // its presence is what makes this column the "saved reports" column
    // even when the underlying store is empty.
    await expect(
      sidebar.getByRole("button", { name: /new report/i }),
    ).toBeVisible();
  });

  test("the browser never calls Anthropic while generating a report", async ({ page }) => {
    const offenders: string[] = [];
    page.on("request", (req) => {
      if (/anthropic\.com/i.test(req.url())) offenders.push(req.url());
    });

    await page.goto("/reports");
    await generateReport(page, "Top 5 campaigns this period");

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
