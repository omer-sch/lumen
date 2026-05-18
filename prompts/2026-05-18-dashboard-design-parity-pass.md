# [SUPERSEDED 2026-05-18] Dashboard design parity pass — bring the new WS6/WS7 surfaces up to the level of the existing dashboard (2026-05-18)

> **Do not implement this prompt.** Superseded by `2026-05-18-dashboard-tabs-and-polish.md`, which folds this design polish work into the larger three-tab IA reorganization. Both PRs touch the same set of files, so they bundle. Kept on disk for traceability.

---

Owner: Omer. Single PR on a new branch off `main` named `dashboard-design-parity`. **Behavior must not change in this PR.** The data layer, the queries, the filter logic, the cache wiring — all of it stays exactly as it shipped in `globalcomix-full-implementation`. This is a visual and interaction-polish pass only.

## Why this is happening

The 2026-05-17 PR landed five new dashboard surfaces (`CadenceTable`, `WeekendsVsWeekdays`, `SubscriberLifecycle`, `PaidVsOrganic`) plus two new TopBar chips (`OsFilter`, `PlatformFilter`). Functionally they work. Visually they sit at a lower polish level than the existing surfaces — KpiCard, TrendChart, NetworkBreakdown, ChannelMix, DateRangePicker, ClientSelector — which the team already trusts and recognizes as "Lumen quality". Side-by-side, the new components read as not-yet-finished.

The gap is consistent: missing loading skeletons (layout jumps on cold cache), no entrance stagger, no `CountUpNumber` animation on big numbers, no delta chips on the new tables, no row hover treatment, components that return `null` instead of rendering an empty-state card, KPI-like tiles that don't match the actual `KpiCard` shape, and topbar chips whose neutral state doesn't match `ClientSelector` precisely.

This PR closes that gap so a user can't tell which sections are "new" and which sections shipped earlier.

## Spec sources

- **yellowhead-brand skill** at `.claude/skills/yellowhead-brand/SKILL.md` — the brand-design authority. Re-read at the start of this work. Component Quick Reference table (cards, buttons, chart colors, badges) is the canonical lookup.
- **Gold-standard model components** — these existed before WS7 and are the bar to clear. Match their visual grammar:
  - `src/components/dashboard/KpiCard.tsx` — KPI tile shape (CountUpNumber, delta chip, stagger entry, hero vs compact variants)
  - `src/components/dashboard/NetworkBreakdown.tsx` — table shape (row tinting, status pill, hover states)
  - `src/components/dashboard/TrendChart.tsx` — chart shape (axis treatment, color palette, tooltip)
  - `src/components/dashboard/ChannelMix.tsx` — donut shape
  - `src/components/shell/ClientSelector.tsx` — TopBar dropdown shape (active mint tint, popover, focus ring)
  - `src/components/shell/DateRangePicker.tsx` — TopBar segmented control shape
- **UI primitives** to reuse:
  - `src/components/ui/GlassCard.tsx` — `glow`, `bezel`, `interactive`, `enterIndex` props
  - `src/components/ui/CountUpNumber.tsx` — animated number value
  - `src/components/ui/Skeleton.tsx` — the existing `KpiCardSkeleton` is the template
  - `src/components/ui/SectionError.tsx`, `EmptyState.tsx`, `InfoCallout.tsx`, `LivePulse.tsx`
  - `src/lib/dashboard/delta-signal.ts` + `cell-tone.ts` — already written, ready to use

## Files in scope

```
src/components/dashboard/CadenceTable.tsx
src/components/dashboard/WeekendsVsWeekdays.tsx
src/components/dashboard/SubscriberLifecycle.tsx
src/components/dashboard/PaidVsOrganic.tsx
src/components/dashboard/NetworkBreakdown.tsx            // WS7.C from previous PR was deferred — wire cell-tone here
src/components/shell/OsFilter.tsx
src/components/shell/PlatformFilter.tsx
src/components/ui/Skeleton.tsx                            // add new section-shaped skeletons here
```

