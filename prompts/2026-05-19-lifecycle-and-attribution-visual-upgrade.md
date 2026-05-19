# Lifecycle + Attribution visual upgrade (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `lifecycle-attribution-visual-upgrade`. Two workstreams. Visual upgrade only, no new data dependencies, no new analytical sections.

## Ordering

This prompt assumes `prompts/2026-05-18-dashboard-full-rework.md` has already shipped — specifically the 3-tab IA (`PerformanceTab` / `LifecycleTab` / `AttributionTab`) with URL-driven `?tab=` state, the TopBar tab-adaptive chip behavior (OS + Platform unmount on Lifecycle), and the `BCAC` / `PaidVsOrganic` / `DataFreshnessBar` scaffolds. If the queued rework is not yet on `main`, ship that first. This prompt fails to land cleanly otherwise.

## User and intent

Single user: the UA analyst. Two questions, one per tab:

- **Lifecycle:** "Is what I acquired actually retaining?" The tab walks them through a top-to-bottom retention narrative: current period totals, the trend, the OS split, then the daily detail.
- **Attribution:** "Can I trust the cohort numbers I'm reporting on?" The tab leads with the trust headline (BCAC), shows the paid-vs-organic mix that BCAC depends on, then surfaces every reason the numbers might be wrong.

Both tabs serve the same person on the same workflow. They should feel visually consistent with Performance (KpiCard parity, GlassCard rhythm, breathing room between sections) so switching tabs feels like changing lens, not changing app.

## Why this PR exists

**Lifecycle today is one stuffed `GlassCard`.** `SubscriberLifecycle.tsx` holds the KPI strip, the OS donut, the Net Sub bars, and the daily sub / churn table all in a single component. There is no section rhythm, the chart is rendered as a bar list rather than a real chart, and the daily table sits beneath everything without any treatment. The result reads as a card someone forgot to finish, not a primary surface. Performance gets clean sectioning via `KpiCard`s, `TrendChart`, `NetworkBreakdown`, `ChannelMix`, `PaybackCurve`; Lifecycle should match that rhythm.

**Attribution has no visual design yet.** The queued rework lands the data scaffolds but does not design the layout. The risk is shipping a tab that technically renders BCAC + PaidVsOrganic + Coverage Warnings + DataFreshness but feels like four loose widgets stacked vertically. This PR locks in the layout grammar before the tab gets used.

## Spec sources

- yellowhead-brand skill at `.claude/skills/yellowhead-brand/SKILL.md`. **Read this first.** All colors, typography, GlassCard treatment, KpiCard sizing, accent rules come from here. Do not invent new tokens or raw hex values.
- Gold-standard components for reference: `src/components/dashboard/KpiCard.tsx`, `src/components/dashboard/TrendChart.tsx`, `src/components/dashboard/NetworkBreakdown.tsx`, `src/components/dashboard/ChannelMix.tsx`. These are the visual benchmarks Lifecycle and Attribution need to match.
- Existing Lifecycle component: `src/components/dashboard/SubscriberLifecycle.tsx`. This is the file being decomposed in WS1.
- Existing Attribution scaffolds (assumed shipped via queued rework): `src/components/dashboard/AttributionTab.tsx`, plus whatever `BCAC` / `PaidVsOrganic` / `DataFreshnessBar` placeholders the queued rework lands. This PR fills them with their final visual treatment.

## Out of scope

- No new analytical sections. If a chart or KPI is not already in `SubscriberLifecycle.tsx` or the queued Attribution scaffold, it does not appear here.
- No new BQ queries, no new API routes, no new data fetching logic.
- No new TopBar / filter behavior. The queued rework already handles tab-adaptive chips.
- No changes to Performance tab. This PR only touches Lifecycle and Attribution surfaces.
- No mobile-specific layout. Desktop responsive widths only; the existing `md:` / `lg:` patterns suffice.

## TL;DR

Two workstreams, single PR.

