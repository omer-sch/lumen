# Hermes deck quality fixes: platform filter, trailing history, authoredBy, immature-metric rendering, prose-arrow binding, ISO date extraction (2026-05-17)

Owner: Omer. Single PR on a new branch off `main`. Six small workstreams that fix every visible defect in the live Hermes deck shipped today.

## TL;DR

The Hermes-generated deck for Emily's "iOS Meta" email opened with the cover credited to Nova, the body slides labeled "Android | Meta" while the campaign table and prose talked about iOS campaigns, no trailing-history table beneath the Weekly Breakdown, immature D7 metrics rendering as `$0.00` instead of `—`, and colored arrows on the campaign table with no matching colored phrases in the prose underneath.

Six fixes ordered by risk:

1. **WS1** -- `authoredBy: "hermes"` on Hermes runs. One-line patch.
2. **WS2** -- Restore the trailing-history table in the multi-section template.
3. **WS3** -- Immature cohort cells render as em-dash, not `$0.00`.
4. **WS4** -- Filter campaigns by platform via `campaign_name` substring so an "Android" chapter only contains Android campaigns.
5. **WS5** -- Make the colored phrase highlights actually bind to the row arrows.
6. **WS6** -- `parse_intent` extracts ISO date bounds for both relative and explicit phrasing.

Each is independently shippable. Bundle them as one PR so a single Hermes run validates all six.

---

## WS1 -- authoredBy reflects the workflow agent

### Today

Every report stamped by Smart Reports carries `authoredBy: "nova"`, including Hermes runs that should credit the workflow. The cover renders "Drafted by Nova · Report Writer" even when the user submitted via the paste-email modal.

### Files

- `src/lib/smart-reports/index.ts` -- two call sites: `composeSingleChannelWeekly` (~line 233) and `composeWeeklyReviewGlobalcomix` (~line 370)
- `tests/unit/lib/smart-reports/compose-report.test.ts`

### Change

```ts
authoredBy: args.runId ? "hermes" : "nova",
```

The signal is already correct: `args.runId` is set when Hermes calls `composeReport`, unset for the manual builder.

If the cover renderer needs a different display label per agent ("Drafted by Nova" vs "Drafted by Hermes"), confirm with Omer; the underlying field swap is the contract change.

### Acceptance

- Compose with `runId: "abc"` returns `report.authoredBy === "hermes"`.
- Compose without `runId` returns `report.authoredBy === "nova"`.
- Hermes run cover reads "Drafted by Hermes · Report Writer" (or whatever label maps to the new id).

---

## WS2 -- Trailing-history table restored to Weekly Breakdown

### Today

