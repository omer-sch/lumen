# Dashboard full rework: filter wiring bug fix + three-tab IA + cadence promotion + WS7.C scorecard + design polish (2026-05-18)

Owner: Omer. Single large PR on a new branch off `main` named `dashboard-full-rework`. Six workstreams that close the entire dashboard punch list surfaced by the 2026-05-18 audit. Supersedes both `2026-05-18-dashboard-filter-wiring-bugfix.md` and `2026-05-18-dashboard-tabs-and-polish.md` (kept on disk for traceability only). Also supersedes the still-deferred WS7.C scorecard work from the earlier `2026-05-17-globalcomix-full-implementation.md`.

## Why this is happening

Three things are wrong with the dashboard today, in increasing order of complexity:

1. **The OS and Platform filters silently lie.** `useDashboardData` (which drives the 5 existing dashboard sections — KPI tiles, TrendChart, ChannelMix, NetworkBreakdown, PaybackCurve) was never updated to consume the new `os` and `platforms` from `useGlobalFilters`. The user clicks `iOS` or `Meta` and most of the dashboard keeps showing total-everything numbers. This is a trust-killer.

2. **The page mashes three analytical scopes together.** Acquisition (which channels are performing), Lifecycle (subscriber state), Attribution (data trust) sit at the same visual level on one long scroll. They have legitimately different filter semantics — OS doesn't apply to subscriber lifecycle, date range means different things across them, and the page is too long.

3. **The new sections sit at a lower visual polish level than the existing ones.** KPI-shaped tiles in SubscriberLifecycle / PaidVsOrganic re-roll a worse version of `KpiCard`. No loading skeletons (layout jumps on cold cache). No row hover or cell tinting on the new tables. Empty windows show `return null` instead of sized empty-state cards. TopBar chips aren't pixel-equivalent to `ClientSelector`. And `NetworkBreakdown` never got the WS7.C color-coded scorecard styling — the helper landed in the previous PR without being wired in.

This PR fixes all three.

## Spec sources

Read before starting:

- **Audit + IA proposal** — chat conversation 2026-05-18. The two diagrams there ("Dashboard filter audit: what actually filters today" and "Proposed: three tabs under one /dashboard") are the target spec.
- **yellowhead-brand skill** — `.claude/skills/yellowhead-brand/SKILL.md`. The single source of truth for visual decisions. Re-read at the start.
- **Gold-standard model components** — `KpiCard.tsx`, `TrendChart.tsx`, `NetworkBreakdown.tsx`, `ChannelMix.tsx`, `ClientSelector.tsx`, `DateRangePicker.tsx`. These are the bar to clear.
- **UI primitives** — `GlassCard`, `CountUpNumber`, `Skeleton`, `EmptyState`, `SectionError`, `InfoCallout`, `LivePulse`, `SectionBreak`.
- **Existing helpers** — `src/lib/dashboard/{delta-signal,cell-tone,aggregate-trend}.ts`.

## Target IA — three tabs under one /dashboard

`/dashboard` keeps one route. Below the TopBar, three tabs. URL state `?tab=performance` (default omitted from URL):

### Tab 1 — Performance (default)

The acquisition story.

**Sections, in order:**
1. KPI strip (Spend / Installs / CPA D7 / Sub D7) — existing `KpiCard` row
2. Shared **Cadence toggle** (Daily / Weekly / Monthly) — drives both #3 and #4
3. TrendChart — respects cadence
4. CadenceTable — respects same cadence
5. NetworkBreakdown — with color-coded scorecard styling (WS5)
6. ChannelMix donut
7. WeekendsVsWeekdays
8. PaybackCurve
9. Placeholder slot for Geographic + Creative (when their UI ships)

**Filters active:** Date, OS, Platform, Client. All chips visible on TopBar.

**Date semantic:** "Install cohorts opening in this window." A 7-day window will show `—` for Sub D7 on the last 6 days (existing maturity gate).

### Tab 2 — Lifecycle

The subscriber state.

**Sections, in order:**
1. SubscriberLifecycle KPI strip (Subs / Churn / Net Sub) — using real `KpiCard` instances
2. OS donut (iOS / Android / Web) — OS as a chart dimension, NOT a filter
3. Net Sub Over Time — respecting active date range, NOT hardcoded
4. Daily Sub / Churn / Net Sub table

**Filters active:** Date, Client. OS and Platform chips hidden on this tab.

