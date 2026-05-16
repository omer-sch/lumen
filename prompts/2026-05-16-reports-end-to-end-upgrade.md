# Reports end-to-end upgrade (2026-05-16)

Owner: Omer. Run as a single PR on a new branch off `main`.

## TL;DR

Reports today produces a 3-slide deck for one Android Meta pair with a wall-of-prose body and non-functional action buttons. After this PR:

1. Each section card renders as **2 to 4 sharp bullets + a bold one-line "Bottom line"**, not a prose paragraph.
2. The deck spans every platform and channel the user picks (Phase 2 multi-section template flipped on).
3. The analyst layer's deterministic findings (already computed in `ReadyData.anomalies`) are fed to the prose-writer so the writer narrates them instead of re-deriving from raw rows.
4. The manual builder gets platform + channel multi-select pickers (no more hardcoded Android x Meta).
5. Campaign Breakdown tables get colored row arrows that bind to matching colored phrases in the bullets above (the reference deck's "secret sauce").
6. Edit, Regenerate, and Copy buttons work on every section card.

Everything is behind the existing `USE_SMART_REPORTS=live` flag (already set in `.env.local`).

---

## Why this matters

The Lumen Reports MVP is the agent flow's deliverable. Today the deck the user gets back from `/reports` does not look like the deck a CSM would send a client. Three problems compound:

1. **Wall of text.** Each card is a 4 to 6 sentence prose paragraph. Analysts skim, they do not read. The reference Week 18 deck uses prose because it was written by a human; an auto-generated deck reads better as bullets with a bottom-line takeaway.
2. **Wrong scope.** The manual builder hardcodes `platforms: ["android"], channels: ["meta"]`. The Phase 2 multi-section template is in `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` and tested, but no caller invokes it. The single-channel-weekly template ships a 3-slide deck for the same data that should produce a 10 to 30 slide weekly review.
3. **Dead action buttons.** `RegenerateSectionButton` and `EditableText` exist but are not wired into the live Smart Reports surface. Users cannot edit prose, cannot re-run a single section, cannot copy a section out.

---

## Scope (what to do)

Six workstreams, ordered by leverage. Land them in one PR.

### Workstream 1 -- Card format: bullets + bottom line

The biggest visible change. Each prose section currently emits one `ProseBlock` with a `text` paragraph and highlight tokens. Replace this with a structured shape that renders as bullets + a closing "Bottom line" band.

**Files**

- `src/lib/smart-reports/types.ts` -- extend `ProseBlock`
- `src/lib/smart-reports/prose-writer.ts` -- update tool schemas
- `src/lib/smart-reports/prompts/weekly-breakdown.md`
- `src/lib/smart-reports/prompts/campaign-breakdown.md`
- `src/lib/smart-reports/prompts/platform-overall.md`
- `src/components/reports/sections/ProseBlock.tsx` -- renderer
- `src/lib/reports/export-pptx.ts` -- mirror the new layout in PPTX
- Snapshot tests in `tests/` for `ProseBlock`, `composeReport`, `export-pptx`

**Type change**

```ts
// src/lib/smart-reports/types.ts
export type ProseBullet = {
  /** One short data observation with inline citation. */
  text: string;
  /** Highlight tokens parsed from {{good}}/{{bad}}/{{color}} markup. */
  highlights: HighlightToken[];
};

export type ProseBlock = {
  /** Section / family / channel label. Existing. */
  heading?: string;
  /** 2 to 4 bullets, each one short observation + interpretation.
   *  Each bullet carries its own highlight tokens; citation tokens
   *  ([cite:queryId]) live inline in the bullet text. */
  bullets: ProseBullet[];
  /** Single-sentence closing takeaway. Bold band, no highlights inside
   *  (the band itself is the visual emphasis). Required. */
  bottomLine: string;
  /** Optional <> AI: callout when action items match this block.
   *  Existing Phase 3 plumbing -- preserve. */
  actionItem?: string;
};
```

Drop the existing `text` and top-level `highlights` fields. The renderer reads `bullets[].highlights` instead.

**Tool schemas** (in `prose-writer.ts`)

`write_weekly_breakdown` tool input becomes:

```jsonc
{
  "type": "object",
  "properties": {
    "bullets": {
      "type": "array",
      "minItems": 2,
      "maxItems": 4,
      "items": {
        "type": "object",
        "properties": { "text": { "type": "string" } },
        "required": ["text"]
      }
    },
    "bottomLine": { "type": "string" }
  },
  "required": ["bullets", "bottomLine"]
}
```

`write_campaign_breakdown` tool input becomes the same shape inside each block:

```jsonc
{
  "type": "object",
  "properties": {
    "blocks": {
      "type": "array",
      "maxItems": 12,
      "items": {
        "type": "object",
        "properties": {
          "heading": { "type": "string" },
          "bullets": { "type": "array", "minItems": 2, "maxItems": 4, "items": { "type": "object", "properties": { "text": { "type": "string" } }, "required": ["text"] } },
          "bottomLine": { "type": "string" },
          "actionItem": { "type": "string" }
        },
        "required": ["heading", "bullets", "bottomLine"]
      }
    }
  },
  "required": ["blocks"]
}
```

`write_platform_overall` follows the same pattern (one block per channel, each with bullets + bottomLine).

**Prompt rewrites**

In each of the three prompt MD files, replace the "write one paragraph" section with:

```
Output structure:
- 2 to 4 bullets. Each bullet is one short observation: a data point + one-clause interpretation.
  - Carry inline citations [cite:queryId] for every numeric claim.
  - Use {{good}}/{{bad}} highlight markup sparingly; one highlight per bullet at most.
  - Bullets are NOT sentences with periods; they are tight phrases. Examples:
    - "Spend up 18% vs Week 17, driven by Top-Geos doubling daily budget [cite:trend]"
    - "{{bad}}CPA D7 climbed past $90 on Sub Evergreen[cite:network-breakdown]; trailing 30d baseline was $68"
- One Bottom Line sentence. The takeaway, in plain language. No citation, no markup, no jargon.
  Example: "Meta is the bottleneck this week; pause Top-Geos until creative refresh ships."

Do NOT emit prose paragraphs. Bullets and the bottom line are the entire output.
```

Keep the voice anchors in each prompt but rewrite them into bullet form so the model has an example to pattern-match against.

**Renderer** (`ProseBlock.tsx`)

```
[Section heading -- existing]
- Bullet 1 with citations + highlights
- Bullet 2 ...
- Bullet 3 ...
<> AI: action item callout (when present, existing styling)
[Bottom line band -- yellowHEAD yellow background, navy text, bold, single sentence]
```

The bottom line band visually breaks the section. Use the existing `--yellow` brand token. Bullet markers use a 4px square in the relevant brand accent (mint for UA, since current scope is UA only per CLAUDE.md).

**PPTX renderer** (`export-pptx.ts`)

Same structure in the deck:

- Bullets render as `pres.addText` with `bullet: true`, font 12pt Montserrat
- Bottom line is a separate text box, yellow fill, navy text, bold, font 14pt Bricolage Grotesque
- Action item callout uses the existing `<> AI:` styling from Phase 3

Update the `layoutSlides` cursor budget in `src/lib/reports/layout.ts` to account for: bullet rows (0.36in each) + bottom-line band (0.6in). The continuation-slide logic still applies.

### Workstream 2 -- Flip the multi-section template

**Files**

- `src/lib/reports/generate.ts` line 181
- `src/lib/agents/hermes/nodes/atelier.ts` line 71

Both files pass `template: "single-channel-weekly"`. Change to `template: "weekly-review-globalcomix"`.

The multi-section template self-degrades to a single chapter when `dataScope === "client-wide-all-platforms"` (today's BQ reality). The chapter still renders multi-channel inside the platform. The cover surfaces the scope caveat: "Numbers are client-wide across platforms; per-platform breakdown lands once the BigQuery platform filter ships." This is desired -- the user sees the caveat instead of getting a silent single-platform deck that looks correct but isn't.

No prompt or template code change. This is purely a string flip.

### Workstream 3 -- Feed analyst findings to the prompts

**Files**

- `src/lib/smart-reports/prose-writer.ts` -- user-message builders
- The three prompt MD files

`ReadyData.anomalies` is a list of `AnalystFinding`s with `summary`, `severity`, `provenance.algorithm`, `provenance.queryIds`, and a typed `details` payload. Today they are computed and ignored by every Sonnet prompt. Add a `<findings>...</findings>` block to each user message so the writer sees them.

In `buildWeeklyUserMessage`, `buildCampaignUserMessage`, and `buildPlatformOverallUserMessage`, after the existing data sections, append:

```ts
const relevantFindings = args.ready.anomalies.filter(/* by network / family / platform as appropriate to the writer */);
if (relevantFindings.length > 0) {
  parts.push(
    "",
    "<findings>",
    "These findings were computed deterministically by the analyst layer. Each carries a stable id and provenance. Lead with these in your bullets; do not invent findings not in this list. Cite the listed queryIds when referencing the underlying numbers.",
    "",
    ...relevantFindings.map((f) =>
      `- [${f.severity}] ${f.summary} (algorithm: ${f.provenance.algorithm}; queries: ${f.provenance.queryIds.join(", ")})`,
    ),
    "</findings>",
  );
}
```

Filter findings per writer:

- Weekly Breakdown: findings whose `details.network` matches the slice's channel.
- Campaign Breakdown: findings whose `details.campaign_id` matches a campaign in the family group.
- Platform Overall: findings whose `details.network` matches a network on this platform's data slice.

In each prompt MD, add a section after "Hard rules":

```
# Findings

The user message may include a <findings>...</findings> block. These findings are pre-computed by the analyst layer's deterministic detectors (z-score, percent-delta, with cohort maturity gates). When present:

1. The bullets should lead with the listed findings.
2. Do not invent findings the analyst layer did not detect.
3. Citation tokens [cite:queryId] should match the queries listed in each finding's provenance.
```

### Workstream 4 -- Platform and channel pickers

**Files**

- `src/components/reports/ReportsView.tsx` -- add the pickers
- `src/app/(app)/reports/actions.ts` -- forward selections
- `src/lib/reports/generate.ts` -- read selections, drop hardcode

Above the existing prompt textarea on `/reports`, add two chip-style multi-selects:

- "Platforms": Android (default on), iOS (default on), Web (default off, since most clients are Android + iOS)
- "Channels": Meta (default on), Google (default on), TikTok (default on), ASA (default off)

Use the existing GlassCard styling. Selected chips use mint accent (UA team color). The state lives in `ReportsView` local state and is forwarded through `GenerateReportActionInput`:

```ts
export type GenerateReportActionInput = {
  prompt: string;
  fromIso: string;
  toIso: string;
  client: string;
  actionNotes?: string;
  platforms: ("android" | "ios" | "web")[];      // NEW
  channels: ("meta" | "google" | "tiktok" | "apple_search_ads")[]; // NEW
};
```

In `generateReport`, remove the `defaultIntentFor` hardcode and use the user's selections. Validate at least one platform and one channel selected; otherwise return a typed error the UI can render inline.

If the user picks Web but no channel that runs on Web (today only Google), drop Web silently rather than rendering an empty chapter.

### Workstream 5 -- Colored row arrows + matching highlights

The reference deck's most distinctive analyst move. Manual hand-drawn in Milagros's deck; ours can do it deterministically.

**Files**

- `src/lib/reports/types.ts` -- extend `CampaignRow` with a callout field
- `src/lib/smart-reports/templates/weekly-review-globalcomix.ts` -- pre-pick callout assignments
- `src/lib/smart-reports/prose-writer.ts` -- pass assignments to the writer
- `src/lib/smart-reports/prompts/campaign-breakdown.md` -- teach the writer to use the right color
- `src/lib/smart-reports/highlight-markup.ts` -- extend the parser to recognize per-color markup
- `src/components/reports/sections/CampaignBreakdown.tsx` -- render the arrow on the row
- `src/lib/reports/export-pptx.ts` -- mirror in PPTX
- `src/components/reports/sections/callout.ts` -- reuse the existing CALLOUT_HEX palette

**Pre-pick callout assignments** (in the template, before calling the writer):

Score each campaign row in a family by `Math.abs(spendDelta || 0)`. The top 3 rows in each family (cap at 3 to avoid visual noise; fewer if the family has fewer rows) get assigned a color in order from the existing CALLOUT_HEX palette: pink, orange, blue.

```ts
type CampaignCallout = { campaignId: string; color: "pink" | "orange" | "blue" };
function assignCalloutsForFamily(rows: EnrichedCampaignRow[]): CampaignCallout[] {
  return rows
    .slice()
    .sort((a, b) => Math.abs(b.spendDelta ?? 0) - Math.abs(a.spendDelta ?? 0))
    .slice(0, 3)
    .map((r, i) => ({ campaignId: r.campaign_id, color: ["pink", "orange", "blue"][i] as const }));
}
```

Attach the assignment to the `ChannelCampaignSection` so the renderer knows which row gets which arrow.

**Pass assignments to the writer** (in the campaign prompt user message):

```
Callout assignments for this family:
- {color: pink} campaign_id=ABC123 (YH_FB_..._Sub_Android_Evergreen_WW-Top, spendDelta=+32.7%)
- {color: orange} campaign_id=DEF456 (YH_FB_..._SubStart_Android_Evergreen_US, spendDelta=+45.1%)
- {color: blue} campaign_id=GHI789 (YH_FB_..._SubStart_Android_Evergreen_India, spendDelta=-23.3%)

When you reference a row in a bullet, wrap the reference in the matching color markup: {{pink}}...{{/pink}}, {{orange}}...{{/orange}}, {{blue}}...{{/blue}}. The renderer will highlight the bullet phrase in that color and draw an arrow of the same color next to the row in the table above.

Not every bullet must reference a callout row; only the bullets that interpret a callout-flagged campaign.
```

**Renderer** (CampaignBreakdown.tsx):

The table rows already exist. For each row that has a callout assignment, render a small arrow icon (use lucide `ArrowLeft`) absolutely positioned to the right of the row, filled with the callout's color. The bullets above already render their colored highlights via the existing markup parser; extend the parser to accept the three new colors.

**PPTX**: pptxgenjs supports text-box shapes with line and arrow. Place an arrow shape at the row's Y position and the table's right edge. Highlight in the bullet is rendered as a colored text run.

### Workstream 6 -- Action buttons (Edit, Regenerate, Copy)

Each section card already has a header row. Add three icon buttons in the top-right of every section card:

- **Copy** (icon: lucide `Copy`): copies the bullets + bottom line as plain text to clipboard. Show a green check for 1.5s after copy.
- **Edit** (icon: lucide `Pencil`): toggles the card into edit mode. Each bullet text becomes an inline textarea; the bottom line becomes an inline input. Save commits to `useReports().save(report)`. Cancel reverts. Use the existing `EditableText` component.
- **Regenerate** (icon: lucide `RefreshCw`): re-runs the prose-writer for THIS section only, replaces the section's `ProseBlock` array, leaves the structural snapshot table untouched.

**New API route**

`src/app/api/reports/[id]/regenerate-section/route.ts` -- POST endpoint that accepts `{ sectionId: string }`, loads the report from the server store, re-fetches `ReadyData` for the same intent, calls the appropriate writer for the section type (weekly / campaign / platform-overall), validates citations, swaps the prose blocks, saves, and returns the updated section.

Auth: `requireUser` with scope `reports.regenerate-section`, rate-limit 30 per 5 minutes. Cost gate: rate-limit per-report at 10 regenerations per hour to prevent runaway loops.

**Client-side handler** in `RegenerateSectionButton.tsx`:

```ts
async function regenerate() {
  setStatus("regenerating");
  const res = await fetch(`/api/reports/${reportId}/regenerate-section`, {
    method: "POST",
    body: JSON.stringify({ sectionId }),
  });
  if (!res.ok) {
    setStatus("error");
    setError(await res.text());
    return;
  }
  const { section } = await res.json();
  onSectionUpdated(section); // bubble up to ReportsView, replace in place
  setStatus("idle");
}
```

The button shows a spinner while regenerating. If regeneration fails (citation validation throws, Sonnet errors, etc), show an inline toast with the error -- do not silently fall back.

---

## What does NOT change in this PR

- BigQuery queries. The campaigns query still does not pull cohort columns. Campaign breakdown tables still hide the Sub Funnel columns when all rows are zero (existing renderer logic in `CampaignBreakdown.tsx` lines 53-70). That data-layer fix is a separate workstream.
- BQ OS predicate (workstream D2). The template self-degrades to single-chapter; that is expected.
- Template-based PPTX generation. Still using pptxgenjs with coordinate math. The template-based architecture is queued for after this PR.
- The Hermes (email-to-report) pipeline shape. We are only flipping the template string in `atelier.ts`; the rest of the Hermes flow is unchanged.

---

## Acceptance criteria

1. `npm run typecheck` clean.
2. `npm run build` clean (the existing pptxgenjs `node:*` blocker may still be present; do not fix it in this PR if so -- it is a pre-existing issue, but typecheck must be green).
3. `npm test` passes. Update snapshot tests for:
   - `ProseBlock` (new shape)
   - `composeReport` (single-channel-weekly and weekly-review-globalcomix both produce the new bullet shape)
   - `export-pptx` (bullets + bottom line band render)
   - Anomaly findings appear in user messages (capture with a mock client)
4. Manual smoke test on `/reports` as Omer:
   - Pick Android + iOS, Meta + Google + TikTok, date range = May 4 to May 10 2026.
   - Click Generate.
   - Deck has a chapter divider for Android, then Platform Overall, then per-channel Weekly + Campaign for the picked channels. Same for iOS.
   - Cover surfaces the scope caveat ("client-wide across platforms").
   - Every section card has 2 to 4 bullets, a bold yellow bottom-line band, and three working action buttons.
   - Campaign Breakdown sections show colored arrows on up to 3 rows per family, with matching colored highlights in the bullets above.
   - Click Regenerate on a section. Spinner appears, section regenerates within ~10s, the bullets and bottom line change but the table stays the same.
   - Click Edit on a section. Bullets and bottom line become editable. Make a change, click Save. Reload the page. The change persisted.
   - Click Copy. Plain text bullets + bottom line are in the clipboard.
   - Click Export PPTX. Open the file in PowerPoint / Keynote. The bullets render as native PowerPoint bullet lists; the bottom-line band renders as a filled text box. Arrows render as native shapes.

## Out of scope (separate workstreams; do not start in this PR)

- Campaign-grain cohort columns -- needs BQ team coordination first.
- Template-based PPTX (master deck) -- queued in `Status.md`.
- Phase 4 LLM-based action-item classifier -- the existing substring matcher is fine.
- Multi-client support beyond GlobalComix -- `clientHasReportData` still gates everything.
- Replacing pptxgenjs with python-pptx -- queued.

## Squad pass before merge

1. Typecheck: `npm run typecheck`.
2. Tests: `npm test`.
3. Manual: the smoke test above against real BigQuery, three different weeks. Verify no regression in citation validation (every numeric claim still cites a real queryId), no regression in `<> AI:` action item callouts when notes are supplied.
4. Open the PR and squad your own diff. Three sample reports across three different weeks attached to the PR description as PPTX files.