1. **WS1 — Lifecycle visual decomposition.** Split `SubscriberLifecycle.tsx` into four properly sized sections inside `LifecycleTab.tsx`. Same data, same query calls, decomposed presentation.
2. **WS2 — Attribution visual design.** Lay out the four Attribution sections (BCAC hero, PaidVsOrganic + DataFreshnessBar row, Coverage Warnings card row) with KpiCard parity and proper visual hierarchy.

Estimated PR size: 6 to 10 files touched. ~400 to 600 lines added, ~200 lines removed. Test budget: +20 to +30 unit tests, +1 E2E.

---

## WS1 — Lifecycle visual decomposition

### Target layout

```
LifecycleTab
├── Row 1 (full width, 3-column grid on md+)
│   [ New Subs KpiCard ] [ Churn KpiCard ] [ Net Sub KpiCard ]
│
├── Row 2 (full width, single GlassCard)
│   [ Net Sub Over Time chart                                ]
│
└── Row 3 (full width, 2-column grid on lg+, stacked on md)
    [ OS Mix GlassCard       ] [ Daily Detail GlassCard      ]
       width: 1/3 on lg              width: 2/3 on lg
```

### File touchpoints

```
src/components/dashboard/tabs/LifecycleTab.tsx           // orchestrator
src/components/dashboard/lifecycle/LifecycleKpiStrip.tsx // new
src/components/dashboard/lifecycle/NetSubTrend.tsx       // new (replaces NetSubBars)
src/components/dashboard/lifecycle/OsMixCard.tsx         // new
src/components/dashboard/lifecycle/DailySubsTable.tsx    // new
src/components/dashboard/SubscriberLifecycle.tsx         // deleted at end of WS1
```

The new components live under `src/components/dashboard/lifecycle/`. Mirrors how `campaigns/profile/` is organized — keeps the file tree readable.

### Section specs

**LifecycleKpiStrip** — 3-column grid of `KpiCard` instances. Same `KpiCard` component the Performance tab uses (`src/components/dashboard/KpiCard.tsx`). Do NOT build a new KpiCard variant. Tiles in order:

1. **New Subs** — count of subscription starts in the active window. Delta vs prior equal-length window. Format: integer with thousands separator.
2. **Churn** — count of cancellations in the active window. Delta vs prior window. Lower-is-better, so delta tone inverts (red when delta positive). Use whatever `tone` / `direction` prop the KpiCard already exposes.
3. **Net Sub** — `subs - churn` for the window. Delta vs prior window. Same direction as New Subs.

Each tile gets a small sparkline at the bottom drawn from the `daily` array currently fetched by `SubscriberLifecycle`. The sparkline is the same `RowSparkline` pattern used by the Campaigns table; do not invent new sparkline machinery.

Loading state: existing `SubscriberLifecycleSkeleton` is fine to reuse, or split it into a smaller `LifecycleKpiSkeleton` that mirrors the 3-tile shape.

**NetSubTrend** — a real chart, not the current "bar list". Reuse `TrendChart`'s rendering primitives where possible (axis, gridlines, hover tooltip, end-of-line labeling). If `TrendChart` can be parameterized to accept a single series with the existing API, do that. Otherwise extract its shared chart-frame primitives into `src/components/dashboard/charts/ChartFrame.tsx` and use them here.

X-axis: dates in the active window. Y-axis: net sub value per day. One line (or bar) series. Mint accent (`var(--color-ua)`) for the line, with a subtle area fill underneath at 12% opacity. End-of-line label showing the latest value.

Hover tooltip surfaces: date, subs, churn, net sub. Same tooltip pattern Performance's TrendChart uses.

If the active window is shorter than 14 days, render bars instead of a line (bars read more honest at low density). Threshold lives as a constant `LINE_VS_BAR_THRESHOLD = 14` at the top of the file.

**OsMixCard** — donut or stacked bar of iOS / Android / Web share of new subs in the window. Use `ChannelMix.tsx` as the visual reference; if its donut can be parameterized for a different categorical axis, reuse it. Otherwise build a thin OS-specific donut following the same visual treatment (legend below, percentage labels on hover, accent colors from `OS_TINT` map already defined in current `SubscriberLifecycle.tsx`).

Headline label inside the donut center: "Subs" with the total count beneath. Same pattern ChannelMix uses for spend.

