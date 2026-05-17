# Hermes: parallelize writers + stream progress to the UI (2026-05-16)

Owner: Omer. Single PR on a new branch off `main`. Two workstreams that answer the same product complaint (the Hermes wait is too long) from two angles. WS1 reduces actual wall time; WS2 fills the remaining wait with real-time feedback so the user is never staring at a blank spinner.

## TL;DR

LangSmith trace `10d72e33` (Emily's email, 2 channels picked):

- parse_intent: 3s
- analyze: 18s
- atelier: 37s
- total: 58s

Inside atelier, channels iterate sequentially in `buildChapter`. Each channel adds ~10s. The full-month email (3 platforms × 4 channels = 12 channel pairs + 3 platform-overalls + closer) would run ~3 minutes by the same math. Unworkable.

Two complementary fixes:

- **WS1: Parallelize chapters and channels.** Each writer pair (weekly + campaign) already runs in parallel inside a channel; we expand that to platforms and channels too. Atelier wall time drops from ~37s to ~12s for the 2-channel case, and from ~3 minutes to ~15s for the full-month case.
- **WS2: SSE progress stream + loading UX.** Even at 12s a blank spinner is bad UX. Stream typed events from each node and each writer. The modal renders a status tape + findings feed + skeleton deck that fills in as writers complete. The wait feels like work being shown, not work being hidden.

Order: ship WS1 first (pure backend, no UI dependency), then WS2.

---

## WS1 -- Parallelize chapters and channels

### Files

- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts`
- `tests/unit/lib/smart-reports/weekly-review-globalcomix.test.ts`
- Possibly `package.json` (if `p-limit` is not already a dep)

### Today

`buildChapter` iterates channels sequentially:

```ts
for (const channel of channelsToEmit) {
  const [weekly, campaign] = await Promise.all([
    writeWeeklyBreakdown({ ... }),
    writeCampaignBreakdown({ ... }),
  ]);
  // accumulate sections + citations
}
```

`buildWeeklyReviewGlobalcomix` iterates platforms sequentially:

```ts
for (const platform of platformsToEmit) {
  const built = await buildChapter({ ... });
  // accumulate chapters
}
```

The writer pair within a channel parallelizes already. Channels across a chapter and chapters across the composition do not.

### Change

1. **Inside `buildChapter`, fan out channels.** Run `platformOverall` first (it synthesizes across channels and is the cheapest call). Then `Promise.all` the per-channel writer pairs.

2. **Inside `buildWeeklyReviewGlobalcomix`, fan out chapters.** All platforms run in parallel via `Promise.all`. Today's degraded mode (single chapter) is unaffected.

3. **Concurrency cap.** A full multi-platform multi-channel run would fan out to ~28 concurrent Anthropic calls. Cap to protect against Anthropic rate limits.

   Use `p-limit`. If it is not already in `package.json`, add it -- it is ~1KB and ubiquitous. Cap at `MAX_CONCURRENT_WRITERS = 6` per composition. Make it env-configurable via `LUMEN_MAX_CONCURRENT_WRITERS`, default 6, validated as a positive integer at startup.

   Pass a single shared `Limit` instance from `buildWeeklyReviewGlobalcomix` down into `buildChapter` so the cap covers the entire composition, not just a single chapter.

4. **Preserve ordering.** Section order in the final `Report` must match today's deterministic order: chapters in `intent.platforms` order (intersected with `PLATFORM_ORDER`), channels in `PLATFORM_CHANNELS[platform]` order (intersected with `intent.channels`). `Promise.all` preserves array order, so iterate with `await Promise.all(arr.map(...))` and the result lines up.

5. **Error handling.** A single writer throwing must NOT cancel the others. Use `Promise.allSettled` at the writer-pair level and re-aggregate. Failed writers produce a placeholder section with a "Regeneration needed" prose block, logged via the existing `composeReport citation validator failed` channel. The deck still renders; the user clicks the regenerate icon on the affected card.

### Acceptance for WS1

- Unit test in `weekly-review-globalcomix.test.ts`: deterministic fake LLM client returns each writer's output with a 100ms delay. Sequential implementation would run 16 writers in ~1.6s; the parallel implementation completes in ~100-200ms. Assert wall time stays under 300ms.
- Existing tests still pass with the same output (Promise.all preserves order, the snapshot diffs against existing fixtures should be byte-identical).
- Manual smoke against real BQ: re-run Emily's prior email. LangSmith trace shows atelier ~12s, not ~37s. Total run under 30s.
- One Anthropic rate-limit safety test: run a hypothetical 16-writer composition with `MAX_CONCURRENT_WRITERS=2` and confirm only 2 calls are in-flight at any time (mock the client; assert max parallel calls).

---

## WS2 -- SSE progress stream + loading UX

### What the user sees

When the user submits the paste-email modal (or clicks Generate in the manual builder), the spinner is replaced by three stacked layers, top to bottom. All three update in real time as the graph progresses.

1. **Status tape.** Single-line header at the top with a soft pulse. Plain-language label for the current step. Mapping from internal node name to user-friendly label:

   | Internal | User-facing |
   |----------|-------------|
   | parse_intent | Reading your email |
   | analyze | Pulling BigQuery rows and looking for anomalies |
   | atelier (start) | Drafting the deck |
   | writer: platform_overall | Drafting the platform overview |
   | writer: channel_weekly (Meta) | Drafting the Meta weekly breakdown |
   | writer: channel_campaign (Meta) | Drafting the Meta campaign breakdown |
   | writer: closer | Wrapping up |
   | review_gate | Saving the draft |

2. **Findings feed.** A growing list of small cards below the tape. Each card lands as a node finishes. The card text is a friendly summary of the node's output, not the raw `notes` string.

   Examples (taken from the live trace fields):
   - After parse_intent: "Parsed your email: GlobalComix, iOS + Android, Meta + TikTok, this past week. Confidence 92%."
   - After analyze: "Pulled 4 weeks of trailing history (Week 16 to Week 19). Detected 9 anomalies across campaigns."
   - After each writer: "Drafted Meta weekly breakdown (3 bullets, 1 highlight)."
   - After deck_ready: "Saved draft. Opening it now…"

   Cards stay visible after the run completes so the user has a quick audit trail of what happened. The whole feed scrolls inside its container.

3. **Skeleton deck.** Low-fidelity outline of the deck below the feed. Appears as soon as parse_intent finishes (we know the section list from intent + the template's hardcoded order). Each section card starts as a grey skeleton with a subtle shimmer; each one swaps to its real content the moment its writer's `section_ready` event arrives.

   The cover renders first because it is deterministic and does not wait on a writer. Chapter dividers paint next. Each platform-overall, channel-weekly, and channel-campaign skeleton then fills in independently and possibly out of order (because writers run in parallel after WS1).

### Server side

#### New SSE route

Create `src/app/api/agents/hermes/stream/route.ts`:

- POST endpoint with the same input shape as the existing sync route (email body, optional contact name, optional action notes).
- Returns `Content-Type: text/event-stream`.
- Streams typed events as the graph executes.
- The existing sync POST route stays for backward compatibility with tests; the modal switches to the new stream route.

Each event is one SSE frame:

```
data: {"type":"node_started","node":"parse_intent","at":"2026-05-16T..."}

```

(blank line after the data line).

#### Event shape

Define in `src/lib/agents/hermes/events.ts`:

```ts
export type HermesNodeName = "parse_intent" | "analyze" | "atelier" | "review_gate";

export type HermesEvent =
  | { type: "run_started"; runId: string; at: string }
  | { type: "node_started"; node: HermesNodeName; at: string }
  | { type: "node_finished"; node: HermesNodeName; notes: string; at: string }
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
    }
  | { type: "deck_ready"; reportId: string; at: string }
  | { type: "error"; message: string; at: string };