`buildChapter` in `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` sets `history: []` on the `channel_weekly` section unconditionally. Comment in the file says "trailing-week table renders elsewhere; phase 2 does not change history projection." `ReadyData.history.networks` has the data (the analyst layer's `fetchTrailingWeeks` populates it). The template just doesn't pass it through.

### Files

- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` (around line 260 where `history: []` is set)
- The renderer `src/components/reports/sections/WeeklyBreakdown.tsx` already handles populated `history` correctly (the fixture deck Slide 3 proved this works).
- `tests/unit/lib/smart-reports/weekly-review-globalcomix.test.ts`

### Change

Inside `buildChapter`, when building the `channel_weekly` section, project `args.ready.history.networks` through `bqNames`, sort oldest-first, and pass it as the `history` field:

```ts
const channelHistory = args.ready.history.networks
  .filter((h) => bqNames.includes(h.network))
  .sort((a, b) => a.weekIsoStart.localeCompare(b.weekIsoStart))
  .map(projectToHistoricalWeekRow);  // shape mapper to the section type
```

The shape mapping from `WeeklyHistoryRow` (analyst type) to `HistoricalWeekRow` (section type) already exists or is trivial; both carry week label, range, spend, installs, CPI, SubStart, CP SubStart, Sub D0, CPA D0, Sub D7, CPA D7. Grep for the mapping in the codebase first (probably in `src/lib/agents/hermes/snapshot.ts` since it does this for the legacy path).

### Acceptance

- Slide 3 (Weekly Breakdown) on the next Hermes run shows a multi-week stacked table below the current-week summary.
- Unit test asserts a fixture with 4 weeks of history produces a `channel_weekly` section whose `history` field has 4 rows in chronological order.

---

## WS3 -- Immature cohort cells render as em-dash

### Today

Slide 3 of the live deck shows `Sub D7: 0` and `CPA D7: $0.00` because the cohort is immature. The `MetricValue` type already has a `maturing: true` flag for exactly this case. The renderer uses it for `null` values but not for `0` values.

### Files

- `src/lib/reports/export-pptx.ts` -- the metric-cell helper (~line 1531, near "Null + maturing renders as an em-dash...")
- `src/components/reports/sections/WeeklyBreakdown.tsx` -- DOM equivalent
- `tests/unit/components/reports/sections/WeeklyBreakdown.test.tsx` (or create)

### Change

Treat `(value === 0 || value === null) && maturing === true` as "no data yet" and render `—` with no delta arrow and no tone color.

Do not suppress when the value is a real non-zero number, even if maturing -- a real number is information, the maturing flag is the qualifier.

Rule of thumb:

| value | maturing | Renders as |
|-------|----------|------------|
| `null` | `true` | `—` |
| `0` | `true` | `—` |
| `0` | `false` | `0` or `$0.00` |
| non-zero | `true` | the value (the maturing flag is shown via a small superscript or muted color; do not hide the number) |
| non-zero | `false` | the value |

### Acceptance

- Slide 3 of the next Hermes run shows `—` for Sub D7 and CPA D7 when the cohort hasn't matured.
- Existing tests for non-maturing cells unchanged.

---

## WS4 -- Filter campaigns by platform via `campaign_name` substring

### Why

The biggest credibility defect in the live deck. Slide 4 is titled "Android | Meta | Campaign Breakdown" but the top two rows in the table are `YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW` and `YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_US`. The Bottom Line reads "iOS spend compressed sharply..." under an Android header. A CSM showing this to a client gets a credibility problem on slide 1 of the body.

### Today

`buildChapter` filters campaigns by `bqNetworkNames` (channel) but not by `args.platform`. The `dataScope` is still `client-wide-all-platforms` because BQ workstream-D2 hasn't landed; the campaigns query returns rows for every OS. The campaign-classifier already extracts platform from `campaign_name` (it's how `family` and `geo` are derived), and `EnrichedCampaignRow` carries the platform field. Use it.

### Files

- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts`
- `src/lib/smart-reports/prose-writer.ts` (the campaign-breakdown user message)
- `src/lib/analyst/campaign-classifier.ts` (verify the `platform` field is set reliably; no change expected)
- `tests/unit/lib/smart-reports/weekly-review-globalcomix.test.ts`

### Change

1. **Inside `buildChapter`, in the per-channel loop**: after filtering `channelCampaigns` by `bqNames.includes(c.network)`, ALSO filter by `c.platform === args.platform`. Campaigns whose classifier-derived platform doesn't match are excluded from this chapter.

```ts
const channelCampaigns = args.ready.campaigns.filter(
  (c) =>
    bqNames.includes(c.network) &&
    c.platform === args.platform,
);
```

2. **Non-classifiable campaigns** (those whose `campaign_name` doesn't match the YH_ pattern; classifier sets `platform: "unknown"` or similar): exclude from all per-platform chapters. They are not visible to the user in this PR. A follow-up can render them in a dedicated "Other" chapter if there's enough spend to matter.

3. **Prose-writer context**: the campaign-breakdown user message currently lists campaigns by family. Add a one-line note at the top of the user message: `Platform scope: ${platformLabel}. All campaigns below ran on this platform.` Prevents the writer from referring to "the iOS campaign" inside an Android chapter.

4. **Platform Overall summary table**: do NOT filter the platform-overall table by platform substring -- the table summarizes channels (Meta, Google, TikTok, ASA), not campaigns. The summary table on the platform-overall slide stays as-is.

### Edge cases

- If after filtering a channel has zero campaigns on the platform, skip the channel-campaign section for that channel (the `if (campaign.blocks.length > 0)` guard already handles this).
- If after filtering a chapter has zero campaigns across all channels, the chapter still emits its platform-overall (which is channel-grain, not campaign-grain) and the channel_weekly sections. Only the campaign sections are skipped.

### Acceptance

- Fixture: 5 Android campaigns + 5 iOS campaigns in `ReadyData.campaigns`. Compose with `intent.platforms=["android"], intent.channels=["meta"]`. Resulting Campaign Breakdown section has 5 rows, all Android.
- Same fixture with `intent.platforms=["android", "ios"]`: in degraded single-chapter mode, only the first platform (Android) is emitted, with only 5 Android rows.
- Live: re-run Emily's email. Slide 4 of the deck shows only `_Android_` campaigns. The prose acknowledges Android only.

---

## WS5 -- Colored phrase highlights bind to row arrows

### Today

The live Hermes deck Slide 4 has pink and orange arrow shapes on the right edge of the campaign table. The prose under the table has zero `{{pink}}` / `{{orange}}` / `{{blue}}` markup tokens. Half the secret-sauce mechanic shipped (the arrows) but the other half (the matching colored phrase in the bullet) didn't. The arrows are unattributed and confuse the reader.

### Investigation

Three places the chain can break. Check each:

1. **The user message** (`src/lib/smart-reports/prose-writer.ts`, `buildCampaignUserMessage`). Does it include the `callouts` list with `color: pink/orange/blue` assignments per campaign? It should -- WS1 of the earlier upgrade PR added this. Confirm.

2. **The prompt** (`src/lib/smart-reports/prompts/campaign-breakdown.md`). Does it teach the writer to wrap matching phrases in the corresponding color markup? Quote from what should be there:

```
Callout assignments for this family:
- {color: pink} campaign_id=ABC (YH_FB_..._Sub_Android_Evergreen_WW-Top, spendDelta=+32.7%)
- {color: orange} campaign_id=DEF (..., spendDelta=+45.1%)

When you reference a row in a bullet, wrap the reference in the matching color markup: {{pink}}...{{/pink}}, {{orange}}...{{/orange}}, {{blue}}...{{/blue}}. The renderer will highlight the bullet phrase in that color and draw an arrow of the same color next to the row in the table above.
```

If the prompt doesn't carry this section, add it.

3. **The highlight-markup parser** (`src/lib/smart-reports/highlight-markup.ts`). Does it accept `{{pink}}`, `{{orange}}`, `{{blue}}`, `{{green}}`, `{{violet}}` tags? `HighlightKind` already includes these. Confirm the parser regex matches all of them, not just `{{good}}` / `{{bad}}`.

4. **The renderer** (`src/components/reports/sections/ProseBlock.tsx` and `src/lib/reports/export-pptx.ts`). When a bullet has a `pink` highlight token, does it actually paint pink? Cross-check against `CALLOUT_HEX` in `src/components/reports/sections/callout.ts`.

### Fix

Probably the prompt is the missing link. The user-message likely lists callouts, the parser likely handles the tags (since the types declare them), but the prompt may not teach the writer to USE the markup. Verify by looking at the campaign-breakdown.md file.

If the prompt has the instruction but the writer isn't following it, the fix is making the instruction more emphatic with explicit examples:

```
EXAMPLE:
Input callouts: {color: pink} campaign_id=ABC123 (YH_FB_Sub_Android_Evergreen_WW-Top, spendDelta=+32.7%)
Required bullet output: "WW-Top {{pink}}increased CPA by over 30%{{/pink}}, though it shows signs of improvement [cite:campaigns]"

The phrase that interprets row ABC123 is wrapped in {{pink}} so the renderer can paint it pink and connect it to the pink arrow on the row.
```

### Acceptance

- Fixture: `writeCampaignBreakdown` called with `callouts: [{ campaignId: "X", color: "pink", ... }]` where campaign X is in the data. The mocked Sonnet response includes `{{pink}}some phrase{{/pink}}`. Assert the resulting `ProseBlock` has a `highlights` array with kind="pink" and the phrase.
- Live: Slide 4 of the next Hermes run shows a colored phrase (pink, orange, or blue) inside one of the bullets that visually matches the colored arrow on the corresponding row.

---

## WS6 -- parse_intent extracts ISO date bounds

### Today

Every trace so far shows `period.iso_start: null, iso_end: null`. The analyst layer's `resolvePeriod` defaults to "last 7 days ending today UTC" regardless of what the email says. An email asking for "the full month of April 2026" runs on last-7-days data with the period label "this past week."

### Files

- `src/lib/agents/hermes/prompts/parse-intent.prompt.ts`
- `src/lib/agents/hermes/nodes/parse-intent.ts` (provide `today` as context)
- `src/lib/agents/hermes/prompts/parse-intent.adversarial-fixtures.ts`
- `tests/unit/lib/agents/hermes/nodes/parse-intent.test.ts` (or similar)

### Change

1. **Inject today's date as a system fact**: the parse-intent prompt should include a `<today>` block in the system prompt populated from `new Date().toISOString().slice(0, 10)`. Haiku has no implicit clock.

2. **Teach the prompt to handle three input types**:

   - **Explicit ISO range**: "2026-04-01 to 2026-04-30" -> extract verbatim.
   - **Explicit calendar range**: "April 1 through April 30, 2026" -> normalize to `2026-04-01` / `2026-04-30`.
   - **Relative phrasing**: "last week", "this past week", "yesterday" -> compute from `<today>`.
     - "last week" / "this past week" / "previous week" = the most recent complete ISO week (Mon-Sun) ending before today.
     - "this week" = the current ISO week (Mon-Sun) containing today; iso_end may be in the future.
     - "yesterday" -> single-day window.
     - "April 2026" / "full month of April" -> full calendar month.

3. **When the email is ambiguous about period**, return iso_start/iso_end as null AND add a doubt: `"Period unclear from email; defaulting to last 7 days. Confirm with sender if a specific week is meant."`. The existing doubts mechanism already surfaces these.

### Adversarial fixtures

Add to the existing test file:

```ts
{
  name: "explicit ISO range",
  email: "Please pull the GlobalComix review for 2026-04-01 to 2026-04-30.",
  expectedIso: { start: "2026-04-01", end: "2026-04-30" },
},
{
  name: "explicit calendar range",
  email: "Pull GlobalComix for April 1 through April 30, 2026.",
  expectedIso: { start: "2026-04-01", end: "2026-04-30" },
},
{
  name: "last week relative (today=2026-05-17 Saturday)",
  email: "Send me last week's review for GlobalComix.",
  today: "2026-05-17",
  expectedIso: { start: "2026-05-05", end: "2026-05-11" },
},
{
  name: "this past week relative",
  email: "How did GlobalComix do this past week?",
  today: "2026-05-17",
  expectedIso: { start: "2026-05-05", end: "2026-05-11" },
},
{
  name: "month-level",
  email: "Pull GlobalComix's April 2026 numbers.",
  expectedIso: { start: "2026-04-01", end: "2026-04-30" },
},
{
  name: "ambiguous: no period mentioned",
  email: "Send the GlobalComix review.",
  expectedIso: { start: null, end: null },
  expectedDoubtsContains: "Period unclear",
},
```

### Risk

Date math in Haiku is bounded but not perfect. Two safety nets:

- **Validator on the output**: after parse-intent returns, if `iso_start` and `iso_end` are both non-null, verify they parse as valid ISO dates and `iso_end >= iso_start`. Reject and re-prompt once if invalid.
- **Fallback regex**: a small regex pass on the email body that catches common explicit ISO patterns. Pass the matches to the LLM as hints in the user message ("The email contains these ISO-like tokens: 2026-04-01, 2026-04-30."). Helps Haiku not miss obvious extractions.

### Acceptance

- All 6 new adversarial fixtures pass.
- Existing 3 adversarial fixtures still pass.
- Live: a Hermes run on the full-month email body produces a deck with `period.iso_start=2026-04-01, iso_end=2026-04-30`, the cover reads "April 2026" or "Apr 1 to Apr 30, 2026", and the BQ queries fetch April data.

---

## What this PR does NOT do

- Does not implement the per-writer SSE events + skeleton deck. That's `prompts/2026-05-17-hermes-per-writer-events-skeleton-deck.md` and stays separate.
- Does not migrate to BQ workstream-D2 (OS predicate at the warehouse). WS4's client-side filter is the bridge until D2 lands.
- Does not change the manual builder's flow. authoredBy in the manual path correctly stays "nova"; only the Hermes path swaps to "hermes".
- Does not introduce a new "Other" chapter for non-classifiable campaigns. WS4 excludes them.
- Does not change the campaign-grain cohort columns being zero. Separate data-layer workstream.

---

## Order of work

1. **WS1** -- 1 line + tests.
2. **WS3** -- small renderer change in DOM + PPTX.
3. **WS2** -- one section change in the multi-section template, plus a shape mapper.
4. **WS4** -- platform filter in template + prose-writer context line.
5. **WS5** -- investigate first (likely a prompt edit), then test.
6. **WS6** -- biggest risk; Haiku prompt + fixtures + validator + fallback regex.

Land each as its own commit so the PR diff is reviewable per fix.

## Squad pass before merge

- `npm run typecheck` clean.
- `npm test:unit` passes (new tests for each WS).
- Two real Hermes runs attached to the PR description:
  - Emily's email (iOS Meta) -- confirm WS1, WS2, WS3, WS4, WS5 land
  - Full-month email (multi-platform multi-channel April 2026) -- confirm WS6 lands and the deck period reads "April 2026"
- LangSmith trace links for both runs.
- Screenshots of Slide 3 (trailing history present) and Slide 4 (Android-only campaigns + colored phrase highlights) attached.
