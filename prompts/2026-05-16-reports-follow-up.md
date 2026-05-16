# Reports follow-up: honor intent scope, backward compat, skip dead Quill, persist action notes (2026-05-16)

Owner: Omer. Run as a single PR on a new branch off `main`. Smaller and tighter than the previous end-to-end upgrade -- four focused workstreams.

## TL;DR

A LangSmith trace from a real Hermes run (`ec025e22-a23d-4097-9950-f277c6444798`, paste-email modal) made three defects visible:

1. Emily's email asked for the GlobalComix weekly review, "mostly interested in how iOS is doing on Meta." Hermes parsed `intent.platforms = ["ios"]`, `intent.channels = ["meta"]` with confidence 0.92. The deck shipped 9 sections covering Meta, Google, TikTok, AND ASA. The channels picker / parsed intent is ignored entirely by the multi-section template -- it walks its own hardcoded `PLATFORM_CHANNELS[platform]` list. WS1 fixes this.

2. The Hermes graph walks `parse_intent -> analyze -> quill -> atelier`. In smart-reports mode (today's default), atelier delegates to `composeReport`, which re-runs the prose-writers from scratch. Quill's 6 bullets are discarded on every single run. The trace shows quill spent 12.2 seconds and ~one Sonnet call's worth of output that nothing reads. WS2 fixes this.

3. The previous PR (`a10c918`) changed `ProseBlock` from `{text, highlights}` to `{bullets[], bottomLine}`. There is no backward-compat in the renderer; an old saved report with the prior shape will throw `TypeError: Cannot read properties of undefined` when `block.bullets.map(...)` runs. WS3 fixes this.

Plus a small wire (WS4): the regenerate-section route silently drops the user's action notes. Anyone who types notes, generates a deck, then clicks Regenerate loses the `<> AI:` callouts.

---

## Workstream order

Do them in this order to minimize churn:

1. **WS3 first.** Renderer guard. Lowest blast radius, prevents a crash. Five-minute change.
2. **WS1 next.** Template honors `intent.platforms` and `intent.channels`. Highest user-visible value. Touches the template only.
3. **WS4 next.** Three-file wire. Stamp `actionNotes` on `regenerationContext`, read it in the regen route.
4. **WS2 last.** Graph edge. Touches Hermes orchestration; review with the most care.

---

## WS1 -- Honor intent.platforms and intent.channels in the multi-section template

### Evidence

LangSmith trace `ec025e22` shows the defect plainly. `intent` was parsed correctly:

```json
{
  "channels": ["meta"],
  "platforms": ["ios"],
  "client": "globalcomix",
  "focus": "how iOS is doing on Meta",
  "confidence": 0.92
}
```

`deck.slides` shipped 9 sections (1 platform_overall + 4 channel_weekly + 4 channel_campaign). The user asked for one channel; the deck delivered four.

### Root cause

`src/lib/smart-reports/templates/weekly-review-globalcomix.ts` has module-level constants:

```ts
const PLATFORM_ORDER = ["android", "ios", "web"] as const;
const PLATFORM_CHANNELS: Record<Platform, ...> = {
  android: ["meta", "google", "tiktok"],
  ios: ["meta", "google", "tiktok", "apple_search_ads"],
  web: ["google"],
};
```

`buildChapter` walks `PLATFORM_CHANNELS[args.platform]` (line 186). `buildWeeklyReviewGlobalcomix` walks `PLATFORM_ORDER` when data is platform-filtered, falling back to `[pickSinglePlatform(args.intent)]` in degraded mode (today). Neither path reads `intent.channels` -- and `intent.platforms` is only respected as `[0]` in degraded mode.

### Change

In `weekly-review-globalcomix.ts`:

1. Inside `buildWeeklyReviewGlobalcomix`, compute the platforms to emit by intersecting `intent.platforms` with `PLATFORM_ORDER`:

```ts
const requestedPlatforms = new Set(args.intent.platforms);
const platformsInOrder: Platform[] = (PLATFORM_ORDER as readonly Platform[])
  .filter((p) => requestedPlatforms.has(p));

const platformsToEmit: Platform[] = args.dataIsPlatformFiltered
  ? platformsInOrder
  : platformsInOrder.slice(0, 1); // degraded mode: emit the FIRST requested
                                  // platform, not the first hardcoded one
```

If `platformsInOrder` is empty (intent.platforms had garbage), fall back to the prior `pickSinglePlatform` for safety.

2. Inside `buildChapter`, intersect `PLATFORM_CHANNELS[args.platform]` with `args.intent.channels`:

```ts
const requestedChannels = new Set(args.intent.channels);
const channelsToEmit = PLATFORM_CHANNELS[args.platform].filter((c) =>
  requestedChannels.has(c),
);
for (const channel of channelsToEmit) { ... }
```

If `channelsToEmit` is empty for a platform (user picked a channel that doesn't run on this platform, e.g. ASA on Android), skip the chapter entirely -- return `null` from `buildChapter` and the orchestrator already handles the null. Do not emit an empty chapter divider.

3. The Platform Overall slide currently summarizes EVERY network that has spend on the platform (`networksForPlatform` returns all `n.spend > 0`). After WS1 it should also be intersected with the user's channel selection so the platform-overall table doesn't list ASA when the user asked for only Meta. Filter `platformNetworks` against the same BQ network names the channels resolve to.

### Acceptance for WS1

- Run the same email body Emily sent (or any email matching `iOS / Meta`). The resulting `deck.slides` array has exactly 4 entries: `platform_overall`, `channel_weekly` (Meta), `channel_campaign` (Meta), `closer`. No Google / TikTok / ASA sections.
- Run with `platforms: ["android", "ios"], channels: ["meta", "google"]` from the manual builder. Deck has 2 chapters (Android, iOS), each with platform_overall + 2 channel_weekly + 2 channel_campaign. 10 sections + closer.
- Add a unit test in `tests/unit/lib/smart-reports/weekly-review-globalcomix.test.ts` that asserts both shapes above.

### Important caveat to document on the cover

Until BigQuery workstream-D2 lands the OS predicate, `dataScope` is still `"client-wide-all-platforms"`. That means: after WS1, a deck labeled "iOS | Meta" will show client-wide Meta numbers, not iOS-specific Meta numbers. The existing `scopeCaveat` on the cover already says "Numbers are client-wide across platforms" -- keep that line and consider strengthening it to: "Numbers are client-wide; per-platform breakdown lands once the BigQuery platform filter ships." This is data-layer reality, not a WS1 bug.

---

## WS2 -- Skip Quill when USE_SMART_REPORTS=live

### Evidence

Same trace. History:

```
parse_intent  3.94s
analyze      14.04s
quill        12.21s  <-- dead output
atelier      83.38s  (smart-reports path; re-runs writers)
review_gate   0.00s
```

Quill emitted 6 bullets (visible in `outputs.bullets`) with `slide_target` and `action_item` per bullet. Atelier history note: `"wrote report ... via smart-reports (9 sections, 6 bullets)"` -- the "6 bullets" count is from Quill's output passing through state, but composeReport regenerates everything from ReadyData via its own writers. The Quill bullets are not on the rendered deck.

### Change

In `src/lib/agents/hermes/graph.ts` (or wherever the graph is wired -- find by `grep -rn "addEdge\|addNode" src/lib/agents/hermes/`):

Today the edges look like:

```
parse_intent -> analyze -> quill -> atelier -> review_gate
```

Add a conditional edge from `analyze` so when `serverEnv.USE_SMART_REPORTS === "live"`, the graph skips `quill` and goes straight to `atelier`. LangGraph supports conditional edges via a router function that returns the next node name:

```ts
graph.addConditionalEdges("analyze", (state) => {
  return serverEnv.USE_SMART_REPORTS === "live" ? "atelier" : "quill";
});
graph.addEdge("quill", "atelier");
graph.addEdge("atelier", "review_gate");
```

When USE_SMART_REPORTS is `off` or `shadow`, the graph still walks quill (the legacy bullet path needs Quill's output for the snapshot-only atelier). Atelier already checks the same env flag and dispatches accordingly.

Atelier's smart-reports path doesn't read `state.bullets`, so dropping Quill is safe -- but verify by grep. If atelier reads `state.bullets` even in smart-reports mode (e.g. for the audit log entry that says "6 bullets"), update the log line to read from `state.composed_report.diagnostics.proseBlocks` instead.

### Acceptance for WS2

- Run the email-paste modal with USE_SMART_REPORTS=live. LangSmith trace history shows `parse_intent -> analyze -> atelier -> review_gate`. No quill node. Atelier still produces the deck.
- Run with USE_SMART_REPORTS=off. Trace history includes quill. Legacy path still works.
- Total wall time drops by ~10-15 seconds per run.
- Unit test in `tests/unit/lib/agents/hermes/graph.test.ts`: compile the graph with both env values, assert node count.

---

## WS3 -- Backward compat for the old ProseBlock shape

### Evidence

`a10c918` changed `ProseBlock` from:

```ts
{ heading?: string; text: string; highlights: HighlightToken[]; }
```

to:

```ts
{ heading?: string; bullets: ProseBullet[]; bottomLine: string; actionItem?: string; }
```

The renderer in `src/components/reports/sections/ProseBlock.tsx` line 73 calls `block.bullets.map(...)` with no guard. Old saved reports stored in Supabase from the previous Phase 1/2/3 commits (`72b4ade`, `028d463`, `73458c0`) have the old prose shape inside `sections[].prose[]`. When the renderer hydrates one of those, `block.bullets` is `undefined` and `.map` throws `TypeError`.

`src/lib/reports/server-store.ts` has no migration. The comment "the renderer guards on section.id" describes the section-level fallback but doesn't protect the prose-shape mismatch inside a recognized section.

### Change

Two options. Recommend option A; option B is the heavier alternative.

**Option A (recommended): renderer-side guard.** At the top of `ProseBlockView`:

```ts
const hasBullets = Array.isArray(block.bullets) && block.bullets.length > 0;
const hasBottomLine = typeof block.bottomLine === "string" && block.bottomLine.length > 0;

if (!hasBullets || !hasBottomLine) {
  // Legacy prose shape (text + highlights, no bullets). Render a
  // placeholder card that tells the user this section needs to be
  // regenerated to take the new shape. The Regenerate button on the
  // section header (SectionActions) is the path forward.
  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--text-light-muted)]">
      This section was generated by an older version of Smart Reports. Click Regenerate to refresh.
    </div>
  );
}
```

This degrades gracefully. The Regenerate button on the section header already exists and works (the new regen route re-runs the writer with the current schema).

**Option B (alternative): server-side migration in `server-store.ts`.** In `rowToReport`, walk every section's `prose` field. For any block missing `bullets`, transform `{text, highlights}` into `{bullets: [{text, highlights}], bottomLine: ""}`. Bottom line becomes empty, which the renderer can hide. This avoids the placeholder but quietly mutates persisted data on read.

A is safer. The placeholder makes the migration explicit; the user opts in via Regenerate.

### Acceptance for WS3

- Fixture test: feed `ProseBlockView` a block with `{ text: "old prose", highlights: [] }` (cast as `ProseBlock` for the test). Assert it renders the placeholder, not throws.
- Manually: if you have a saved report from before `a10c918`, open it. No crash; legacy sections show the placeholder card.
- New reports render bullets + bottom line as today (no regression).

---

## WS4 -- Persist actionNotes in regenerationContext

### Evidence

The regenerate-section route at `src/app/api/reports/[id]/regenerate-section/route.ts` line 247:

```ts
actionItems: parseActionItems(undefined, ready),
```

`undefined` is passed for the campaign-breakdown writer's action items. The user's original notes (from the manual builder's ActionItemsInput textarea or the Hermes paste-email modal) are not threaded through.

`regenerationContext` on the Report is:

```ts
{
  platforms: ReportPlatform[];
  channels: ReportChannel[];
  periodIsoStart: string;
  periodIsoEnd: string;
}
```

No `actionNotes` slot. Stamping it in `generate.ts` (manual builder) and atelier (Hermes) and reading it in the regen route is straightforward.

### Change

1. `src/lib/reports/types.ts`. Extend `RegenerationContext` (or wherever the type lives -- grep for `regenerationContext?: {`):

```ts
regenerationContext?: {
  platforms: Platform[];
  channels: Channel[];
  periodIsoStart: string;
  periodIsoEnd: string;
  /** Free-form analyst notes pasted into the manual builder /
   *  Hermes modal. Persisted so per-section regenerate can re-parse
   *  them against the latest ReadyData. */
  actionNotes?: string | null;
};
```

2. `src/lib/reports/generate.ts`. In the regenerationContext stamp (around line 263):

```ts
regenerationContext: {
  platforms,
  channels,
  periodIsoStart: fmtIso(weekStart),
  periodIsoEnd: fmtIso(weekEnd),
  actionNotes: actionNotes ?? null,
},
```

3. `src/lib/agents/hermes/nodes/atelier.ts`. The smart-reports path returns a composed Report; before saving, stamp the same fields. `state.action_notes` is the source (it's already on the Hermes state -- confirm via grep).

4. `src/app/api/reports/[id]/regenerate-section/route.ts` line 247. Pass the persisted notes:

```ts
actionItems: parseActionItems(ctxData.actionNotes ?? undefined, ready),
```

### Acceptance for WS4

- Type notes ("We paused the WW Sub Seasonal Invincible campaign last week") in the manual builder. Generate a deck. The campaign-breakdown section shows the `<> AI:` callout woven into the matching family.
- Click Regenerate on that section. The new prose still has the `<> AI:` callout (text may be reworded; the callout token persists).
- Unit test: regenerate route preserves action notes when the original report's regenerationContext carried them; emits no callout when it didn't.

---

## What this PR does NOT do

These are real follow-ups but separate workstreams. Do not pull them in:

- **BigQuery OS predicate (workstream-D2).** Even after WS1, `dataScope` is `"client-wide-all-platforms"`. iOS-labeled decks show client-wide numbers. Cover caveat is the user-facing acknowledgement until D2 lands.
- **Campaign-grain cohort columns.** Campaign tables still show $0 in the sub-funnel columns; the renderer correctly hides them when all rows are zero. Data-layer fight, separate ticket.
- **Real e2e visual diff vs the Week 18 reference deck.** Measurement workstream, runs after this PR.
- **Template-based PPTX (master deck).** Still queued.
- **More than one new test per workstream.** The existing `findings-and-callouts.test.ts` is light coverage (1 `it` block over 283 lines). This PR's coverage should be tighter but is not the place to backfill the previous PR.

---

## Squad pass before merge

1. `npm run typecheck` clean.
2. `npm run test:unit` passes.
3. One real Hermes run attached to the PR description:
   - Email body identical or nearly identical to the trace evidence above ("how iOS is doing on Meta this past week").
   - LangSmith trace link.
   - Confirm: 4 sections + closer, no quill node, total wall time under 90 seconds.
4. One real manual-builder run attached:
   - Type action notes in the textarea.
   - Generate a deck.
   - Click Regenerate on a section.
   - Confirm: `<> AI:` callouts preserved.
5. Confirm an old saved report (or fixture) renders the legacy placeholder, not a crash.

---

## Out of scope reminders for the agent running this PR

- Do not refactor the prose-writer or composeReport in this PR. The shapes are stable from `a10c918`.
- Do not touch the BigQuery queries. WS1's data-scope caveat is documentation, not code.
- Do not break the e2e auth env wiring. The regen route is the only new server route; reuse `requireUser` + `rateLimit` exactly as it stands.
- Do not add new env flags. WS2 reads the existing `serverEnv.USE_SMART_REPORTS`.