```

#### Wiring

Two options for wiring, ordered by complexity. Ship Option B because the per-writer events are what make the skeleton fill in incrementally; Option A is the fallback if blast radius worries.

**Option A (simple).** Wrap the existing graph run in a function that emits events after each node finishes. UI sees four-or-five updates per run. No per-writer events; the skeleton paints in one swap at deck_ready.

**Option B (rich, recommended).** Thread an event emitter through `buildWeeklyReviewGlobalcomix`, `buildChapter`, and `prose-writer.ts`. Each writer call accepts an optional `emit?: (event: HermesEvent) => void` argument. When `emit` is provided, the writer fires `writer_started` before the Anthropic call and `writer_finished` after. The template fires `section_ready` once a section is assembled (including snapshot + prose). Tests pass `undefined` for `emit` and the writers behave exactly as today (the parameter is non-breaking).

Use a TypedEventTarget or a tiny inline EventEmitter; do not pull in a heavy dep. The SSE route owns the lifecycle: opens the response stream, creates the emitter, passes it to the graph, writes each emitted event as an SSE frame, closes the stream on deck_ready or error.

The Hermes graph itself stays the same; this is a pure observation channel.

### Client side

#### New components

Under `src/components/reports/hermes-progress/`:

- `HermesRunStatus.tsx` -- the status tape. Reads the latest node or writer event and renders the friendly label with a soft pulse.
- `HermesFindingsFeed.tsx` -- the growing card list. Appends cards as `node_finished` and `writer_finished` events arrive. Memoizes by event ordinal so React does not re-render the full list on every event.
- `HermesDeckSkeleton.tsx` -- the skeleton outline. Reads the seed section list from `intent` (received on the first `node_finished(parse_intent)` event), renders one grey card per expected section, swaps each card to its real content on the matching `section_ready` event.
- `useHermesEventStream.ts` -- a hook that opens an EventSource, parses events, exposes them as React state.

All three are pure components reading from the hook. No fetch or business logic inside.

#### Hooked into the modal

`src/components/reports/DraftFromEmailModal.tsx`:

- On submit, instead of POSTing to the sync route, POST to the new SSE route via `fetch` with a response that reads as a stream (EventSource does not support POST out of the box; use a `fetch` + `ReadableStream` reader).
- Render the three components below the modal body while the stream is open.
- On `deck_ready`, close the stream, dismiss the modal, redirect to `/reports/<reportId>`.
- On `error`, surface the message inline; do not redirect.

The existing modal layout stays; the spinner area becomes the three-layer progress region.

#### Friendly-label mapping

```ts
const NODE_LABELS: Record<HermesNodeName, string> = {
  parse_intent: "Reading your email",
  analyze: "Pulling BigQuery rows and looking for anomalies",
  atelier: "Drafting the deck",
  review_gate: "Saving the draft",
};

