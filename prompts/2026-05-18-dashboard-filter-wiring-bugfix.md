# [SUPERSEDED 2026-05-18] Dashboard filter-wiring bug fix: thread OS + Platform through the existing dashboard hook (2026-05-18)

> **Do not implement this prompt.** Folded into `2026-05-18-dashboard-full-rework.md` as WS1. Kept on disk for traceability.

---

Owner: Omer. Small, tight PR on a new branch off `main` named `dashboard-filter-bugfix`. **Ships first**, before the larger IA reorg (`2026-05-18-dashboard-tabs-and-polish.md`). One focused workstream. Estimated PR size: 1 file changed, ~10 lines, plus tests.

## Why

The previous PR (`globalcomix-full-implementation`) added the `OS` and `Platform` filters to `useGlobalFilters` (`src/lib/filters/use-global-filters.ts`), to the API routes (`/api/bq/*` accept `?os=` and `?platforms=`), and to every `queryGlobalComix*` function in the data layer. But `useDashboardData` — the hook that drives 6 of the 11 sections on `/dashboard` (KPI tiles, TrendChart, ChannelMix, NetworkBreakdown, PaybackCurve, DataBounds) — was never updated to consume the new filters from `useGlobalFilters` or pass them to the API.

Effect today: the user clicks the `iOS` chip on the TopBar. The four new sections (`CadenceTable`, `WeekendsVsWeekdays`, `SubscriberLifecycle`, `PaidVsOrganic`) re-fetch with `?os=ios`. The five existing sections do not — they silently keep showing total-everything numbers. Filter chips visibly fire but most of the dashboard ignores them.

This is a trust-killer. The team will click the chip, see the headline KPI tile show the exact same `$317k Spend` for `Total` and `iOS` and `Android`, and conclude the filter is broken.

The fix is small. Three lines in `useDashboardData` and the API call URLs naturally widen because the routes already accept the new params.

## File in scope

```
src/lib/dashboard/use-dashboard-data.ts
```

Plus test additions:

```
tests/unit/lib/dashboard/use-dashboard-data.test.ts   // create if missing
```

## Change

In `src/lib/dashboard/use-dashboard-data.ts`:

### Step 1 — Extend the hook's input

The hook currently takes `{ from, to, client }`. Extend to also accept `os` and `platforms`:

```ts
// ~line 18 today
type Args = {
  from: Date;
  to: Date;
  client: string;
  // ── added: ──
  os: OsFilter;          // import from "@/lib/filters/types"
  platforms: PlatformFilter[];
};
```

### Step 2 — Build the query string with the new params

`useDashboardData` constructs URLSearchParams around line 112 today:

```ts
// before
const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
```

Extend to include `os` and `platforms` when they're non-default. Default values (`os === "total"`, `platforms.length === 0`) are omitted from the URL so cache keys collapse to the same string as the pre-filter shape — preserves existing cache entries for users who haven't touched the filters yet.

```ts
// after
const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
if (os !== "total") qs.set("os", os);
if (platforms.length > 0) qs.set("platforms", platforms.join(","));
```

Same treatment for the `boundsQs` (DataBounds doesn't take date range and probably doesn't need OS / platforms, but check the API contract — `/api/bq/data-bounds/route.ts` — and add them if it does).

### Step 3 — Update the caller

`DashboardView` (in `src/components/dashboard/DashboardView.tsx`) calls the hook around line 48:

```ts
// before
const { from, to, client, setCustomRange } = useGlobalFilters();
const { data, loading, errors, bounds, windowEmpty, refetch } =
  useDashboardData({ from, to, client });

// after
const { from, to, client, os, platforms, setCustomRange } = useGlobalFilters();
const { data, loading, errors, bounds, windowEmpty, refetch } =
  useDashboardData({ from, to, client, os, platforms });
```

### Step 4 — Update the effect deps

The `useEffect` that fires the fetches reads from the closure. Add `os` and the JSON-stable `platforms` representation to the dep list so a filter change re-triggers the fetch:

```ts
}, [client, fromIso, toIso, os, platforms.join(","), nonce, refetch]);
```

`platforms.join(",")` is the stable-identity trick — `platforms` itself is a new array reference on every render. The joined string is the same string for the same set, so React's identity check sees no change unless the actual values changed.

## What about the JSON `data-bounds` route

`useDashboardData` separately fetches `/api/bq/data-bounds` for the earliest / latest available date. That query is keyed by `client` only — it doesn't take a date range or a filter set because the bounds are global ("what data does the warehouse have for this client?"). Don't add `os` or `platforms` to that fetch. The `boundsQs` stays narrow.

## What about /api/bq/channel-mix when the client is multi-source

Multi-source clients (GlobalComix today) skip the `channel-mix` endpoint entirely — the dashboard derives mix client-side from `networkBreakdown`. Today's code at lines 134-142 handles this. **Keep that behavior.** The skip-channel-mix path stays. Don't try to route channel-mix through the filters when it isn't being fetched.

## Tests

Create or extend `tests/unit/lib/dashboard/use-dashboard-data.test.ts`:

1. **URL shape with default filters** — `os = "total"`, `platforms = []` produces fetches whose URLs do NOT carry `os` or `platforms` params. Cache key shape is unchanged from the pre-PR string.
2. **URL shape with OS narrowed** — `os = "ios"` produces fetches whose URLs carry `os=ios`.
3. **URL shape with platforms narrowed** — `platforms = ["meta", "google"]` produces fetches whose URLs carry `platforms=meta%2Cgoogle`.
4. **Refetch triggers on filter change** — Mount with `os = "total"`, then update to `os = "ios"`: a second fetch fires. Use the React Testing Library / Vitest pattern already in the unit tests folder.
5. **Identity stability on equal arrays** — Mount with `platforms = ["meta"]`, then re-render with a NEW array reference holding the same value `["meta"]`: NO second fetch fires (the `.join(",")` dep saves us from a thrash).

Mock the global `fetch` per the existing test patterns in this repo.

## Acceptance

- Clicking `iOS` on the TopBar OS chip updates the 4 KPI tiles, TrendChart, ChannelMix donut, NetworkBreakdown table, and PaybackCurve. Numbers visibly change.
- Clicking `Meta` on the TopBar Platform chip narrows the same sections to Meta-only data.
- Default filters (`Total`, no platform narrowing) produce identical URL strings to the pre-PR shape — existing cache entries hit on the first load post-deploy.
- All five new unit tests pass.
- TypeScript typecheck passes.
- All existing tests pass.

## Out of scope (intentionally)

- Anything in `src/lib/globalcomix-queries.ts` (the queries already accept `os` / `platforms` — verified by reading the diff from the previous PR).
- Any API route — they already accept `os` / `platforms` query params.
- Any new section.
- The IA reorg into tabs (separate prompt: `2026-05-18-dashboard-tabs-and-polish.md`).
- Any visual / polish work (rolled into the tab-reorg prompt).

## Branch and PR shape

Single branch `dashboard-filter-bugfix` off `main`. One commit. Final commit message says "fix: thread OS + Platform filters through useDashboardData (closes silent-ignore on KPI/Trend/ChannelMix/NetworkBreakdown/Payback)".

Reviewable in five minutes.

## Reference

- `src/lib/dashboard/use-dashboard-data.ts` — the hook
- `src/lib/filters/use-global-filters.ts` — where `os` / `platforms` already live
- `src/lib/filters/types.ts` — the `OsFilter` and `PlatformFilter` types
- Previous PR: `globalcomix-full-implementation` (8 commits, merged to main)
- Audit that surfaced this: chat conversation 2026-05-18 ("filter-respect matrix")
