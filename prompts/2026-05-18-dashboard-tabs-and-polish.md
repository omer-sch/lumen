# [SUPERSEDED 2026-05-18] Dashboard three-tab IA reorganization + design polish (2026-05-18)

> **Do not implement this prompt.** Folded into `2026-05-18-dashboard-full-rework.md` as WS2-WS6. Kept on disk for traceability.

---

Owner: Omer. Single PR on a new branch off `main` named `dashboard-tabs-and-polish`. Ships AFTER `2026-05-18-dashboard-filter-wiring-bugfix.md` is merged (the filter wiring bug fix is a prerequisite — these workstreams assume filters actually flow through the existing dashboard hook).

This prompt supersedes `2026-05-18-dashboard-design-parity-pass.md` — the design polish work was rolled in here because both PRs touch the same files. Don't implement the design parity prompt; use this one.

## Why this is happening

The current `/dashboard` page mashes three different analytical scopes onto one long scroll: acquisition (which channels are performing), lifecycle (subscriber state), attribution (data-source trust). They have legitimately different filter semantics — the OS filter doesn't apply to subscriber lifecycle, the date range means different things per scope, and the visual layout has grown to the point where the user has to scroll five times to see all of it.

Concrete diagnoses surfaced by the 2026-05-18 audit (chat conversation, "filter-respect matrix"):

1. **Scope mash-up.** Eleven sections, three different scopes. Filter chips don't apply to all of them. Date range means different things across them. No visual indication of which is which.
2. **Hardcoded windows fighting the global filter.** `NetSubBars` inside `SubscriberLifecycle` hardcodes "last 30 days" regardless of the active date range.
3. **Cadence state stuck inside `CadenceTable`.** The Daily / Weekly / Monthly toggle lives in component-local state, so it doesn't drive the `TrendChart` above it. They show the same time series at different granularities; the user expects them to agree.
4. **WS7.C scorecard styling deferred from the prior PR.** `NetworkBreakdown` was supposed to get color-coded cells driven by `src/lib/dashboard/cell-tone.ts` but the helper landed without being wired in.
5. **Visual polish gap.** The new sections (CadenceTable, WeekendsVsWeekdays, SubscriberLifecycle, PaidVsOrganic) and the new TopBar chips (OsFilter, PlatformFilter) sit at a lower polish level than the existing dashboard surfaces — no loading skeletons (layout jumps on cold cache), no stagger entry, KPI-shaped tiles re-rolled instead of reusing `KpiCard`, plain tables without row hover or cell tinting, no empty-state cards.

The fix: organize the dashboard into three tabs, each with a coherent scope. Within each tab, bring the polish to parity with the existing dashboard surfaces.

## Spec sources

- **Audit + IA proposal** — chat conversation 2026-05-18 ("dashboard filter audit", "proposed three-tab dashboard IA"). The two diagrams there describe the target state precisely.
- **yellowhead-brand skill** at `.claude/skills/yellowhead-brand/SKILL.md` — re-read at the start.
- **Gold-standard model components** — `KpiCard`, `TrendChart`, `NetworkBreakdown`, `ChannelMix`, `ClientSelector`, `DateRangePicker`. These are the visual bar.
- **UI primitives to reuse** — `GlassCard`, `CountUpNumber`, `Skeleton` (with the existing `KpiCardSkeleton` as template), `EmptyState`, `SectionError`, `InfoCallout`, `LivePulse`, `SectionBreak`.
- **Existing helpers** — `src/lib/dashboard/delta-signal.ts`, `cell-tone.ts`.

## Tab structure (the target)

Three tabs below the TopBar, single `/dashboard` route, URL state `?tab=performance` (default omitted from URL):

### Tab 1 — Performance (default)

The acquisition story. What's running, what it costs, what it's converting at.

**Sections, in order:**
1. KPI strip (Spend / Installs / CPA D7 / Sub D7) — existing `KpiCard` row, untouched
2. Shared **Cadence toggle** (Daily / Weekly / Monthly) — drives both #3 and #4 below
3. TrendChart — respects cadence
4. CadenceTable — respects same cadence
5. NetworkBreakdown — with color-coded scorecard styling (WS7.C from previous PR, now wired)
6. ChannelMix donut
7. WeekendsVsWeekdays
8. PaybackCurve
9. Placeholder slot for Geographic + Creative (when their UI ships)

