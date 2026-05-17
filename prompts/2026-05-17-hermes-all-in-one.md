# Hermes: deck quality + per-writer streaming + loading UX (all-in-one, 2026-05-17)

Owner: Omer. Single PR on a new branch off `main`. Nine workstreams bundled because they all touch the same surface (smart-reports template + the Hermes paste-email modal) and they're cheaper to validate together than in three separate PRs.

## TL;DR

Today's live Hermes deck (run on Emily's "iOS Meta" email) has six visible defects in the PPTX and one in the loading UX. This PR fixes all of them. The result is a CSM-ready deck plus a real-time loading experience.

Three buckets, nine workstreams:

**Deck quality (six)**
1. `authoredBy` reflects the workflow agent on the cover.
2. Immature cohort cells render as em-dash, not `$0.00`.
3. Trailing-history table restored under the Weekly Breakdown.
4. Platform filter via `campaign_name` substring so an "Android" chapter only contains Android campaigns.
5. Colored phrase highlights bind to the row arrows.
6. `parse_intent` extracts ISO date bounds from the email.

**Streaming (one)**
7. Per-writer events fire from the smart-reports template through the SSE route.

**Loading UX (two)**
8. New `HermesDeckSkeleton` component that fills in as `section_ready` events arrive, with a full animation spec.
9. Modal wires the skeleton into the existing status tape + findings feed.

---

## Order of work

Ship in this order so each step's diff is reviewable and so the validation Hermes run at the end exercises everything together:

1. **WS1** -- one-line patch (authoredBy).
2. **WS2** -- small renderer change (em-dash).
3. **WS3** -- one section change in the template (history).
4. **WS4** -- platform filter (biggest deck-quality win; touches the template + prose-writer context).
5. **WS5** -- investigate then fix (colored phrase highlights).
6. **WS6** -- biggest risk; Haiku prompt + fixtures + validator + fallback regex (parse_intent dates).
7. **WS7** -- thread `emit` through the template + writers (per-writer events).
8. **WS8** -- HermesDeckSkeleton component plus full animation spec.
9. **WS9** -- wire into the modal.

Land each as its own commit. The PR diff is reviewable per fix.

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

If the cover renderer needs a different display label per agent ("Drafted by Nova" vs "Drafted by Hermes"), confirm the rendering side renders the new id correctly.

### Acceptance

- Compose with `runId: "abc"` returns `report.authoredBy === "hermes"`.
- Compose without `runId` returns `report.authoredBy === "nova"`.
- Hermes run cover reads "Drafted by Hermes · Report Writer".

---

## WS2 -- Immature cohort cells render as em-dash

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

## WS3 -- Trailing-history table restored to Weekly Breakdown

### Today