**Date semantic:** "Subscription events in this window" (`event_date BETWEEN from AND to`).

### Tab 3 — Attribution

The trust story.

**Sections, in order:**
1. BCAC headline tile (promoted out of PaidVsOrganic) — single hero `KpiCard`
2. PaidVsOrganic donut + share bar (without BCAC inside)
3. Attribution Validation table — placeholder until WS5 UI ships
4. Coverage warnings panel — AppLovin pre-coverage, SKAdNetwork stale, Pubmint missing spend
5. Data freshness debug — `DataFreshnessBar` lives here

**Filters active:** Date, OS, Platform, Client. All chips visible.

**Date semantic:** "Attribution data reported in this window."

## TL;DR

Six workstreams, single PR. Ship in numbered order — each builds on the previous.

1. **WS1 — Filter wiring fix.** Three lines: `useDashboardData` consumes `os` and `platforms` from `useGlobalFilters` and passes them to all 6 existing `/api/bq/*` routes. Closes the trust-killer.
2. **WS2 — Tab structure.** URL-driven `?tab=` state. Tab strip below TopBar. Three new tab components. `DashboardView` slims into an orchestrator.
3. **WS3 — Tab-adaptive TopBar + section cleanup.** OS / Platform chips unmount on Lifecycle tab. Date subtitle adapts per tab. Cadence toggle lifts to dashboard-level shared state. NetSubBars window hardcode removed. BCAC moves to Attribution tab.
4. **WS4 — NetworkBreakdown WS7.C scorecard.** Wire `cell-tone.ts` into NetworkBreakdown (deferred from the prior PR).
5. **WS5 — Visual polish.** Five sub-workstreams: tile parity, section skeletons, table row treatment, empty-state cards, TopBar chip parity.
6. **WS6 — Housekeeping.** Status.md, Decisions.md, CLAUDE.md IA section, PR description with open questions.

Estimated PR size: 25-35 files touched. ~1,000-1,500 lines added, ~250-350 lines removed. Test budget: +60-90 unit, +4 E2E.

---

## WS1 — Filter wiring bug fix

Three-line change. Ships as the first commit so every subsequent workstream assumes filters flow correctly.

### File in scope

```
src/lib/dashboard/use-dashboard-data.ts
src/components/dashboard/DashboardView.tsx   // the caller
```

### Today

`useDashboardData` takes `{ from, to, client }`. URLSearchParams at line 112 carries only those three params. The hook never sees `os` or `platforms` from `useGlobalFilters`, so the 6 endpoints it fetches return total-everything regardless of the TopBar filters.

### Change

**Step 1 — Extend the hook's input type:**

```ts
// src/lib/dashboard/use-dashboard-data.ts ~line 18
type Args = {
  from: Date;
  to: Date;
  client: string;
  os: OsFilter;                  // import from "@/lib/filters/types"
  platforms: PlatformFilter[];
};
```

**Step 2 — Add params to the URL when non-default. Defaults stay omitted so existing cache entries hit on the first post-deploy load:**

```ts
// ~line 112
const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
if (os !== "total") qs.set("os", os);
if (platforms.length > 0) qs.set("platforms", platforms.join(","));
```

`boundsQs` stays narrow — `/api/bq/data-bounds` is global per client and doesn't take filters.

**Step 3 — Update the caller in `DashboardView.tsx`:**

```ts
const { from, to, client, os, platforms, setCustomRange } = useGlobalFilters();
const { data, loading, errors, bounds, windowEmpty, refetch } =
  useDashboardData({ from, to, client, os, platforms });
```

**Step 4 — Add to effect deps so filter changes re-trigger the fetch:**

```ts
}, [client, fromIso, toIso, os, platforms.join(","), nonce, refetch]);
```

`platforms.join(",")` is the stable-identity trick — `platforms` is a new array reference every render but the joined string only changes when actual values change.

### Tests

In `tests/unit/lib/dashboard/use-dashboard-data.test.ts` (create if missing):

1. Default filters (`os = "total"`, `platforms = []`): fetch URLs do NOT carry `os` or `platforms` params (cache shape preserved).
2. `os = "ios"`: fetch URLs carry `os=ios`.
3. `platforms = ["meta", "google"]`: fetch URLs carry `platforms=meta%2Cgoogle`.
4. Re-render with same platforms by reference identity NEW: no extra fetch fires (the `.join(",")` dep saves the thrash).
5. Re-render with `os` changed: a single new fetch fires.