**DailySubsTable** — sortable table, 4 columns: Date | New Subs | Churn | Net Sub. Use `NetworkBreakdown.tsx`'s table treatment as the reference (row striping, sortable column headers with arrow indicators, hover row highlight, sticky header on scroll if the table is taller than the viewport).

Sort default: Date descending (newest first). Click column headers to toggle sort. Use the same chevron + active-color pattern as Campaigns table sort.

If the active window is longer than 31 days, virtualize the rows or fall back to "showing the last 31 days; expand the date range to see more" pattern. The current implementation has no virtualization; do not introduce it unless the row count actually crosses the threshold today.

### LifecycleTab orchestrator

`LifecycleTab.tsx` becomes the section composer. Fetches happen at the tab level (move the existing `useEffect` data-fetch logic out of `SubscriberLifecycle.tsx` and into `LifecycleTab.tsx` or into a `useLifecycleData` hook under `src/lib/lifecycle/use-lifecycle-data.ts`). Pass typed data props down to each section component.

```tsx
export function LifecycleTab() {
  const { daily, osMix, trend, loading, error } = useLifecycleData();
  if (loading) return <LifecycleSkeleton />;
  if (error) return <SectionError section="lifecycle" ... />;
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <LifecycleKpiStrip daily={daily} />
      <NetSubTrend trend={trend} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <OsMixCard osMix={osMix} className="lg:col-span-1" />
        <DailySubsTable daily={daily} className="lg:col-span-2" />
      </div>
    </div>
  );
}
```