Do NOT touch:
- Any `src/lib/` file (data layer, cache, analyst, queries) — behavior is frozen.
- Any `src/app/api/bq/*` route — wire shape is frozen.
- Any existing dashboard tile from before WS7 — these are the model, don't fix what isn't broken.

## TL;DR

Six small workstreams, single PR. Each is pattern-level (not component-level), so a change ripples across all four new dashboard surfaces and both new chips simultaneously.

1. **WS1 — Tile parity.** Every KPI-shaped tile across the new surfaces (`KpiTile` in `SubscriberLifecycle`, `BcacTile` + `Tile` in `PaidVsOrganic`) becomes a real `KpiCard` with `CountUpNumber`, delta chips, and stagger entry — or imports the shared primitive instead of re-rolling its own.
2. **WS2 — Section-shaped skeletons.** Each of the four new dashboard cards gets its own `CardSkeleton` mounted while data is loading. No more layout jump on cold cache.
3. **WS3 — Table row treatment.** Cadence + Weekends tables gain row hover, period-vs-baseline cell tinting via the existing `cell-tone.ts`, and a delta column where natural.
4. **WS4 — WS7.C (deferred from prev PR) — NetworkBreakdown color-coded scorecard.** Wire `cell-tone.ts` into `NetworkBreakdown`. The helper and tests are already shipped; this just integrates them.
5. **WS5 — Empty states.** Replace the four `return null` paths with sized `EmptyState` cards so the dashboard layout stays stable when a section has no data.
6. **WS6 — TopBar chip parity.** `OsFilter` + `PlatformFilter` triggers match `ClientSelector`'s neutral-state border, padding, and icon weight precisely.

Estimated PR size: 8-12 files touched. ~300-500 lines added. ~50-100 lines removed (the re-rolled tile bodies that get replaced by `KpiCard`). Test budget: +20-30 unit tests, no new E2E required (visual snapshots if the team uses them).

---

## WS1 — Tile parity

### What's wrong today

`SubscriberLifecycle` (`src/components/dashboard/SubscriberLifecycle.tsx` lines 115-144) defines an inline `KpiTile` component with:
- Plain `value.toLocaleString()` — no count-up animation
- No delta chip
- No stagger entry
- No swap affordance

`PaidVsOrganic` (`src/components/dashboard/PaidVsOrganic.tsx` lines ~100-150) defines inline `BcacTile` and `Tile` components with the same issues.

Meanwhile `KpiCard` in the same directory has all of these as first-class props. The new components are reinventing a worse version.

### Change

Replace the inline tile bodies with the shared `KpiCard` component. KpiCard accepts a `value: string` (pre-formatted) plus `delta: number | null`, plus `direction` ("higher-better" | "lower-better"), plus `size: "hero" | "compact"`, plus `enterIndex`. Pass:

- **SubscriberLifecycle KpiTiles:**
  - `New subscribers`: `value=fmt(totals.subs)`, `delta=null` (no prior-period for lifecycle today; leave delta null so it renders `—`), `direction="higher-better"`, `size="compact"`, `enterIndex=1`
  - `Cancellations`: `value=fmt(totals.churn)`, `delta=null`, `direction="lower-better"`, `size="compact"`, `enterIndex=2`
  - `Net Sub`: `value=fmt(totals.netSub)`, `delta=null`, `direction="higher-better"`, `size="compact"`, `enterIndex=3`, `highlight={true}` (this is the section's headline)

- **PaidVsOrganic tiles:**
  - `BCAC`: `value=fmt(bcac)`, `delta=null`, `direction="lower-better"`, `size="compact"`, `enterIndex=1`, `highlight={true}` (BCAC is the section's headline; render with the mint-tinted highlight treatment)
  - `Sub Total`: `value=fmt(totals.subD7)`, `delta=null`, `size="compact"`, `enterIndex=2`
  - `Sub Paid / Organic`: this isn't a single number — keep it as a custom small tile but match KpiCard's box shape (border, radius, padding). Don't try to shove a two-number value into KpiCard.

If a section has no period-over-period data (today: lifecycle, paid-vs-organic), `delta=null` is the honest signal — KpiCard renders `—` and a "No prior-period baseline" tooltip per its existing logic. **Do not fabricate a baseline just to fill the chip.**

### Acceptance

- `SubscriberLifecycle` and `PaidVsOrganic` no longer define inline `KpiTile` / `BcacTile` / `Tile` components.
- Both sections render a row of `<KpiCard size="compact" />` instances with proper `enterIndex` stagger.
- Big numbers animate via CountUpNumber on first mount.
- Visual snapshot of `/dashboard` side-by-side: the new lifecycle and paid-vs-organic tile rows are visually indistinguishable in tile-shape from the existing KPI strip.

---

## WS2 — Section-shaped skeletons

### What's wrong today

`CadenceTable`, `WeekendsVsWeekdays`, `SubscriberLifecycle`, `PaidVsOrganic` all have a `loading` state that renders nothing (`return null`) or implicitly empty content. On a cold-cache load this causes the dashboard layout to jump as each section pops into existence.

### Change

Add four new exports to `src/components/ui/Skeleton.tsx`:

```ts
export function CadenceTableSkeleton() { /* GlassCard + header row + 4 placeholder table rows */ }
export function WeekendsVsWeekdaysSkeleton() { /* GlassCard + 2-row table + bar chart placeholder */ }
export function SubscriberLifecycleSkeleton() { /* GlassCard + 3 KpiCardSkeleton tiles + 2 chart placeholders */ }
export function PaidVsOrganicSkeleton() { /* GlassCard + 3 KpiCardSkeleton tiles + 1 share-bar placeholder */ }
```

Each follows the existing `KpiCardSkeleton` pattern: same outer GlassCard shape, `Skeleton` placeholders sized to match the eventual content's bounding boxes. Shimmer animation respects `prefers-reduced-motion` (the existing `Skeleton` primitive already does this).

In each component, replace the loading branch:

```tsx
// before
if (loading) return null;
// after
if (loading) return <CadenceTableSkeleton />;
```

### Acceptance

- Cold-cache reload of `/dashboard` shows skeletons in every new section position, then they swap to real data without layout shift.
- A unit test per skeleton confirms the rendered box matches the eventual card's bounding box (use `render` from `@testing-library/react` and check the wrapper class list / inline style).
- All four skeletons honor `prefers-reduced-motion` (no shimmer when set).

---

## WS3 — Table row treatment

### What's wrong today

`CadenceTable` and `WeekendsVsWeekdays` render their tables as plain rows — no hover state, no row-level highlight, no cell tinting on metrics that have a sensible baseline. `NetworkBreakdown` (the model) has all of these.

### Change

**Row hover state.** Add to both tables, matching `NetworkBreakdown`'s pattern:

```tsx
<tr
  className="border-t transition-colors"
  style={{ borderColor: "var(--border-subtle)" }}
  onMouseEnter={…}     // or pure CSS via :hover
>
```

The hover background is `color-mix(in oklab, var(--color-ua) 6%, transparent)` for visual continuity with the rest of the dashboard's mint accent.

**Cell tinting on rate metrics.** The `src/lib/dashboard/cell-tone.ts` helper landed in the previous PR but is unused. Import it in both tables and apply to:

- CadenceTable: `cpaD7`, `roiD7`, `installCvr` columns. Baseline is the table's own grand-total average (computed inline).
- WeekendsVsWeekdays: `cpaD7`, `roiD7`, `installCvr`, `subCvr` columns. Baseline is the OTHER row in the table (weekend-vs-weekday is a direct comparison; each side IS the other's baseline).

Apply tone via a soft cell background — same approach the prompt's WS7.C section called for in the previous PR:

```tsx
const tone = cellTone(value, baseline, direction);
const bg =
  tone === "good" ? "color-mix(in oklab, var(--color-ua) 10%, transparent)" :
  tone === "bad"  ? "color-mix(in oklab, var(--color-creative) 10%, transparent)" :
  tone === "warn" ? "color-mix(in oklab, var(--color-yellow) 8%, transparent)" :
                    "transparent";
```

**Delta column on CadenceTable.** Add one new column at the rightmost position: `Δ vs prior period`. The "prior period" for a Weekly row is the previous week; for a Monthly row, the previous month; for a Daily row, no delta (`—`). Compute client-side from the existing trend data — no new query.

For Weekly and Monthly: scan the cadence-aggregated rows; for row N, look up row N-1 and compute delta on `cpaD7` specifically (the section's headline metric). Render as a delta chip matching `KpiCard`'s chip shape (`ArrowUpRight / ArrowDownRight`, mint or coral tint based on lower-better direction).

### Acceptance

- Hover over any row in `CadenceTable` or `WeekendsVsWeekdays`: row gets a soft mint tint.
- `CadenceTable` weekly view: each row's CPA D7 cell shows a tone (good / warn / bad / neutral) based on the table average; the rightmost column shows a delta chip vs prior week.
- `WeekendsVsWeekdays`: weekend row's CPA D7 cell is green when weekend CPA is lower than weekday (the live data shows weekends beat weekdays on every funnel metric — this should jump out visually).
- A unit test asserts `cellTone(weekend.cpaD7, weekday.cpaD7, "lower-better") === "good"` given the live numbers.

---

## WS4 — NetworkBreakdown color-coded scorecard (deferred from previous PR)

### What's wrong today

The previous PR (`globalcomix-full-implementation`) shipped the `cell-tone.ts` helper and its tests but did NOT wire it into `NetworkBreakdown.tsx`. Claude Code's commit message (`70077db`) called this out: *"helper landed; visual integration is a follow-up so I don't risk regressing the existing breakdown surface."* That follow-up is now.

### Change

In `src/components/dashboard/NetworkBreakdown.tsx`, apply `cellTone` to the rate metric cells (CPI, CPA D7, ROI D7) using **previous-period same-network** as the baseline. The previous-period baseline is already in the per-network breakdown query as `trailingCpaD7Avg` (and analogous fields if they're projected — verify against the `NetworkRow` type in `src/types/dashboard.ts`).

Tone rules per the spec:
- CPI, CPA D7 (lower-is-better): `good` ≤ baseline × 0.9, `bad` ≥ baseline × 1.2, `warn` ≥ baseline × 1.05.
- ROI D7 (higher-is-better): inverted (`good` ≥ baseline × 1.1, `bad` ≤ baseline × 0.8, `warn` ≤ baseline × 0.95).

Cell-background tints same as WS3.

Add a hover tooltip on tinted cells: `"CPA D7 is 18% above this network's previous-period average."`

Keep the existing `statusFromCpaD7` status pill as is — that's a different surface (the pill is per-network status; cell tinting is per-metric).

### Acceptance

- Each rate metric cell in `NetworkBreakdown` has a soft tinted background driven by `cellTone` against the network's previous-period baseline.
- Cell tints meet 4.5:1 contrast against the cell text (use `--text-primary`; check against each tint).
- Hover tooltip explains the tone in plain words with the percentage.
- A unit test asserts that for a fixture network with `cpaD7=46` and `trailingCpaD7Avg=22`, the cell tone is `"bad"` (46 ≥ 22 × 1.2).
- The existing status pill at the row level renders unchanged.

---

## WS5 — Empty states

### What's wrong today

When a query returns zero rows (e.g. a date range with no data, a platform filter that excludes everything, or an AppLovin query against pre-coverage dates), the new components `return null`. The card disappears from the dashboard entirely. That's confusing — the user can't tell whether the section is loading, broken, or just empty.

### Change

In each of the four new sections, replace the `if (!loading && empty) return null` path with an empty-state card that keeps the layout slot:

```tsx
import { EmptyState } from "@/components/ui/EmptyState";

if (!loading && empty) {
  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <header>
        <h3 className="font-display text-lg font-bold text-cloud-white">
          {/* same title as the loaded state */}
        </h3>
      </header>
      <EmptyState
        message="No data for this window."
        hint={hint}                       // section-specific, see below
      />
    </GlassCard>
  );
}
```

Per-section `hint`:
- `CadenceTable`: "Try a wider date range."
- `WeekendsVsWeekdays`: "Try a wider date range or remove the platform filter."
- `SubscriberLifecycle`: "Lifecycle data starts 2020-11-18. Check the active window."
- `PaidVsOrganic`: "Try widening the date range or removing the platform filter."

If `EmptyState` doesn't already accept a `hint` prop, add one. Keep the component's existing API additive.

### Acceptance

- Setting the date range to a window with no data (e.g. 2025-01-01 to 2025-01-02 — pre-pilot) shows all four new sections rendering empty-state cards, NOT disappearing.
- Section headers remain visible so the user can tell what they're looking at.
- Layout doesn't shift — the empty card occupies the same vertical space as the loaded card.

---

## WS6 — TopBar chip parity

### What's wrong today

`OsFilter` and `PlatformFilter` triggers (`src/components/shell/OsFilter.tsx`, `PlatformFilter.tsx`) are close to `ClientSelector`'s shape but diverge in three ways:

1. **Neutral state border treatment.** ClientSelector always renders with `--color-ua-dim` background and a UA-tinted border (it's always "active" because a client is always selected). OsFilter / PlatformFilter switch between a `--color-ua-dim` / `--surface-input` background depending on whether the filter is narrowed. The neutral state's border `var(--border-subtle)` is too soft compared to the rest of the topbar.
2. **Icon weight.** ClientSelector uses `<Users>` at lucide's default weight. OsFilter uses `<Smartphone>` with `strokeWidth={2}`; PlatformFilter uses `<NetworkIcon>` with `strokeWidth={2}`. These read slightly heavier than ClientSelector's icon.
3. **Padding.** ClientSelector uses `px-2.5 py-1.5`. OsFilter and PlatformFilter match this — good. But the active-state `box-shadow` ring that ClientSelector has on hover is missing from the new chips. Add it.

### Change

In both `OsFilter.tsx` and `PlatformFilter.tsx`:

- Change icon `strokeWidth` from `2` to default (remove the prop).
- Match ClientSelector's hover ring: add `hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ua)_18%,transparent)]` (or use the existing `shadow-elevated` token if applicable).
- For the neutral state border, use `var(--border-default)` instead of `var(--border-subtle)` so the trigger reads at the same visual weight as ClientSelector.

In `OsFilter.tsx` specifically:
- The `"OS · "` prefix in the label is awkward on hover. Either drop the prefix entirely (the icon + the value suffices) OR move the prefix into the tooltip. Decide based on a quick A/B mockup in the PR description; prefer the simpler "icon + value" reading.

### Acceptance

- Side-by-side screenshot of the TopBar shows `DateRangePicker / OsFilter / PlatformFilter / ClientSelector` reading as four visually equivalent controls.
- Active-state styling (mint tint + UA-bordered) is consistent across all three dropdowns.
- Hover ring matches.
- All three keep their existing focus-visible mint outline.

---

## Operating rules

- **No behavior changes.** No new queries. No new filter values. No new API params. No new analyst hooks. This PR exists to make existing functionality look right.
- **Reuse existing primitives.** If you find yourself rolling a new tile / chip / table-row component, stop — there's already one. The brand skill explicitly says "remove anything that doesn't earn its place."
- **No new fonts or colors.** The brand has two fonts (Bricolage Grotesque + Montserrat) and a fixed palette. Every color you use must be a CSS variable from `globals.css` — never a hex.
- **`prefers-reduced-motion` respected** anywhere a new animation is introduced.
- **Mobile-responsive.** All four new dashboard sections must remain readable on a 380px-wide viewport (the brand skill's mobile baseline). Tables can horizontal-scroll; tile grids must collapse to single column.
- **Don't touch the existing dashboard tiles, charts, or shell components beyond what's named.** They are the gold standard; this PR brings the new surfaces up to that bar.
- **All chains of new components stay flat.** Don't add new ContextProviders or hooks; reuse `useGlobalFilters` which already carries everything.

## Acceptance for the whole PR

- `/dashboard` on cold-cache reload: every section shows a section-shaped skeleton during load, then swaps to content without layout shift.
- A user clicking through filters cannot tell which sections shipped pre-WS7 and which shipped in WS7 — visually, they all read as the same product.
- Every tile in `SubscriberLifecycle` and `PaidVsOrganic` is a `KpiCard` instance.
- `NetworkBreakdown` cells are tone-colored (deferred WS7.C now done).
- `CadenceTable` and `WeekendsVsWeekdays` have row hover + cell tinting + delta column (cadence only).
- Empty windows show empty-state cards, not vanished sections.
- TopBar trio of `OsFilter / PlatformFilter / ClientSelector` reads as visually equivalent.
- Typecheck passes. All existing tests pass. Test count delta +20 to +30.
- No new dependencies.

## Implementation notes

### Branch and PR shape

Single branch `dashboard-design-parity` off `main`. Commit per WS, numbered. Final commit is the visual snapshot capture if the team has a visual-regression harness.

### Order inside the PR

Run in the natural dependency order:

1. WS2 — Skeletons (lays the foundation for the loading branches in WS5).
2. WS1 — Tile parity (rebuilds the inner tile blocks; will be reused by WS5 empty states).
3. WS3 — Table row treatment.
4. WS4 — NetworkBreakdown scorecard (independent; can ship first or last).
5. WS5 — Empty states (depends on WS2 + WS1).
6. WS6 — TopBar chip parity (independent).

### Out of scope

- Anything in `src/lib/`.
- Anything in `src/app/api/`.
- Any change to `KpiCard`, `TrendChart`, `NetworkBreakdown` (other than the cell tinting in WS4), `ChannelMix`, `DateRangePicker`, `ClientSelector`.
- The Hermes / Smart Reports surfaces — they have their own design pass when their UI shipping starts.
- Mobile-specific surfaces — keep the existing responsive behavior, don't add new breakpoints.

### Open questions (not blocking)

1. Should `CadenceTable`'s delta column compute against the prior period within the active window, or against the equivalent prior period extending before the window? Default: within the window for now (no extra fetch); flag a TODO for the cross-window version once the cadence-aggregate query supports it.
2. Should the "Lifecycle is all OS regardless of the dashboard filter" note become an `InfoCallout` instead of inline text? Default: keep inline (cleaner header), but if the team finds it gets ignored, swap to `InfoCallout` in a follow-up.

### Reference

- Brand skill: `.claude/skills/yellowhead-brand/SKILL.md`
- Gold-standard model: `src/components/dashboard/KpiCard.tsx`, `NetworkBreakdown.tsx`, `ChannelMix.tsx`; `src/components/shell/ClientSelector.tsx`, `DateRangePicker.tsx`
- UI primitives: `src/components/ui/{GlassCard,CountUpNumber,Skeleton,EmptyState,SectionError,InfoCallout}.tsx`
- Existing helpers: `src/lib/dashboard/{delta-signal,cell-tone}.ts`
- Files to change: listed at the top of this prompt