**Filters active:** Date, OS, Platform, Client. All chips visible on TopBar.

**Date semantic:** "Install cohorts opening in this window." A 7-day window will show `—` for Sub D7 on the last 6 days because cohorts haven't matured. The existing maturity gate handles this; the date range picker subtitle should explain it.

### Tab 2 — Lifecycle

The subscriber state. Who's subscribing, who's churning, what's the net.

**Sections, in order:**
1. SubscriberLifecycle KPI strip (Subs / Churn / Net Sub) — using real `KpiCard` instances
2. OS donut (iOS / Android / Web) — OS as a chart dimension, NOT a filter
3. Net Sub Over Time — respecting active date range, NOT hardcoded
4. Daily Sub / Churn / Net Sub table

**Filters active:** Date, Client. OS and Platform chips hidden on this tab (they don't apply to subscriber events).

**Date semantic:** "Subscription events in this window" (`event_date BETWEEN from AND to`). Different anchor than acquisition.

### Tab 3 — Attribution

The trust story. Is the data we're seeing real? What's the blended cost?

**Sections, in order:**
1. BCAC headline tile (was inside PaidVsOrganic; promoted to the page's hero)
2. PaidVsOrganic donut + share bar (BCAC tile removed from inside it)
3. Attribution Validation table — when WS5 UI ships, lands here
4. Per-network drift over time — when WS5 UI ships
5. Coverage warnings panel — AppLovin pre-coverage dates, SKAdNetwork stale since 2025-08-04, Pubmint cohort without spend
6. Data freshness debug — `DataFreshnessBar` lives here

**Filters active:** Date, OS, Platform, Client. All chips visible.

**Date semantic:** Same as Performance — "what attribution data was reported in this window".

## TL;DR

Five workstreams, single PR. Ship in numbered order.

1. **WS1 — Tab structure.** Add the tab strip below the TopBar. URL state `?tab=`. Three new tab-component containers (`PerformanceTab`, `LifecycleTab`, `AttributionTab`). `DashboardView` becomes the orchestrator.
2. **WS2 — Tab-adaptive TopBar.** OS + Platform chips hide on the Lifecycle tab. Date range subtitle adapts per tab.
3. **WS3 — Cadence state promotion + section cleanup.** Cadence toggle moves from inside `CadenceTable` up to dashboard-level shared state. `NetSubBars` honors the active date range. BCAC moves out of `PaidVsOrganic` to its own Attribution tab headline tile.
4. **WS4 — NetworkBreakdown WS7.C scorecard.** Wire `cell-tone.ts` into `NetworkBreakdown`. Deferred from the prior PR.
5. **WS5 — Visual polish across the new surfaces.** Tile parity (KpiTile / BcacTile / Tile become real `KpiCard` instances), section-shaped skeletons (no layout jump on cold load), table row treatment on CadenceTable + WeekendsVsWeekdays, empty-state cards (no more `return null`), TopBar chip parity (OsFilter + PlatformFilter match ClientSelector exactly).

Estimated PR size: 20-30 files touched. ~800-1,200 lines added, ~200-300 lines removed (re-rolled tiles, hardcoded windows). Test budget: +50-70 unit tests, +3 E2E specs.

---

## WS1 — Tab structure

### Today

`DashboardView` (`src/components/dashboard/DashboardView.tsx`) renders a single long scroll: AIModeView toggle + DashboardHeader + the KPI strip + the new sections + PinnedSection. ~600 lines, hard to follow.

### Change

**URL state in `useGlobalFilters`.** Add a `tab` field to the global filter state:

```ts
// src/lib/filters/types.ts (or use-global-filters.ts — wherever the GlobalFilters type lives)
export type DashboardTab = "performance" | "lifecycle" | "attribution";

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  value === "performance" || value === "lifecycle" || value === "attribution";
```

In `useGlobalFilters`:
- Add `tab: DashboardTab` to `GlobalFilters`. Default: `"performance"`. Omitted from URL when default.
- Add `setTab(tab: DashboardTab)` callback that writes `?tab=` to the URL.

**Three tab components.** Create:

```
src/components/dashboard/tabs/PerformanceTab.tsx
src/components/dashboard/tabs/LifecycleTab.tsx
src/components/dashboard/tabs/AttributionTab.tsx
```

Each renders the section list for its tab as described in the "Tab structure" section above. Each consumes `useGlobalFilters` and `useDashboardData` as needed. The existing section components (KpiCard, TrendChart, CadenceTable, etc.) are reused — these wrapper tabs just compose them.

**Tab strip component.** Create:

```
src/components/dashboard/DashboardTabs.tsx
```

A horizontal segmented control matching the existing `ModeToggle` shape in `DashboardView.tsx` (the My / Lumen toggle at lines 246-315 is the model — same visual language). Three tabs, mint accent on active, focus ring, keyboard arrow-key navigation between tabs.

**`DashboardView` becomes a router.** Slim it down to: TopBar + DashboardHeader + DashboardTabs + the active tab's component + PinnedSection. The 500+ lines of section rendering moves into the three tab components.

`AIModeView` stays as a per-tab mode toggle (each tab can independently flip to AI Mode). Default to non-AI on all tabs.

**Pinned tiles section** stays at the page level, below the tabs. Pinned charts can come from any tab; the user is curating their own view.

### Acceptance

- `/dashboard` renders Performance tab by default.
- `/dashboard?tab=lifecycle` renders the Lifecycle tab directly.
- Clicking a tab updates the URL and re-renders without a full page nav.
- Tab keyboard navigation: Left / Right arrows cycle through tabs when one is focused.
- `DashboardView` is under 200 lines (the section orchestration moved out).
- Unit test asserts URL → tab parsing and tab → URL writing both directions.
- E2E: open `/dashboard`, click Lifecycle tab, see URL change to `?tab=lifecycle` and the Lifecycle sections render.

---

## WS2 — Tab-adaptive TopBar

### Today

`TopBar.tsx` always renders `DateRangePicker / OsFilter / PlatformFilter / ClientSelector`. No tab awareness.

### Change

In `TopBar.tsx`, read the active tab from `useGlobalFilters().tab`. Conditionally render:

- **Performance tab:** Date + OS + Platform + Client (all four).
- **Lifecycle tab:** Date + Client only. OS + Platform chips hidden.
- **Attribution tab:** Date + OS + Platform + Client (all four).

When OS / Platform chips disappear on the Lifecycle tab, do NOT clear the user's stored filter state — they stay in the URL. When the user navigates back to Performance, their previous filter selection is still active.

**Date range subtitle.** The DateRangePicker (`src/components/shell/DateRangePicker.tsx`) currently shows the active window. Below or next to it, add a small per-tab subtitle:

- Performance: `"Install cohorts opening in this window"`
- Lifecycle: `"Subscription events in this window"`
- Attribution: `"Attribution data reported in this window"`

This is a one-line label that helps the user understand WHY the same date range can show different shapes of data across tabs. Use the `InfoCallout` primitive or just a `text-xs text-muted` line below the picker — pick whatever's least visually noisy.

### Acceptance

- On Lifecycle tab, OS + Platform chips are not in the DOM (NOT just hidden via CSS — actually unmount so they can't be tabbed-to).
- Switching tabs preserves URL state for filters even when the chips are hidden.
- Date range subtitle changes per tab and matches the strings above.
- Unit test asserts conditional rendering.
- E2E: select `?os=ios&platforms=meta`, navigate to Lifecycle, verify chips are gone; navigate back to Performance, verify chips reappear with `iOS` and `Meta` still selected.

---

## WS3 — Cadence state promotion + section cleanup

### Today

`CadenceTable` (`src/components/dashboard/CadenceTable.tsx`) holds the Daily / Weekly / Monthly toggle as `useState<Cadence>("weekly")` (~line 43). `TrendChart` has its own internal metric switcher but no cadence. The two sections show the same data at different granularities and don't agree.

`NetSubBars` inside `SubscriberLifecycle` hardcodes `rows.slice(-30)` for "last 30 days" regardless of the active date range.

`PaidVsOrganic` puts BCAC inside its own tile grid (line ~115). With the IA reorg, BCAC becomes the Attribution tab's hero.

### Change

**Cadence state lift.** Add `cadence: Cadence` to `useGlobalFilters` (or to a tab-scoped hook if cleaner — design choice). Default `"weekly"`. Persist in URL as `?cadence=`. Only relevant on the Performance tab.

In `PerformanceTab.tsx`, render a single shared cadence toggle (the same segmented control currently inside `CadenceTable`) at the dashboard level, above both the `TrendChart` and the `CadenceTable`. Both consume the shared `cadence` value and re-render in agreement.

`CadenceTable.tsx` loses its internal `useState` for cadence. It becomes a pure presentational component that takes `cadence` as a prop. `TrendChart` consumes cadence from `useGlobalFilters` (or via prop) and aggregates its trend data to the matching granularity. `aggregate-trend.ts` is the shared helper.

**`NetSubBars` window fix.** Remove the `rows.slice(-30)` hardcode. The component receives the full set of `NetSubPoint` rows from the API for the active date range. If the user picks a 90-day window, all 90 days render. The chart's x-axis adapts.

**BCAC promotion.** In `PaidVsOrganic.tsx`, remove the BCAC tile (lines ~105-145, the `BcacTile` component and its render). The PaidVsOrganic component now shows: KPI strip (Sub Total / Sub Paid / Sub Organic) + the share bar. No BCAC inside.

In `AttributionTab.tsx`, render a new top-level component `BcacHeadline` (or `BcacKpiCard`) that:
- Reads from the same `/api/bq/total-subs` and spend endpoints PaidVsOrganic currently uses
- Renders as a single hero-sized `KpiCard` with BCAC as the value, "Blended Customer Acquisition Cost" as the hint
- Sits above PaidVsOrganic on the Attribution tab

Compute BCAC the same way it was computed in PaidVsOrganic — total paid spend ÷ total subs (paid + organic) in the active window.

### Acceptance

- Cadence toggle on the Performance tab is a single control that drives BOTH TrendChart and CadenceTable.
- Switching cadence from Weekly to Monthly re-renders both components in agreement.
- `?cadence=monthly` in URL persists across refresh.
- `NetSubBars` no longer hardcodes 30 days; the x-axis matches the active date range.
- `PaidVsOrganic` no longer renders a BCAC tile.
- `BcacHeadline` renders as a hero `KpiCard` on the Attribution tab.
- Unit tests assert cadence prop threading and the BCAC value formula.
- E2E: change date range to 90 days, verify NetSubBars shows 90 bars.

---

## WS4 — NetworkBreakdown WS7.C scorecard

Deferred from `globalcomix-full-implementation`. The cell-tone helper landed; the visual integration didn't.

### Today

`src/components/dashboard/NetworkBreakdown.tsx` renders rate metric cells (CPI, CPA D7, ROI D7) with plain styling. The previous-period baseline (`trailingCpaD7Avg` on each row) is used for a single status pill but not per-cell.

### Change

Import `cellTone` from `src/lib/dashboard/cell-tone.ts`. Apply to each rate-metric cell. Baseline is **previous-period same-network** (read from `trailingCpaD7Avg` and any analogous trailing fields on `NetworkRow`).

Tone rules (already encoded in `cell-tone.ts`):
- Lower-is-better (CPI, CPA D7): `good` ≤ baseline × 0.9, `bad` ≥ baseline × 1.2, `warn` ≥ baseline × 1.05.
- Higher-is-better (ROI D7): inverted.

Render the cell tone via background tint:

```tsx
const tone = cellTone(value, baseline, direction);
const bg = tone === "good" ? "color-mix(in oklab, var(--color-ua) 10%, transparent)" :
           tone === "bad"  ? "color-mix(in oklab, var(--color-creative) 10%, transparent)" :
           tone === "warn" ? "color-mix(in oklab, var(--color-yellow) 8%, transparent)" :
                             "transparent";
```

Hover tooltip on tinted cells: `"CPA D7 is 18% above this network's previous-period average."`

Keep the existing row-level `statusFromCpaD7` status pill — that's a different surface (per-network status vs per-metric tinting).

### Acceptance

- NetworkBreakdown rate cells show soft tinted backgrounds.
- Hover shows the explanatory tooltip with the percentage.
- Cell tint contrast meets 4.5:1 against `--text-primary`.
- Unit test using a fixture: `cellTone(46, 22, "lower-better") === "bad"`.

---

## WS5 — Visual polish across the new surfaces

This is the consolidated WS5 covering everything that was in the standalone `2026-05-18-dashboard-design-parity-pass.md` prompt. Five sub-workstreams.

### WS5.A — Tile parity

Sections `SubscriberLifecycle` and `PaidVsOrganic` define inline KPI-shaped tiles (`KpiTile`, `BcacTile`, `Tile`) that re-roll a worse version of `KpiCard`. Replace them with real `KpiCard` instances. `KpiCard` accepts `value: string` (pre-formatted), `delta: number | null`, `direction: "higher-better" | "lower-better"`, `size: "hero" | "compact"`, `enterIndex` for stagger, `highlight` for the section's lead metric.

Specific mappings:

- **`SubscriberLifecycle` row** (Lifecycle tab):
  - `New subscribers`: `delta=null`, `direction="higher-better"`, `size="compact"`, `enterIndex=1`
  - `Cancellations`: `delta=null`, `direction="lower-better"`, `size="compact"`, `enterIndex=2`
  - `Net Sub`: `delta=null`, `direction="higher-better"`, `size="compact"`, `enterIndex=3`, `highlight={true}`

- **`PaidVsOrganic` row** (Attribution tab, after BCAC moves out):
  - `Sub Total`: `delta=null`, `size="compact"`, `enterIndex=1`
  - `Sub Paid`: `delta=null`, `size="compact"`, `enterIndex=2`
  - `Sub Organic`: `delta=null`, `size="compact"`, `enterIndex=3`

- **`BcacHeadline`** (Attribution tab, new hero):
  - Single `KpiCard size="hero"`, `delta=null` for now (no period-over-period yet), `direction="lower-better"`, `highlight={true}`, `enterIndex=0`

`delta=null` is honest when there's no period-over-period baseline; `KpiCard` renders `—` with a tooltip. Don't fabricate.

### WS5.B — Section-shaped skeletons

Add four new skeleton exports to `src/components/ui/Skeleton.tsx`:

```ts
export function CadenceTableSkeleton()       // header + cadence toggle + 4 placeholder rows
export function WeekendsVsWeekdaysSkeleton() // header + 2-row table + bar placeholder
export function SubscriberLifecycleSkeleton()// header + 3 KpiCardSkeleton + 2 chart placeholders
export function PaidVsOrganicSkeleton()      // header + 3 KpiCardSkeleton + share-bar placeholder
export function BcacHeadlineSkeleton()       // hero KpiCardSkeleton
```

Replace every `if (loading) return null` in the new sections with the matching skeleton.

### WS5.C — Table row treatment on CadenceTable + WeekendsVsWeekdays

Both tables get:

1. **Row hover state.** Background `color-mix(in oklab, var(--color-ua) 6%, transparent)`. Pure CSS via `:hover`.
2. **Cell tinting via `cellTone`** on rate metrics (CadenceTable: cpaD7, roiD7, installCvr. WeekendsVsWeekdays: cpaD7, roiD7, installCvr, subCvr).
3. **Cadence delta column.** CadenceTable adds a `Δ vs prior period` column at the rightmost position. Computed client-side from the cadence-aggregated rows. Render as a delta chip matching `KpiCard`'s chip shape.

### WS5.D — Empty-state cards

Replace `if (!loading && empty) return null` paths with a sized empty-state card in each new section. Use the existing `EmptyState` primitive in `src/components/ui/EmptyState.tsx`. Per-section message + hint:

- CadenceTable: `"No data for this window."` / `"Try a wider date range."`
- WeekendsVsWeekdays: `"No data for this window."` / `"Try a wider range or remove the platform filter."`
- SubscriberLifecycle: `"No lifecycle data."` / `"Lifecycle data starts 2020-11-18."`
- PaidVsOrganic: `"No paid/organic split."` / `"Try widening the date range."`

The section header stays visible above the empty state so the user knows what they're looking at. Layout doesn't shift.

### WS5.E — TopBar chip parity

`OsFilter` and `PlatformFilter` triggers should be pixel-equivalent to `ClientSelector`:

- Icon `strokeWidth`: remove the `strokeWidth={2}` prop; use lucide default.
- Neutral state border: `var(--border-default)` (not `var(--border-subtle)`).
- Hover ring: match ClientSelector's `shadow-elevated` or equivalent ring treatment.
- Drop the `"OS · "` prefix in the OsFilter trigger label — icon + value is enough.

### Acceptance (WS5 as a whole)

- `SubscriberLifecycle` and `PaidVsOrganic` no longer define inline tile bodies.
- Cold-cache reload of `/dashboard` shows skeletons in every new section position. No layout shift when data arrives.
- CadenceTable and WeekendsVsWeekdays show row hover + cell tinting + (CadenceTable only) delta column.
- Empty windows show sized empty-state cards, not vanished sections.
- TopBar trio (OsFilter / PlatformFilter / ClientSelector) reads as visually equivalent.
- All new visual treatments respect `prefers-reduced-motion`.

---

## Implementation notes

### Branch and PR shape

Single branch `dashboard-tabs-and-polish` off `main`. **Branch from main AFTER the bug-fix PR is merged** so this PR doesn't double-up on the filter wiring change.

Commit per WS, numbered (WS1, WS2, WS3, WS4, WS5.A through WS5.E). Final commit is the housekeeping pass.

### Order inside the PR

Strict order:

1. WS1 — tab structure. Foundation; everything else slots into it.
2. WS3 — section cleanup. Hardcoded windows + BCAC move + cadence state lift. Independent of tabs once WS1 lands.
3. WS2 — tab-adaptive TopBar.
4. WS4 — NetworkBreakdown scorecard.
5. WS5 — visual polish across the new surfaces.

### Out of scope (explicitly)

- Anything in `src/lib/globalcomix-queries.ts` or `globalcomix-subs-queries.ts`. Data layer is frozen.
- Anything in `src/app/api/bq/*`. Routes are frozen.
- Anything in `src/lib/agents/` or `src/lib/smart-reports/`. The agent and Smart Reports work is separate.
- The Hermes UI surfaces. Their own polish pass.
- The Campaigns / Ask / Reports / Feed / Knowledge pages. Just the dashboard.
- Mobile-specific responsive work beyond what's already in the new components. Keep existing breakpoints.

### Housekeeping at PR close

1. `Lumen Vault/Status.md` — move the in-flight dashboard items to a "shipped" entry. Add a new in-flight entry for the Smart Reports prose-writer follow-up (which is the analyst-layer integration work that didn't ship in the previous PR).
2. `Lumen Vault/Decisions.md` — append a dated entry summarizing what shipped: the three-tab IA, the cadence state promotion, the filter wiring fix (cite the bugfix PR by hash if known), the WS7.C scorecard styling, and the visual polish pass.
3. CLAUDE.md update: the IA section names six pages but the dashboard is now tab-structured. Update the Dashboard section in the IA doc to describe the three tabs and their filter semantics.
4. PR description: name the two open questions from the earlier audit that remain (1: Should the Pinned Section live on a specific tab or stay page-level? — recommend page-level; 2: Should AI Mode be per-tab or per-page? — recommend per-tab so the AI can build a focused view per scope).

### Reference

- Two diagrams from the 2026-05-18 chat conversation: "Dashboard filter audit: what actually filters today" and "Proposed: three tabs under one /dashboard". The second is the target spec.
- Brand skill: `.claude/skills/yellowhead-brand/SKILL.md`
- Bug-fix prerequisite: `prompts/2026-05-18-dashboard-filter-wiring-bugfix.md`
- Superseded design polish prompt: `prompts/2026-05-18-dashboard-design-parity-pass.md` (kept on disk; do not implement)
- Gold-standard model components: `KpiCard.tsx`, `NetworkBreakdown.tsx`, `ChannelMix.tsx`, `ClientSelector.tsx`, `DateRangePicker.tsx`
- UI primitives: `GlassCard`, `CountUpNumber`, `Skeleton`, `EmptyState`, `SectionError`, `InfoCallout`
- Existing helpers: `delta-signal.ts`, `cell-tone.ts`, `aggregate-trend.ts`