const WRITER_LABEL = (
  sectionType: "platform_overall" | "channel_weekly" | "channel_campaign" | "closer",
  platform: string | null,
  channel: string | null,
): string => {
  const platformLabel = platform ? capitalize(platform === "ios" ? "iOS" : platform) : "";
  const channelLabel = channel ? capitalize(channel === "asa" ? "ASA" : channel) : "";
  switch (sectionType) {
    case "platform_overall":
      return `Drafting the ${platformLabel} overview`;
    case "channel_weekly":
      return `Drafting ${platformLabel} ${channelLabel} weekly breakdown`;
    case "channel_campaign":
      return `Drafting ${platformLabel} ${channelLabel} campaign breakdown`;
    case "closer":
      return "Wrapping up";
  }
};
```

#### Findings-feed card generation

Cards are derived from `node_finished` and `writer_finished` events. Examples (deterministic from the event payload, not from the LLM):

- `node_finished(parse_intent)` -> `"Parsed your email: ${client}, ${platforms.join(' + ')}, ${channels.join(' + ')}, ${period.label}. Confidence ${Math.round(confidence * 100)}%."`
- `node_finished(analyze)` -> `"Pulled ${history.networks.length / 4} weeks of trailing history. Detected ${anomalies.length} anomalies."`
- `writer_finished` -> `"Drafted ${friendly section label} (${proseBlocks} blocks, ${highlights} highlights)."`

The intent and findings fields needed for these cards come along on the `node_finished` event's payload. Extend `node_finished` to carry an optional `data` field for the most recent intent / analyze output if needed.

### Acceptance for WS2

- Open the paste-email modal. Paste Emily's email. Submit.
- Within 1 second, the spinner is replaced by the three layers.
- The status tape cycles through at least 4 friendly labels in order.
- The findings feed accumulates at least 4 cards by the time the run completes.
- The skeleton deck shows section outlines after parse_intent finishes; each section swaps to populated content as its writer's `section_ready` fires.
- After `deck_ready`, the modal closes and `/reports/<reportId>` opens with the full deck.
- E2E test: assert the event stream produces, in order, at least: `run_started`, `node_finished(parse_intent)`, `node_finished(analyze)`, one or more `writer_finished`, `deck_ready`.

### Loading state visual treatment

Use the existing yellowHEAD design tokens. Status tape uses the dark navy surface with mint accent for the pulse dot. Findings cards use the muted card style from the dashboard. Skeleton placeholders use the shimmer treatment already shipped on the dashboard's loading state.

The skeleton heights should approximate the real section heights so the layout does not jump when content lands. Use the per-section layout constants from `src/lib/reports/layout.ts` as the source of truth for those heights.

---

## What this PR does NOT do

- Does not fix the parse_intent prompt's date extraction. If a full-month email still parses to `iso_start: null`, that is a separate parse_intent fix.
- Does not invalidate the Redis BQ cache. The Sync now admin button is the lever.
- Does not stream Sonnet tokens as the prose is being generated. That is a per-writer token-streaming rewrite; out of scope. The current granularity is "per writer call" not "per token."
- Does not change the section layout, the brand styling, or the PPTX export. Renderer is untouched.
- Does not migrate the manual builder to SSE. The manual builder stays sync POST; only the Hermes paste-email modal moves to SSE. (The manual builder runs in ~30s after WS1 because it skips Hermes nodes entirely; the sync wait is tolerable. If Omer wants the manual builder on SSE later, it is a small follow-up.)

## Order of work

1. WS1 alone in commit 1. Backend-only, no UI dependency. Verify against Emily's email trace: atelier ~12s.
2. WS2 in commits 2 through N. SSE route, event types, then the three UI components, then the modal wire-up.
3. Ship both as one PR so the user-visible win lands together.

## Squad pass before merge

- typecheck clean
- npm test:unit passes
- npm test:e2e passes
- One real Hermes run attached to PR description with LangSmith trace + screen recording of the three-layer loading UX
- Wall-time comparison table: before / after on the same email body, both 2-channel and (degraded) multi-channel cases
- Anthropic concurrency sanity check: tail logs during a heavy run, confirm `MAX_CONCURRENT_WRITERS` is the effective ceiling
