import { test, expect, type Route } from "@playwright/test";

// Authenticated state is provisioned by a sibling fixture build step.
test.use({ storageState: "tests/.auth/user.json" });

// Hermetic by design: the Ask flow today is fully client-side mock
// (askLumen → setTimeout → deterministic answer). There is no real
// Anthropic call to intercept, but we still install network guards so:
//   1. if a future commit wires fetch() into the flow, these tests fail loudly
//   2. nothing the browser does ever leaks to api.anthropic.com
const blockExternalAi = async (route: Route) => {
  const url = route.request().url();
  if (/anthropic\.com|openai\.com|googleapis\.com\/.*\/generate/i.test(url)) {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        narration: "Stubbed AI response",
        config: { kind: "kpi", metric: "ROAS", value: "0.00x", delta: 0, deltaLabel: "stub", direction: "higher-better" },
      }),
    });
    return;
  }
  await route.continue();
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", blockExternalAi);
});

test.describe("ask page — surface", () => {
  test("renders the NL input, focuses it, and shows the global filter context", async ({ page }) => {
    await page.goto("/queries");

    // Per spec: full-width plain-English input is the hero.
    const input = page.getByRole("textbox", { name: /ask lumen/i });
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
    // autoFocus={true} on the AskInput — the field should hold focus on load.
    await expect(input).toBeFocused();

    // The "global filter feeds in as context" promise is rendered as copy
    // near the input — the day window is part of the visible string.
    await expect(
      page.getByText(/global filter.*\d+-day window feed.*default context/i),
    ).toBeVisible();
  });

  test("first load with no history shows the empty-state explainer", async ({ page }) => {
    await page.goto("/queries");

    // AskExplainer renders the four "kinds" Lumen can produce. It is the
    // only thing that distinguishes empty state from a post-answer state.
    const explainer = page.getByRole("region", { name: /what you can ask/i });
    await expect(explainer).toBeVisible();
    await expect(explainer.getByText(/KPI/)).toBeVisible();
    await expect(explainer.getByText(/Trend/)).toBeVisible();
    await expect(explainer.getByText(/Comparison/)).toBeVisible();
    await expect(explainer.getByText(/Top-N/)).toBeVisible();

    // History section must not be present until at least 2 queries exist.
    await expect(
      page.getByRole("region", { name: /query history/i }),
    ).toHaveCount(0);
  });
});

test.describe("ask page — query → answer", () => {
  test("submitting a question renders an answer card with a Pin button", async ({ page }) => {
    await page.goto("/queries");

    const input = page.getByRole("textbox", { name: /ask lumen/i });
    await input.fill("What's our UA ROAS this week?");
    await page.getByRole("button", { name: /^ask$/i }).click();

    // The answer card carries the "Lumen says" eyebrow — that's the
    // signal the chart output area has rendered.
    await expect(page.getByText(/lumen says/i)).toBeVisible({ timeout: 10_000 });

    // The original question is echoed back in italic inside the card.
    await expect(page.getByText(/UA ROAS this week/i)).toBeVisible();

    // Per spec: every generated chart has a Pin button.
    await expect(
      page.getByRole("button", { name: /pin to dashboard/i }),
    ).toBeVisible();
  });

  test("the answer card credits the building agent in a byline", async ({
    page,
  }) => {
    await page.goto("/queries");

    const input = page.getByRole("textbox", { name: /ask lumen/i });
    await input.fill("Spend trend over the last 30 days");
    await page.getByRole("button", { name: /^ask$/i }).click();

    // Every router answer is `answeredBy: "aria"` today — the byline
    // primitive is the user-visible attribution and must render before the
    // narration on every answer.
    const byline = page.locator('[data-testid="agent-byline-aria"]');
    await expect(byline).toBeVisible({ timeout: 10_000 });
    await expect(byline.getByText(/built by/i)).toBeVisible();
    await expect(byline.getByText("Aria", { exact: true })).toBeVisible();
  });

  test("the browser never calls Anthropic during a query", async ({ page }) => {
    const offenders: string[] = [];
    page.on("request", (req) => {
      if (/anthropic\.com/i.test(req.url())) offenders.push(req.url());
    });

    await page.goto("/queries");
    await page
      .getByRole("textbox", { name: /ask lumen/i })
      .fill("Spend trend over the last 30 days");
    await page.getByRole("button", { name: /^ask$/i }).click();
    await expect(page.getByText(/lumen says/i)).toBeVisible({ timeout: 10_000 });

    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

test.describe("ask page — history", () => {
  test("a second query reveals the recent queries section with the prior question", async ({ page }) => {
    await page.goto("/queries");

    const ask = async (q: string) => {
      const input = page.getByRole("textbox", { name: /ask lumen/i });
      await input.fill(q);
      await page.getByRole("button", { name: /^ask$/i }).click();
      // Wait for the answer card to settle before firing the next one.
      await expect(page.getByText(/lumen says/i)).toBeVisible({ timeout: 10_000 });
    };

    await ask("What's our UA ROAS this week?");
    await ask("Compare ROAS by channel");

    // History only renders after 2+ queries (history.length > 1 in the source).
    const history = page.getByRole("region", { name: /query history/i });
    await expect(history).toBeVisible();
    // The earlier question is rebuildable as a clickable history button.
    await expect(
      history.getByRole("button", { name: /UA ROAS this week/i }),
    ).toBeVisible();
  });
});
