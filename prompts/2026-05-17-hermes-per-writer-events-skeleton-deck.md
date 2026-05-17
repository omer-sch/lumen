# Hermes: per-writer events + skeleton deck (Option B follow-up, 2026-05-17)

Owner: Omer. Single PR on a new branch off `main`. Direct follow-up to commits `8befe33` (WS1 parallelism) and `8ec9219` (WS2 Option A node-level streaming).

## Why now

Live test on trace `ada7b5b1` confirmed Option A is not enough. The status tape sat on "Drafting the deck" for the entire ~21s atelier phase with no per-section feedback. The findings feed gained one card at the start of atelier and then nothing until the deck landed. The user's gut read: "it felt long."

The fix is the richer event granularity I specified as Option B in `prompts/2026-05-16-hermes-parallelize-and-stream.md`. Per-writer events + a skeleton deck that fills in as individual sections complete. The 21s wait gets replaced by visible activity across the whole deck.

## Scope

Three workstreams. Land them in one PR.

### WS1 -- Emit per-writer events from the smart-reports template

Thread an optional `emit` callback through the composition. When provided, every writer call fires `writer_started` before the Anthropic call and `writer_finished` after; the chapter builder fires `section_ready` once a section is assembled.

**Files**

- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts`
- `src/lib/smart-reports/prose-writer.ts`
- `src/lib/smart-reports/index.ts`
- `src/lib/agents/hermes/events.ts` (the event-type module already created in commit `8ec9219`)
- `src/app/api/agents/hermes/stream/route.ts` (the SSE route already created in commit `8ec9219`)
- Existing test files for the above

**Change**

1. Extend the event type union in `events.ts` to add the per-writer variants from the Option B spec in `prompts/2026-05-16-hermes-parallelize-and-stream.md`:
   - `writer_started`
   - `writer_finished`
   - `section_ready`

2. Add an optional `emit?: (event: HermesEvent) => void` parameter to:
   - `composeReport` in `smart-reports/index.ts`
   - `buildWeeklyReviewGlobalcomix` in `templates/weekly-review-globalcomix.ts`
   - `buildChapter` in the same file
   - `writePlatformOverall`, `writeWeeklyBreakdown`, `writeCampaignBreakdown`, `writeCloser` in `prose-writer.ts`

   When `emit` is undefined, behavior is identical to today (no-op event firing). Tests already-existing pass `undefined` and stay byte-identical.

3. Each writer emits:
   - `writer_started` right before the Anthropic `messages.create` call
   - `writer_finished` right after parsing the tool_use response (after `buildBlockFromRaw`)

4. `buildChapter` emits `section_ready` after each section is fully assembled (snapshot + prose validated). One event per emitted section (platform_overall, channel_weekly, channel_campaign).

5. The SSE route in `stream/route.ts` (created in commit `8ec9219`) already opens the response stream and writes node-level events. Extend it to construct the `emit` callback that writes each writer/section event as an SSE frame, and pass that callback through `composeReport` via the Hermes atelier node.

6. `atelier.ts` in `src/lib/agents/hermes/nodes/`: add an `emit` argument that the SSE route threads through. Pass it to `composeReport`.

**Acceptance for WS1**

- Existing tests still pass (`emit` defaults to undefined, snapshot fixtures match).
- A new test in `findings-and-callouts.test.ts` (or its own file) asserts: when an emitter is provided, a 2-channel composition fires the expected sequence:
  1. one `writer_started` + `writer_finished` per writer (platform_overall + 2 weekly + 2 campaign + closer = 6 pairs)
  2. one `section_ready` per emitted section
  3. order is deterministic given fixed fake LLM timing
- Manual smoke: re-run Emily's email and tail the LangSmith trace or the SSE log. Confirm per-writer events fire.

### WS2 -- HermesDeckSkeleton component

The visual half. A new component that renders the deck's expected outline as soon as parse_intent lands, then swaps each card from skeleton to populated content as `section_ready` events arrive.

**Files**

- New: `src/components/reports/hermes-progress/HermesDeckSkeleton.tsx`
- `src/components/reports/hermes-progress/useHermesEventStream.ts` (the hook already created in commit `8ec9219`)
- `src/components/reports/DraftFromEmailModal.tsx`

**Change**

1. New component `HermesDeckSkeleton`. Props:
   - `intent: Intent | null` -- seed for the section list; comes from the first `node_finished(parse_intent)` event
   - `sectionsReady: Record<string, ReportSection>` -- map of completed sections, keyed by section id

2. Derive the expected section list deterministically from `intent`:
   - One platform-overall per platform that has any selected channel
   - One channel-weekly + one channel-campaign per (platform, channel) pair
   - The cover and closer slots always exist
   - Order matches the template's natural iteration order (intent.platforms in PLATFORM_ORDER, intent.channels in PLATFORM_CHANNELS[platform])

3. Each expected section renders as either:
   - A skeleton card with shimmer if not in `sectionsReady`
   - A populated mini-card with the section title and a mint "ready" pill if present

4. Layout: stacked cards in a single column, scrolling inside the container if the list overflows. Card height approximates real section heights (use the layout constants from `src/lib/reports/layout.ts` as the source of truth so the swap does not jank).

5. Animations (apply uniformly):
   - Skeleton shimmer: 1.6s linear loop, reuse the existing dashboard shimmer keyframe if one exists in the repo, otherwise define one in `globals.css` named `--animation-shimmer`.
   - Skeleton-to-populated swap: 300ms ease-out crossfade on opacity plus a tiny `translateY` from 4px to 0.
   - "Ready" pill: drop in on the same swap timeline.

6. Status tape labels become richer. Friendly label mapping for writer events:

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

When multiple writers are in-flight (because WS1 parallelism is live), pick the most recent `writer_started` event for the tape label. Optionally show a small "+N more" tag next to it if more than one writer is active; do not enumerate them.

### WS3 -- Wire HermesDeckSkeleton into the modal

**Files**

- `src/components/reports/DraftFromEmailModal.tsx`

**Change**

1. Below the existing status tape + findings feed, render `HermesDeckSkeleton`.
2. The hook `useHermesEventStream` (already in place) maintains: latest node, growing events list. Extend its return to expose `sectionsReady: Record<string, ReportSection>` derived from `section_ready` events.
3. The grid layout from the mockup is: tape on top, two-column body below (feed on the left, skeleton on the right). On narrow viewports, stack vertically (feed above skeleton).
4. On `deck_ready`, leave the populated skeleton visible for ~400ms (so the user sees the final fully-populated grid), then redirect to `/reports/<reportId>`.

## Acceptance criteria

- typecheck clean
- `npm test:unit` passes; new tests for WS1 pass
- Manual: paste Emily's email into the Hermes modal. Confirm:
  - Skeleton appears within 500ms of parse_intent finishing
  - Each section swaps from skeleton to populated as its writer completes, NOT all at once at deck_ready
  - With WS1 parallelism live, sections can swap out of order (e.g. campaign before weekly within the same channel pair)
  - Status tape cycles through per-writer labels during the atelier phase
  - After `deck_ready`, the modal closes after the brief hold and redirects to the deck

- Screen recording attached to the PR description showing the new behavior on Emily's email AND on a multi-channel email (Meta + TikTok). The multi-channel run is the real visual stress test: 5 cards fanning in over ~12s.

## Out of scope

- Token-level streaming inside a single writer's Anthropic call. Per-writer is the granularity ceiling for this PR.
- Manual builder migration to SSE. Still sync POST.
- parse_intent ISO date extraction. Separate workstream.
- Brand or typography changes to the skeleton.
- E2E test for the visual behavior. Unit-level event-sequence test is enough.

## Squad pass

- typecheck
- npm test:unit
- One Emily-email Hermes run with screen recording
- One multi-channel email Hermes run with screen recording
- LangSmith trace links attached to the PR description

## Notes for the agent running this

- All the event types and the SSE infrastructure already exist from commit `8ec9219`. WS1 is purely an extension of the event union plus threading `emit` through the writer chain. Do not rewrite the SSE plumbing.
- The shimmer animation should reuse whatever the dashboard already uses. Grep `animate-pulse|shimmer|skeleton` under `src/components/` first.
- Do not change writer parallelism. WS1 from commit `8befe33` is correct as it stands.