(This is illustrative, not literal — match the project's exact conventions on className composition with `cn()`, GlassCard wrapping, and TypeScript prop typing.)

### Cleanup at end of WS1

Once all four section components render correctly and `LifecycleTab` orchestrates them, delete `SubscriberLifecycle.tsx`. Update any imports (there should be exactly one, in `LifecycleTab.tsx`). Update `src/components/ui/Skeleton.tsx` if the `SubscriberLifecycleSkeleton` export is no longer used; rename to `LifecycleSkeleton` if it is reused, or delete if it is not.

### Tests for WS1

- Unit test per section component asserting the props-to-DOM mapping (KpiCard receives correct values, donut receives correct mix, table renders the right number of rows).
- Unit test for sort behavior on `DailySubsTable` (click column header, rows reorder).
- Unit test for the line-vs-bar threshold in `NetSubTrend` (10-day window renders bars, 30-day window renders line).
- E2E in `tests/e2e/dashboard.spec.ts`: navigate to `/dashboard?tab=lifecycle`, assert all four sections render with their data-testids (`lifecycle-kpi-strip`, `lifecycle-net-sub-trend`, `lifecycle-os-mix`, `lifecycle-daily-table`).

---

## WS2 — Attribution visual design

### Target layout

```
AttributionTab
├── Row 1 (full width, hero)
│   [        BCAC headline KpiCard, large variant, mint glow         ]
│
├── Row 2 (full width, 2-column grid on lg+)
│   [ Paid vs Organic split card                ] [ DataFreshnessBar ]
│      width: 2/3 on lg                              width: 1/3 on lg
│
└── Row 3 (full width, 3-column grid on md+)
    [ SKAd Warning ] [ Pubmint Warning ] [ event_date Warning ]
       Coverage warnings — one card per open BQ question
```

### File touchpoints

```
src/components/dashboard/tabs/AttributionTab.tsx              // orchestrator (already exists per queued rework)
src/components/dashboard/attribution/BcacHero.tsx             // new (or upgrade existing BCAC component)
src/components/dashboard/attribution/PaidVsOrganicCard.tsx    // new (or upgrade existing)
src/components/dashboard/attribution/CoverageWarningsRow.tsx  // new
src/components/dashboard/attribution/CoverageWarningCard.tsx  // new — single-warning card primitive
src/components/dashboard/DataFreshnessBar.tsx                 // exists per queued rework; adjust sizing only
```

### Section specs

**BcacHero** — the headline. Wraps `KpiCard` in its largest size variant (if the component supports it; otherwise use the existing size and pad the GlassCard externally to make the tile read as hero). Single big number, the BCAC value formatted as currency. Subtitle: "Blended Customer Acquisition Cost", a one-line definition. Delta vs prior equal-length window. Mint accent border / glow per yellowhead-brand UA accent.

Hover tooltip on a `?` icon next to the subtitle explaining how BCAC is computed: "Total spend in the window divided by total subscribers, including organic. Lower is better. Compares against the same-length prior window."

Visual weight: this is the tab's "at what cost" headline. It should read as a hero, not as one of three peers.

**PaidVsOrganicCard** — a GlassCard with three sub-tiles in a row inside it, plus a horizontal share bar across the bottom.

Sub-tiles:
1. **Sub Total** — total subs in the window. Count.
2. **Sub Paid** — subs attributed to paid acquisition. Count + percentage of total.
3. **Sub Organic** — subs not attributed to paid. Count + percentage of total.

Share bar: horizontal stacked bar, mint segment for Paid, neutral gray segment for Organic. Percentages labeled inside the segments. Same visual treatment ChannelMix uses for its breakdown bar (if there is one) or NetworkBreakdown uses for its proportion column.

Caption below the share bar: "Organic halo lifts paid efficiency. Higher organic share = lower BCAC."

**CoverageWarningsRow** — a flex row (or 3-column grid on md+) of `CoverageWarningCard` instances. One card per open BQ question:

1. **SKAdNetwork ingestion** — title, status (Stale since 2025-08-04), one-line impact ("iOS attribution validation is incomplete"), small "Open question for BI" badge in the corner.
2. **Pubmint spend** — title, status (Missing), one-line impact ("Pubmint cohort attribution exists but spend doesn't"), same badge.
3. **`event_date` semantics** — title, status (Unverified), one-line impact ("Sub event dates filtered to <= today for safety"), same badge.

Each card is a GlassCard with an amber accent border (use `var(--color-warning)` from yellowhead-brand if defined; otherwise the closest existing token). NOT mint, NOT coral — amber reads as "needs attention, not yet broken" which is the right semantic.

Card width: equal thirds on md+, stacks vertically on sm. No interaction (clicking the card does nothing yet; the badge is signage, not a CTA).

**CoverageWarningCard** primitive — props: `title`, `status` (Stale / Missing / Unverified), `impact`, optional `lastUpdated` (for Stale variant). Renders the same shape regardless of status; only the status pill color and label change.

### DataFreshnessBar adjustment

The component exists per the queued rework. This PR only adjusts its sizing so it fits as the right-hand third of Row 2 next to PaidVsOrganicCard. If the component is currently full-width-only, add a `compact` prop that renders it in a narrower form factor with the same content. Do not change what data it shows.

### AttributionTab orchestrator

```tsx
export function AttributionTab() {
  const { bcac, paidOrganic, freshness, warnings } = useAttributionData();
  if (loading) return <AttributionSkeleton />;
  if (error) return <SectionError section="attribution" ... />;
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <BcacHero bcac={bcac} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PaidVsOrganicCard data={paidOrganic} className="lg:col-span-2" />
        <DataFreshnessBar freshness={freshness} compact />
      </div>
      <CoverageWarningsRow warnings={warnings} />
    </div>
  );
}
```

(Same illustrative-not-literal disclaimer.)

If `useAttributionData` does not exist yet from the queued rework, build it as part of this PR following the `useLifecycleData` pattern from WS1.

### Tests for WS2

- Unit test for `BcacHero` confirming the KpiCard renders with the right size variant, value, delta, and tooltip content.
- Unit test for `PaidVsOrganicCard` asserting the three sub-tiles render and the share bar reflects the paid / organic split correctly.
- Unit test for `CoverageWarningCard` asserting each status variant renders the right pill color and label.
- Unit test for `CoverageWarningsRow` asserting all three default warnings render.
- E2E in `tests/e2e/dashboard.spec.ts`: navigate to `/dashboard?tab=attribution`, assert all four sections render with their data-testids (`attribution-bcac-hero`, `attribution-paid-vs-organic`, `attribution-data-freshness`, `attribution-coverage-warnings`).

---

## Cross-cutting visual rules

These apply to both workstreams. Follow them anywhere ambiguity comes up.

1. **Section spacing.** `gap-6` on md, `gap-8` on lg between rows. Inside a GlassCard, `p-5` to `p-6`. Match the Performance tab's existing rhythm exactly — do NOT pick tighter or looser spacing.
2. **Section headers.** Each section gets a small header above it: title (font-display, text-sm to text-base, semibold) + optional one-line subtitle (font-body, text-xs, muted). Performance's section headers are the reference.
3. **Loading states.** Each section gets its own skeleton mirroring the section shape. Reuse `Skeleton.tsx` primitives. Loading should NOT render a full-tab skeleton that wipes the layout; section skeletons keep the IA visible while data streams in.
4. **Empty states.** Each section handles its own empty case. Use the existing `EmptyState` component. Empty copy lives at the section level and references the section concretely ("No subscription events in this window" not "No data").
5. **Color use.** Mint (`var(--color-ua)`) is the accent on Lifecycle (UA team color). Mint is also the accent on Attribution because the user is the UA analyst. Amber on coverage warnings only. No coral, no violet, no yellow accent anywhere except where existing brand tokens demand it.
6. **No raw hex values.** All colors via CSS custom properties (yellowhead-brand skill is the source of truth). If a needed color does not exist as a token, propose it in the PR description rather than inlining a hex.
7. **GlassCard rhythm.** Every top-level section is a GlassCard (or composes one). The tab orchestrator never renders raw `div` containers with background colors.

## Acceptance

Manual:

1. `/dashboard?tab=lifecycle` renders four distinct sections in the layout above. The page reads as a vertical narrative: numbers, then trend, then split + detail.
2. `/dashboard?tab=attribution` renders three distinct rows in the layout above. The page reads top-down: hero, mix + freshness, then warnings.
3. Switching between tabs feels visually consistent with Performance. No jarring shifts in spacing, typography, color, or card treatment.
4. All loading states render properly when data is in flight.
5. All empty states render properly with the active window pre-set to a date range with no data.
6. Resize the window to md and sm breakpoints. Sections reflow per the responsive rules.
7. Open the page in dark theme (default). Open it in light theme. Both render correctly per yellowhead-brand tokens.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes. New tests for both workstreams. Report before / after test count in the PR description.
3. `npm run build` is clean.
4. E2E specs run green.

## Commit shape

Suggested commits in order:
1. `WS1.A: extract LifecycleKpiStrip from SubscriberLifecycle`
2. `WS1.B: build NetSubTrend chart, replace bar list`
3. `WS1.C: extract OsMixCard with donut visual`
4. `WS1.D: extract DailySubsTable with sortable columns`
5. `WS1.E: orchestrate LifecycleTab, delete SubscriberLifecycle`
6. `WS2.A: BcacHero hero variant`
7. `WS2.B: PaidVsOrganicCard with share bar`
8. `WS2.C: CoverageWarningCard primitive + Row composition`
9. `WS2.D: AttributionTab orchestrator + useAttributionData hook`
10. `WS2.E: DataFreshnessBar compact variant`

PR title: `Lifecycle + Attribution visual upgrade — section decomposition and tab grammar`

PR description should include:
- Two before / after screenshots (Lifecycle stuffed card vs decomposed; Attribution empty vs designed).
- Test count delta.
- Any new brand tokens proposed (per rule 6 above).
- Note that this completes the visual side of the 3-tab IA shipped via the queued dashboard rework.

## Follow-up not part of this PR

- The amber `--color-warning` token may need to be formalized in yellowhead-brand. If Claude Code finds no existing amber token and has to propose one, note it in the PR description; Omer will fold it into the brand skill in a later pass.
- The `CoverageWarningCard` is signage only in this PR. A future pass turns each warning into an actionable link (Slack to Gabby, ticket to BI, etc.). Do NOT add interaction now.
- Per-tab AI Mode is a future refinement per CLAUDE.md. Both Lifecycle and Attribution today share the page-level AI Mode; do not introduce per-tab AI Mode here.