### Acceptance

- Click `iOS` on TopBar → KPI tiles, TrendChart, ChannelMix, NetworkBreakdown, PaybackCurve all refetch and show iOS-only numbers.
- Click `Meta` → same sections narrow to Meta only.
- Default filters produce identical URL strings to pre-PR (cache stays warm).
- TypeScript clean. All existing tests pass.

---

## WS2 — Tab structure

### File touchpoints

```
src/lib/filters/types.ts                              // add DashboardTab type
src/lib/filters/use-global-filters.ts                 // add tab state + setter
src/components/dashboard/DashboardTabs.tsx            // new — tab strip component
src/components/dashboard/tabs/PerformanceTab.tsx      // new
src/components/dashboard/tabs/LifecycleTab.tsx        // new
src/components/dashboard/tabs/AttributionTab.tsx     // new
src/components/dashboard/DashboardView.tsx            // shrink to orchestrator
```

### Change

**URL state.** Add to `src/lib/filters/types.ts`:

```ts
export type DashboardTab = "performance" | "lifecycle" | "attribution";

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  value === "performance" || value === "lifecycle" || value === "attribution";
```

In `useGlobalFilters`:
- Extend `GlobalFilters` interface with `tab: DashboardTab`.
- Default `"performance"`. Omit from URL when default.
- Add `setTab(tab: DashboardTab)` callback.
- Add `tab` to the URL-parse step and to the returned object.

**Tab strip.** New component `src/components/dashboard/DashboardTabs.tsx`. Match the visual shape of the existing `ModeToggle` in `DashboardView.tsx` (the "My / Lumen" toggle at lines 246-315 is the model — same segmented-control language, mint accent on active, focus-visible ring). Three tabs. Keyboard arrow-key navigation.

**Three tab components.** Each renders the section list for its tab as described in the "Target IA" section above. Each is its own file under `src/components/dashboard/tabs/`. Each consumes `useGlobalFilters` and `useDashboardData` as needed. The existing section components (KpiCard, TrendChart, CadenceTable, etc.) are reused — these wrapper tabs just compose them.

**`DashboardView` becomes a thin router:**

```
TopBar
DashboardHeader
DashboardTabs                                     // new
{tab === "performance" && <PerformanceTab />}
{tab === "lifecycle"   && <LifecycleTab />}
{tab === "attribution" && <AttributionTab />}
PinnedSection                                     // stays page-level
```

Target: `DashboardView` shrinks from ~600 lines to under 200 lines.

`AIModeView` stays per-tab. Each tab can flip to AI Mode independently. Default off on all tabs.

### Acceptance

- `/dashboard` renders Performance tab by default.
- `/dashboard?tab=lifecycle` renders Lifecycle tab directly.
- Clicking a tab updates URL and re-renders without full page nav.
- Left / Right arrow keys cycle through tabs when one is focused.
- `DashboardView` is < 200 lines.
- Unit test asserts URL ↔ tab parsing both directions.
- E2E: open `/dashboard`, click Lifecycle tab, see URL change and Lifecycle sections render.

---

## WS3 — Tab-adaptive TopBar + section cleanup

### WS3.A — TopBar adapts per tab

In `src/components/shell/TopBar.tsx`, read `useGlobalFilters().tab`. Conditionally render the filter chips:

- **Performance tab:** Date + OS + Platform + Client (all four).
- **Lifecycle tab:** Date + Client only. OS + Platform chips literally unmount (NOT just CSS-hidden — actually leave the DOM so they can't be keyboard-tabbed-to).
- **Attribution tab:** Date + OS + Platform + Client (all four).

State preservation: when chips disappear on Lifecycle, do NOT clear the URL params. User navigates back to Performance, their `?os=ios&platforms=meta` selection is still active.

**Date range subtitle.** Add a one-line subtitle below or next to the DateRangePicker that varies per tab:

- Performance: `"Install cohorts opening in this window"`
- Lifecycle: `"Subscription events in this window"`
- Attribution: `"Attribution data reported in this window"`

Use a `text-xs text-muted` line. Don't make it visually noisy.

### WS3.B — Cadence state promotion

Today: `CadenceTable` (`src/components/dashboard/CadenceTable.tsx` ~line 43) holds the Daily / Weekly / Monthly toggle in `useState<Cadence>("weekly")`. `TrendChart` shows the same time series at a different granularity but doesn't share state. They disagree.

Change: add `cadence: Cadence` to `useGlobalFilters`. Default `"weekly"`. Persist as `?cadence=`. Only relevant on Performance tab.

In `PerformanceTab.tsx`, render a single shared cadence toggle at dashboard level, above both TrendChart and CadenceTable. Both consume `cadence` from `useGlobalFilters` and re-render in agreement.

`CadenceTable.tsx` loses its internal `useState`. Becomes a pure presentational component receiving `cadence` as a prop. `TrendChart` adds a cadence prop (or reads from the hook) and uses `aggregate-trend.ts` to bucket its trend data to the matching granularity.

### WS3.C — NetSubBars window cleanup

Today: `NetSubBars` inside `SubscriberLifecycle` does `rows.slice(-30)` regardless of active date range.

Change: remove the slice. The component receives the full set of `NetSubPoint` rows from `/api/bq/total-subs?view=net-sub-trend` for the active date range. 7-day window → 7 bars. 90-day window → 90 bars. The chart's x-axis adapts via the existing recharts auto-tick logic.

### WS3.D — BCAC promotion to Attribution tab headline

Today: `PaidVsOrganic.tsx` renders BCAC inside its own tile grid (the `BcacTile` component at ~line 105-145).

Change:
- Remove the BCAC tile from inside `PaidVsOrganic`. The component now shows: KPI strip (Sub Total / Sub Paid / Sub Organic) + the share bar. No BCAC inside.
- In `AttributionTab.tsx`, render a new top-level component `BcacHeadline` (or `BcacKpiCard`) as the tab's hero. A single `KpiCard size="hero"` with BCAC as the value, "Blended Customer Acquisition Cost" as the hint, `direction="lower-better"`, `highlight={true}`, `enterIndex={0}`.

Compute BCAC the same way it was computed in PaidVsOrganic — total paid spend ÷ total subs (paid + organic) in the active window. Reuse the same fetch (the existing `/api/bq/total-subs` + `/api/bq/dashboard-kpis` for spend) so we don't re-implement.

### Acceptance for WS3 as a whole

- Lifecycle tab: OS + Platform chips are NOT in the DOM. Performance + Attribution tabs: they are.
- Switching tabs preserves filter URL state.
- Date subtitle changes per tab.
- Cadence toggle is one shared control on Performance tab. Switching Weekly → Monthly re-renders both TrendChart and CadenceTable in agreement.
- `?cadence=monthly` persists across refresh.
- `NetSubBars` no longer hardcodes 30 days. 90-day window → 90 bars.
- `PaidVsOrganic` no longer renders BCAC. `BcacHeadline` renders on Attribution tab as a hero KpiCard.
- Unit tests assert: conditional chip rendering, cadence prop threading, BCAC value computation, NetSubBars row count matches active range.
- E2E: select `?os=ios&platforms=meta`, navigate to Lifecycle (chips gone), back to Performance (chips return with selection intact).

---

## WS4 — NetworkBreakdown WS7.C scorecard

Deferred from `globalcomix-full-implementation` (Claude Code's commit message at `70077db` explicitly punted this — *"helper landed; visual integration is a follow-up so I don't risk regressing the existing breakdown surface"*).

### Today

`src/components/dashboard/NetworkBreakdown.tsx` renders rate-metric cells (CPI, CPA D7, ROI D7) with plain styling. The previous-period baseline (`trailingCpaD7Avg` on each `NetworkRow`) drives a single row-level status pill but not per-cell tinting.

### Change

Import `cellTone` from `src/lib/dashboard/cell-tone.ts`. Apply per cell to the rate metrics. Baseline is **previous-period same-network** — already in the query as `trailingCpaD7Avg` and analogous trailing fields. Verify which trailing fields are exposed on `NetworkRow` in `src/types/dashboard.ts`; if the trailing baselines for non-CPA metrics aren't projected, extend the query and the type in this WS (small SQL change in `_queryGlobalComixNetworkBreakdown`).

Tone rules already encoded in `cell-tone.ts`:
- Lower-is-better (CPI, CPA D7): `good` ≤ baseline × 0.9, `bad` ≥ baseline × 1.2, `warn` ≥ baseline × 1.05.
- Higher-is-better (ROI D7): inverted.

Render via background tint:

```tsx
const tone = cellTone(value, baseline, direction);
const bg = tone === "good" ? "color-mix(in oklab, var(--color-ua) 10%, transparent)" :
           tone === "bad"  ? "color-mix(in oklab, var(--color-creative) 10%, transparent)" :
           tone === "warn" ? "color-mix(in oklab, var(--color-yellow) 8%, transparent)" :
                             "transparent";
```

Hover tooltip on tinted cells: `"CPA D7 is 18% above this network's previous-period average."`

Keep the existing row-level status pill — that's a per-network status, distinct from per-metric cell tinting.

### Acceptance

- Each rate-metric cell on NetworkBreakdown shows soft tinted background driven by cellTone.
- Hover tooltip explains the tone in words with the percentage.
- Cell tints meet 4.5:1 contrast against `--text-primary`.
- Unit test: `cellTone(46, 22, "lower-better") === "bad"` (46 ≥ 22 × 1.2).
- Existing row-level status pill unchanged.

---

## WS5 — Visual polish

Five sub-workstreams covering the gap between the new component polish level and the existing dashboard's bar.

### WS5.A — Tile parity

Today `SubscriberLifecycle` and `PaidVsOrganic` define inline KPI tiles (`KpiTile`, `BcacTile`, `Tile`) that reproduce a worse version of `KpiCard`. Replace them with real `KpiCard` instances.

`KpiCard` accepts: `value: string` (pre-formatted), `delta: number | null`, `direction: "higher-better" | "lower-better"`, `size: "hero" | "compact"`, `enterIndex` for stagger, `highlight` for the section lead.

Mappings:

- **SubscriberLifecycle row** (Lifecycle tab):
  - New subscribers: `delta=null`, `direction="higher-better"`, `size="compact"`, `enterIndex=1`
  - Cancellations: `delta=null`, `direction="lower-better"`, `size="compact"`, `enterIndex=2`
  - Net Sub: `delta=null`, `direction="higher-better"`, `size="compact"`, `enterIndex=3`, `highlight={true}`

- **PaidVsOrganic row** (Attribution tab, after BCAC moves out):
  - Sub Total: `size="compact"`, `enterIndex=1`
  - Sub Paid: `size="compact"`, `enterIndex=2`
  - Sub Organic: `size="compact"`, `enterIndex=3`

- **BcacHeadline** (Attribution tab hero, new):
  - Single `KpiCard size="hero"`, `delta=null`, `direction="lower-better"`, `highlight={true}`, `enterIndex=0`

`delta=null` is honest where there's no period-over-period baseline; KpiCard renders `—` per its existing logic. Don't fabricate.

### WS5.B — Section-shaped skeletons

Add to `src/components/ui/Skeleton.tsx`:

```ts
export function CadenceTableSkeleton()         // header + cadence toggle + 4 placeholder rows
export function WeekendsVsWeekdaysSkeleton()   // header + 2-row table + bar placeholder
export function SubscriberLifecycleSkeleton()  // header + 3 KpiCardSkeleton + 2 chart placeholders
export function PaidVsOrganicSkeleton()        // header + 3 KpiCardSkeleton + share-bar placeholder
export function BcacHeadlineSkeleton()         // single hero KpiCardSkeleton
```

Each follows the `KpiCardSkeleton` pattern (same outer GlassCard shape, `Skeleton` placeholders sized to match eventual content). Replace every `if (loading) return null` in the new sections with the matching skeleton mount. Respects `prefers-reduced-motion`.

### WS5.C — Table row treatment

CadenceTable + WeekendsVsWeekdays get:

1. **Row hover state.** Background `color-mix(in oklab, var(--color-ua) 6%, transparent)` via CSS `:hover`.
2. **Cell tinting via cellTone** on rate metrics:
   - CadenceTable: `cpaD7`, `roiD7`, `installCvr`. Baseline = table's own grand-total average.
   - WeekendsVsWeekdays: `cpaD7`, `roiD7`, `installCvr`, `subCvr`. Baseline = the OTHER row (weekend-vs-weekday is the comparison; each side is the other's baseline).
3. **Delta column on CadenceTable.** New rightmost column `Δ vs prior period`. For Weekly: prior week. For Monthly: prior month. For Daily: `—`. Computed client-side from cadence-aggregated rows. Render as a delta chip matching KpiCard's chip shape (ArrowUpRight / ArrowDownRight, mint or coral tint by direction).

### WS5.D — Empty-state cards

Replace `if (!loading && empty) return null` in each new section with a sized empty-state card using the existing `EmptyState` primitive. Per-section message + hint:

- CadenceTable: `"No data for this window."` / `"Try a wider date range."`
- WeekendsVsWeekdays: `"No data for this window."` / `"Try a wider range or remove the platform filter."`
- SubscriberLifecycle: `"No lifecycle data."` / `"Lifecycle data starts 2020-11-18."`
- PaidVsOrganic: `"No paid/organic split."` / `"Try widening the date range."`

If `EmptyState` doesn't accept a `hint` prop, add one (additive API change). Section header stays visible so user knows the slot. Layout doesn't shift.

### WS5.E — TopBar chip parity

`OsFilter` and `PlatformFilter` triggers become pixel-equivalent to `ClientSelector`:

- Icon `strokeWidth`: remove the `strokeWidth={2}` prop. Use lucide default.
- Neutral state border: `var(--border-default)` (not `var(--border-subtle)`).
- Hover ring: match ClientSelector's `shadow-elevated` or equivalent.
- Drop the `"OS · "` prefix in OsFilter label. Icon + value is enough.

### Acceptance for WS5 as a whole

- SubscriberLifecycle + PaidVsOrganic no longer define inline tile bodies.
- Cold-cache reload of `/dashboard` shows skeletons in every section slot, then swap to content with no layout shift.
- CadenceTable + WeekendsVsWeekdays show row hover + cell tinting + (Cadence only) delta column.
- Empty windows show sized empty-state cards.
- TopBar trio (OsFilter / PlatformFilter / ClientSelector) reads as three visually equivalent dropdowns.
- All new visual treatments respect `prefers-reduced-motion`.

---

## WS6 — Housekeeping

Update at the end of the PR, not during development.

1. **`Lumen Vault/Status.md`** — move in-flight dashboard items to a shipped section. Add new in-flight entry for the Smart Reports prose-writer follow-up (the analyst-layer integration that didn't ship in the prior PR).
2. **`Lumen Vault/Decisions.md`** — append a dated entry summarizing what shipped: filter wiring fix, three-tab IA, cadence promotion, WS7.C scorecard, visual polish. Cite the PR by commit hash if known.
3. **`Lumen Vault/Technical/BigQuery Warehouse.md`** — no change (this PR doesn't touch the data layer).
4. **CLAUDE.md** — the IA section currently describes the dashboard as one page. Update the Dashboard section to describe the three tabs and their filter semantics. Keep it brief — one paragraph per tab.
5. **PR description** — surface the three open questions from the earlier audit that this PR does NOT resolve:
   - Pubmint cohort attribution without matching spend table (~7.7k rows / 90d) — flagged for Gabby
   - SKAdNetwork ingestion stale since 2025-08-04 — surfaced as a coverage warning on Attribution tab; flagged for Gabby
   - `dwh_total_subs_globalcomix.event_date` semantics (future-dated rows up to 2027-03-17) — filtered to `<= CURRENT_DATE()` for safety; flagged for Gabby
6. **PR description also includes:** the two design decisions made by Omer that informed this PR — (a) Performance / Lifecycle / Attribution tab assignment, (b) Pinned Section stays page-level (not per-tab), (c) AI Mode is per-tab so the AI can build a focused view per scope.

---

## Implementation notes

### Branch and PR shape

Single branch `dashboard-full-rework` off `main`. One commit per WS (numbered). Final commit is the housekeeping pass.

### Order inside the PR

Strict order — each WS assumes the previous is in place:

1. WS1 — filter wiring. Single commit, three lines. Everything downstream assumes filters actually work.
2. WS2 — tab structure. Foundation; everything else slots into the right tab.
3. WS3 — tab-adaptive TopBar + section cleanup. Once tabs exist, the TopBar and the section moves can land.
4. WS4 — NetworkBreakdown scorecard. Independent of tabs; can ship before or after WS3, place after for natural ordering.
5. WS5 — visual polish. Sub-letters A through E. Touches the same components as WS3 so this comes last.
6. WS6 — housekeeping pass at the very end.

### Out of scope (explicitly)

- Anything in `src/lib/globalcomix-queries.ts` or `globalcomix-subs-queries.ts`. Data layer is frozen.
- Anything in `src/app/api/bq/*`. Routes are frozen (they already accept the filter params from the previous PR).
- Anything in `src/lib/agents/` or `src/lib/smart-reports/`. Agent + Smart Reports work is separate.
- The Hermes UI surfaces. Their own polish pass.
- The Campaigns / Ask / Reports / Feed / Knowledge pages. Just the dashboard.
- Adding new analytical sections (Geographic UI, Creative UI, Attribution Validation UI). Those are placeholder slots in the tab layout; the implementations come when WS5 of the prior PR's data-layer work gets a UI.
- Mobile-specific responsive work beyond what's already in the new components.

### Test budget

- WS1: +5 unit tests
- WS2: +6 unit tests, +1 E2E
- WS3: +12 unit tests, +1 E2E
- WS4: +4 unit tests
- WS5: +30-50 unit tests, +2 E2E

Target: +60-90 unit, +4 E2E. Existing 1,001+ tests must continue to pass.

### Open questions (not blocking)

1. Should `CadenceTable`'s delta column compute against the prior period within the active window, or against the equivalent prior period extending before the window? Default: within the window for now (no extra fetch).
2. Should the "Lifecycle is all OS" note become an `InfoCallout` instead of inline text? Default: keep inline; flag if users miss it.
3. Should `AIModeView` get its own per-tab rebuild, or one shared AI mode that adapts based on which tab is active? Default: per-tab, since each tab has its own scope and AI Mode should respect that. Each tab keeps an independent AI-mode flag in URL state (e.g. `?tab=performance&mode=ai`).

### Reference

- Audit diagrams: chat conversation 2026-05-18 ("Dashboard filter audit", "Proposed three-tab IA")
- Brand skill: `.claude/skills/yellowhead-brand/SKILL.md`
- Superseded prompts (do NOT implement): `2026-05-18-dashboard-design-parity-pass.md`, `2026-05-18-dashboard-filter-wiring-bugfix.md`, `2026-05-18-dashboard-tabs-and-polish.md`
- Gold-standard components: `KpiCard.tsx`, `NetworkBreakdown.tsx`, `ChannelMix.tsx`, `ClientSelector.tsx`, `DateRangePicker.tsx`
- UI primitives: `GlassCard`, `CountUpNumber`, `Skeleton`, `EmptyState`, `SectionError`, `InfoCallout`
- Existing helpers: `delta-signal.ts`, `cell-tone.ts`, `aggregate-trend.ts`

### Files most likely to be touched

```
src/lib/dashboard/use-dashboard-data.ts                   (WS1)
src/lib/filters/use-global-filters.ts                     (WS2, WS3)
src/lib/filters/types.ts                                  (WS2)
src/components/dashboard/DashboardView.tsx                (WS1, WS2)
src/components/dashboard/DashboardTabs.tsx                (WS2 new)
src/components/dashboard/tabs/PerformanceTab.tsx          (WS2 new)
src/components/dashboard/tabs/LifecycleTab.tsx            (WS2 new)
src/components/dashboard/tabs/AttributionTab.tsx          (WS2 new)
src/components/dashboard/CadenceTable.tsx                 (WS3, WS5)
src/components/dashboard/WeekendsVsWeekdays.tsx           (WS5)
src/components/dashboard/SubscriberLifecycle.tsx          (WS3, WS5)
src/components/dashboard/PaidVsOrganic.tsx                (WS3, WS5)
src/components/dashboard/NetworkBreakdown.tsx             (WS4)
src/components/dashboard/TrendChart.tsx                   (WS3 cadence)
src/components/shell/TopBar.tsx                           (WS3)
src/components/shell/OsFilter.tsx                         (WS5.E)
src/components/shell/PlatformFilter.tsx                   (WS5.E)
src/components/shell/DateRangePicker.tsx                  (WS3 subtitle)
src/components/ui/Skeleton.tsx                            (WS5.B)
src/components/ui/EmptyState.tsx                          (WS5.D — possibly extend)
src/types/dashboard.ts                                    (WS4 — possibly extend NetworkRow)
src/lib/globalcomix-queries.ts                            (WS4 — only if trailing baselines for non-CPA metrics need adding)
Lumen Vault/Status.md                                     (WS6)
Lumen Vault/Decisions.md                                  (WS6)
CLAUDE.md                                                 (WS6)
```