`buildChapter` in `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` sets `history: []` on the `channel_weekly` section unconditionally. Comment in the file says "trailing-week table renders elsewhere; phase 2 does not change history projection." `ReadyData.history.networks` has the data (the analyst layer's `fetchTrailingWeeks` populates it). The template just doesn't pass it through.

### Files

- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` (around line 260 where `history: []` is set)
- The renderer `src/components/reports/sections/WeeklyBreakdown.tsx` already handles populated `history` correctly.
- `tests/unit/lib/smart-reports/weekly-review-globalcomix.test.ts`

### Change

Inside `buildChapter`, when building the `channel_weekly` section, project `args.ready.history.networks` through `bqNames`, sort oldest-first, and pass it as the `history` field:

```ts
const channelHistory = args.ready.history.networks
  .filter((h) => bqNames.includes(h.network))
  .sort((a, b) => a.weekIsoStart.localeCompare(b.weekIsoStart))
  .map(projectToHistoricalWeekRow);
```

The shape mapping from `WeeklyHistoryRow` (analyst type) to `HistoricalWeekRow` (section type) already exists or is trivial; both carry week label, range, spend, installs, CPI, SubStart, CP SubStart, Sub D0, CPA D0, Sub D7, CPA D7. Grep for the mapping in the codebase first (probably in `src/lib/agents/hermes/snapshot.ts` since it does this for the legacy path).

### Acceptance

- Slide 3 (Weekly Breakdown) on the next Hermes run shows a multi-week stacked table below the current-week summary.
- Unit test asserts a fixture with 4 weeks of history produces a `channel_weekly` section whose `history` field has 4 rows in chronological order.

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

1. **The user message** (`src/lib/smart-reports/prose-writer.ts`, `buildCampaignUserMessage`). Does it include the `callouts` list with `color: pink/orange/blue` assignments per campaign? It should -- WS1 of the earlier upgrade PR (`a10c918`) added this. Confirm.

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

## WS7 -- Emit per-writer events from smart-reports

### Why

Trace `ada7b5b1` confirmed the SSE Option A loading state (commit `8ec9219`) is not enough. The status tape sat on "Drafting the deck" for the entire ~21s atelier phase with no per-section feedback. Option B fills that wait with visible activity: a stream of per-writer events the modal renders as per-section progress.

### Files

- `src/lib/agents/hermes/events.ts` (already created in commit `8ec9219`)
- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts`
- `src/lib/smart-reports/prose-writer.ts`
- `src/lib/smart-reports/index.ts`
- `src/lib/agents/hermes/nodes/atelier.ts`
- `src/app/api/agents/hermes/stream/route.ts` (already exists; extend it)
- Existing test files

### Change

1. **Extend `HermesEvent` union** with the per-writer variants:

```ts
export type HermesEvent =
  // ... existing variants
  | {
      type: "writer_started";
      sectionId: string;
      sectionType: "platform_overall" | "channel_weekly" | "channel_campaign" | "closer";
      platform: "android" | "ios" | "web" | null;
      channel: "meta" | "google" | "tiktok" | "asa" | null;
      at: string;
    }
  | {
      type: "writer_finished";
      sectionId: string;
      proseBlocks: number;
      highlights: number;
      at: string;
    }
  | {
      type: "section_ready";
      sectionId: string;
      section: ReportSection;
      at: string;
    };
```

2. **Add an optional `emit?: (event: HermesEvent) => void` parameter** to:
   - `composeReport` in `smart-reports/index.ts`
   - `buildWeeklyReviewGlobalcomix` and `buildChapter` in `templates/weekly-review-globalcomix.ts`
   - `writePlatformOverall`, `writeWeeklyBreakdown`, `writeCampaignBreakdown`, `writeCloser` in `prose-writer.ts`

   When `emit` is undefined, behavior is identical to today (no-op). Tests already-existing pass `undefined` and stay byte-identical.

3. **Each writer emits** `writer_started` right before the Anthropic `messages.create` call and `writer_finished` right after parsing the tool_use response.

4. **`buildChapter` emits `section_ready`** after each section is fully assembled (snapshot + prose validated). One event per emitted section (platform_overall, channel_weekly, channel_campaign).

5. **The SSE route** (`stream/route.ts`) already opens the response stream and writes node-level events. Extend it to construct the `emit` callback that writes each writer/section event as an SSE frame, and pass that callback through `composeReport` via `atelier.ts`.

6. **`atelier.ts`**: add an `emit` argument that the SSE route threads through. Pass it to `composeReport`.

### Acceptance

- Existing tests still pass (`emit` defaults to undefined, snapshot fixtures match).
- A new test asserts that when an emitter is provided, a 2-channel composition fires the expected sequence:
  1. one `writer_started` + `writer_finished` per writer (platform_overall + 2 weekly + 2 campaign + closer = 6 pairs)
  2. one `section_ready` per emitted section
  3. order is deterministic given fixed fake LLM timing
- Manual smoke: re-run Emily's email and tail the SSE log. Confirm per-writer events fire.

---

## WS8 -- HermesDeckSkeleton component (with full animation spec)

### Why

A skeleton outline of the deck that paints as soon as parse_intent finishes, then swaps each card from skeleton to populated content as `section_ready` events arrive. Combined with WS7, the wait fans out across the deck visually instead of pooling on one label.

### Files

- New: `src/components/reports/hermes-progress/HermesDeckSkeleton.tsx`
- `src/components/reports/hermes-progress/useHermesEventStream.ts` (already exists; extend to expose `sectionsReady`)
- `src/app/globals.css` (animation keyframes)
- `src/components/reports/DraftFromEmailModal.tsx` (covered in WS9)

### Change

1. **New component `HermesDeckSkeleton`**. Props:
   - `intent: Intent | null` -- seed for the section list; comes from the first `node_finished(parse_intent)` event
   - `sectionsReady: Record<string, ReportSection>` -- map of completed sections, keyed by section id

2. **Derive the expected section list deterministically from `intent`**:
   - One platform-overall per platform that has any selected channel
   - One channel-weekly + one channel-campaign per (platform, channel) pair
   - The cover and closer slots always exist
   - Order matches the template's natural iteration order (intent.platforms in PLATFORM_ORDER, intent.channels in PLATFORM_CHANNELS[platform])

3. **Each expected section renders as either**:
   - A skeleton card with shimmer if not in `sectionsReady`
   - A populated mini-card with the section title and a mint "ready" pill if present

4. **Layout**: stacked cards in a single column, scrolling inside the container if the list overflows. Card height approximates real section heights (use the layout constants from `src/lib/reports/layout.ts` as the source of truth so the swap does not jank).

5. **Animations -- full spec.** Apply uniformly across the loading region. Implement with CSS keyframes; do NOT pull in Framer Motion or any other animation lib. Keeps the bundle flat and matches the existing dashboard's approach. Define the keyframes once in `globals.css` and reference them via class names so the modal, the dashboard, and any future loading state share the same pulse / shimmer / fade timings.

   **a. Status tape pulse (mint dot to the left of the active label).**
   - 1.6s ease-in-out infinite loop
   - opacity: 60% -> 100% -> 60%
   - transform scale: 1 -> 1.4 -> 1
   - colour: `var(--color-mint)` (the UA team accent, already in the brand tokens)
   - Animation runs whenever the SSE stream is open. Stops on `deck_ready` and the dot turns solid mint (no opacity / scale animation) for 400ms before the modal closes.

   **b. Status tape label swap (when the active step changes).**
   - 250ms duration on both the outgoing and incoming label
   - Outgoing: opacity 100 -> 0 plus translateY 0 -> -4px, ease-out
   - Incoming: opacity 0 -> 100 plus translateY +4 -> 0, ease-out
   - The two run simultaneously (crossfade with a tiny vertical motion). Don't stack them sequentially -- the label area would jump.
   - The +N more chip (when multiple writers are in-flight) fades in / out on the same 250ms curve when its count changes.

   **c. Findings card enter (when a new card lands in the feed).**
   - 400ms ease-out
   - opacity 0 -> 1 plus translateY +8 -> 0
   - 80ms stagger between cards when more than one card arrives in the same tick (i.e. multiple `writer_finished` events fire within the same React render cycle because of WS1 parallelism). Implement as `animation-delay: ${index * 80}ms` keyed to the new-card ordinal within the batch, not the total feed length.
   - Cards do NOT animate when the list scrolls. Animation is on enter only.

   **d. Skeleton shimmer (on every grey placeholder card).**
   - 1.6s linear infinite loop
   - Background: a horizontal gradient sweep moving left-to-right across the card
   - Base fill: `rgba(255,255,255,0.04)`; sweep band: `rgba(255,255,255,0.09)`
   - Grep `animate-pulse|shimmer|skeleton` under `src/components/` first -- if the dashboard already has a shimmer keyframe, REUSE it (matching cycle length and gradient). Define a new one only if nothing matches.

   **e. Skeleton-to-populated swap (when a `section_ready` event lands).**
   - 300ms ease-out
   - Outgoing skeleton: opacity 1 -> 0
   - Incoming populated card: opacity 0 -> 1 plus translateY +4 -> 0
   - Run simultaneously. The two cards must share the same height during the swap so the layout doesn't jank; see point 4 above on approximating real section heights from `layout.ts`.

   **f. "Ready" pill on populated cards.**
   - The pill itself drops in on the same 300ms ease-out as the skeleton-to-populated swap (opacity 0 -> 1 plus translateY +4 -> 0).
   - No looping pulse on the pill once it lands -- it's an end state, not an active animation.

   **g. Final hold + modal close (when `deck_ready` fires).**
   - All skeletons should be populated by this point; the modal stays open for ~400ms so the user sees the fully-painted grid land.
   - The status tape dot turns solid mint (as per (a)). The label switches to "Saved draft. Opening it now..." via the standard 250ms label swap.
   - Then the modal fades out (200ms ease-out, opacity 1 -> 0) and the redirect to `/reports/<reportId>` fires.

   **Constraint**: keep all of the above as CSS keyframes inside `globals.css` plus utility class names on the components. No JavaScript animation libraries. If a future polish pass wants the richer easing curves of Framer Motion, that's a separate workstream after the loading state lands and stabilises.

6. **Status tape labels become richer.** Friendly label mapping for writer events:

```ts
const WRITER_LABEL = (
  sectionType: "platform_overall" | "channel_weekly" | "channel_campaign" | "closer",
  platform: string | null,
  channel: string | null,
): string => {
  const p = platform ? (platform === "ios" ? "iOS" : platform[0].toUpperCase() + platform.slice(1)) : "";
  const c = channel ? (channel === "asa" ? "ASA" : channel[0].toUpperCase() + channel.slice(1)) : "";
  switch (sectionType) {
    case "platform_overall":
      return `Drafting the ${p} overview`;
    case "channel_weekly":
      return `Drafting ${p} ${c} weekly breakdown`;
    case "channel_campaign":
      return `Drafting ${p} ${c} campaign breakdown`;
    case "closer":
      return "Wrapping up";
  }
};
```

When multiple writers are in-flight (because parallelism is live from commit `8befe33`), pick the most recent `writer_started` event for the tape label. Optionally show a small "+N more" tag next to it if more than one writer is active; do not enumerate them.

---

## WS9 -- Wire HermesDeckSkeleton into the modal

### Files

- `src/components/reports/DraftFromEmailModal.tsx`
- `src/components/reports/hermes-progress/useHermesEventStream.ts`

### Change

1. **Below the existing status tape + findings feed**, render `HermesDeckSkeleton`.

2. **The hook `useHermesEventStream`** (already in place) maintains: latest node, growing events list. Extend its return to expose `sectionsReady: Record<string, ReportSection>` derived from `section_ready` events.

3. **The grid layout from the mockup is**: tape on top, two-column body below (feed on the left, skeleton on the right). On narrow viewports, stack vertically (feed above skeleton).

4. **On `deck_ready`**, leave the populated skeleton visible for ~400ms (so the user sees the final fully-populated grid), then redirect to `/reports/<reportId>`. The 400ms hold pairs with animation (g) above.

### Acceptance

- Open the paste-email modal. Paste Emily's email. Submit.
- Within 1 second of submit, the skeleton appears below the findings feed.
- Each section swaps from skeleton to populated as its writer completes, NOT all at once at deck_ready.
- With parallelism live, sections can swap out of order (e.g. campaign before weekly within the same channel pair).
- Status tape cycles through per-writer labels during the atelier phase (not just "Drafting the deck").
- After `deck_ready`, the modal holds for ~400ms, then closes and redirects to the deck.

---

## What this PR does NOT do

- BQ workstream-D2 (OS predicate at the warehouse level). WS4's client-side filter is the bridge.
- Campaign-grain cohort columns. Still zero/null.
- Template-based PPTX migration. Queued.
- Token-level streaming inside a single writer's Anthropic call. Per-writer is the granularity ceiling for this PR.
- Manual builder migration to SSE. Still sync POST.
- Migration of the existing dashboard's shimmer animation to the new shared keyframe. Use whatever the dashboard already has if it exists; only add a new keyframe if nothing matches.

---

## Squad pass before merge

- `npm run typecheck` clean.
- `npm test:unit` passes (new tests for WS1, WS2, WS3, WS4, WS5, WS6, WS7).
- Two real Hermes runs attached to the PR description:

  **Run 1** -- Emily's email (`"how is doing on Meta this past week"`):
  - Deck cover reads "Drafted by Hermes" (WS1).
  - Slide 3 shows trailing-history table with 3-4 weeks (WS3).
  - Slide 3 shows `—` for immature D7 metrics (WS2).
  - Slide 4 shows only Android campaigns (assuming intent.platforms[0]=android in degraded mode) (WS4).
  - Slide 4 has colored row arrows AND matching colored phrases in the prose (WS5).
  - LangSmith trace shows per-writer events (WS7).
  - Modal screen recording shows the skeleton filling in section-by-section (WS8, WS9).

  **Run 2** -- Full-month email (April 2026):
  - Period parses as `iso_start=2026-04-01, iso_end=2026-04-30` (WS6).
  - Cover reads "April 2026" or "Apr 1 to Apr 30, 2026".
  - BQ queries fetch April data.

- LangSmith trace links for both runs.
- Screenshots of Slide 3 (trailing history present), Slide 4 (Android-only campaigns + colored phrase highlights), and a screen recording of the loading UX.

---

## Notes for the agent running this

- WS7 builds on the SSE infrastructure already created in commit `8ec9219`. Do not rewrite the SSE plumbing.
- WS8 should reuse whatever shimmer keyframe the dashboard already has. Grep first.
- WS4's classifier-derived platform field is the source of truth. Do not re-parse `campaign_name` in this PR; the campaign-classifier owns that.
- WS6 has real Haiku-extraction risk. Ship the validator + regex fallback alongside the prompt change so accuracy regression is bounded.
- WS5 is investigate-first. The arrows already ship; finding why the matching phrases don't is the work.
- Each of the nine workstreams is independently shippable. If WS6 turns out to be a larger fight than expected, drop it from this PR and ship the other eight; the deck quality and loading UX still land.
