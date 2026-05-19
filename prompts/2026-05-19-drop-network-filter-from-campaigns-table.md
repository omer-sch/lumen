# Drop the Network filter from the Campaigns table (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `drop-network-filter-from-campaigns-table`. One workstream. Targeted change.

## Why

The Campaigns table at `/campaigns` today renders four filter chips above the table: **Network**, **Family**, **Geo**, **Status**. The TopBar already has a global **Channels** chip strip (Meta / Google / TikTok / ASA / AppLovin) that scopes the entire page, including the Campaigns table (wired through `useGlobalFilters` -> `useCampaignsData` -> `/api/bq/campaigns`).

That makes the table-local Network filter redundant. It creates two sources of truth for the same dimension. If a user sets TopBar Channels to "Meta + Google" and the table's Network chip to "Meta only", the page is internally inconsistent and the user has to mentally reconcile two filters that should be one.

The principle going forward: **the TopBar is the page's authoritative scope for any dimension that exists at both page level and row level.** Table-local chips are only justified when they expose a refinement the TopBar cannot — Family, Geo, and Status are good examples (no TopBar equivalent, only relevant on this surface).

We are removing the Network chip from the Campaigns table. We are NOT removing Family, Geo, or Status.

## TL;DR

One workstream, single PR.

1. Remove the Network dropdown chip and all its plumbing from `CampaignsTable.tsx`.
2. Remove the `NetworkOption` type, the `NETWORK_OPTIONS` constant, and the `matchesAnyNetwork` helper.
3. Update unit and E2E tests that reference `campaigns-filter-network` or import the removed helpers.
4. Leave Family / Geo / Status untouched.
5. Sanity check that the TopBar Channels chip still filters the table end to end after the change (it should, because `platforms` is already threaded through `useCampaignsData` and on into the BQ query).

Estimated PR size: 2 to 4 files touched. ~20 lines added, ~80 lines removed. Test budget: net -10 to -20 lines (a couple of tests deleted, none added).

---

## WS1 — Drop the Network chip

### File touchpoints

```
src/components/campaigns/CampaignsTable.tsx
tests/unit/lib/campaigns/campaigns-table-helpers.test.tsx
tests/e2e/campaigns.spec.ts
```

### Change in `CampaignsTable.tsx`

Remove all of the following:

1. The `NETWORK_OPTIONS` constant (around line 74) and the `NetworkOption` type alias.
2. The `matchesAnyNetwork` helper function (around lines 82 to 96) including its doc comment.
3. The `const [networks, setNetworks] = useState<NetworkOption[]>([]);` state declaration (around line 149).
4. The `networks.length > 0 && !matchesAnyNetwork(...)` branch inside the `filtered` useMemo (around lines 180 to 182). Adjust the dependency array on that `useMemo` to drop `networks`.
5. The Network `FilterDropdown` block at the top of the chip row (around lines 231 to 237):

```tsx
<FilterDropdown
  testIdPrefix="campaigns-filter-network"
  label="Network"
  options={NETWORK_OPTIONS as readonly string[] as string[]}
  selected={networks}
  onChange={(next) => setNetworks(next as NetworkOption[])}
/>
```

Keep the rest of the chip row intact: Family, Geo, Status, the `campaigns` count, and the "More cols" toggle should all stay exactly where they are.

After the edit, the chip row should open with the Family dropdown (when at least two families are present), then Geo (when at least two geos are present), then Status, then the count and toggle on the right.

### Sanity check — the TopBar Channels chip still works

Open `src/components/campaigns/CampaignsView.tsx` and confirm that the `useCampaignsData` call already destructures and passes `platforms` from `useGlobalFilters` (it does today — line 23 + line 31). Do NOT change this file. The point of the sanity check is to make sure nobody assumes the Network dimension is now unfiltered. It is filtered, just from the TopBar, which is exactly the intent.

If for any reason `platforms` is not currently being threaded through to the BQ query end to end, fix that thread in a separate commit before this one and call it out in the PR description. (I am 99% sure it is wired, based on the post-merge state of `globalcomix-full-implementation`, but Claude Code should verify the chain `useGlobalFilters.platforms` -> `useCampaignsData({ platforms })` -> `/api/bq/campaigns?platforms=...` -> the SQL `WHERE` clause via the platforms filter helper. One quick grep through `src/app/api/bq/campaigns/` and `src/lib/globalcomix-queries.ts` is enough.)

### Tests to update

**`tests/unit/lib/campaigns/campaigns-table-helpers.test.tsx`** — this file currently exercises `matchesAnyNetwork`, `NETWORK_OPTIONS`, or the Network dropdown's interaction logic. Delete those test cases. If the file becomes empty after the deletions, delete the file itself. Keep any Family / Geo / Status tests in the same file intact.

**`tests/e2e/campaigns.spec.ts`** — locate any `getByTestId("campaigns-filter-network-toggle")` or `campaigns-filter-network-opt-*` selectors. Delete those assertions. Do NOT replace them with TopBar Channels chip assertions — those are the dashboard's existing E2E concern and not the responsibility of the Campaigns spec.

If either test file referenced the Network filter as part of a longer scenario (for example "open the page, narrow by Meta only, assert N rows"), rewrite the scenario to narrow by Family or Geo instead so the spec still exercises the chip-filter codepath without the Network dimension.

### Out of scope

- Do NOT touch the dashboard. The TopBar's Channels chip is the dashboard's concern and stays as is.
- Do NOT touch the per-campaign profile route (`/campaigns/[id]`). That route already scopes to a single campaign so Network is moot.
- Do NOT touch `/campaigns/creatives`. That route has its own local filter strip (Campaign / Adset / Ad Name / Campaign Status / Ad Status / Country) and none of those overlap with the TopBar.
- Do NOT remove the Network COLUMN from the table. The column is a display dimension, not a filter, and users want to see at a glance which network each row belongs to.

## Acceptance

Manual:

1. `/campaigns` loads with three filter dropdowns: Family, Geo, Status. No Network dropdown.
2. Click the TopBar Channels chip strip and toggle to "Meta only". The Campaigns table re-renders showing only Meta campaigns.
3. Click another TopBar Channels combination ("Google + TikTok"). The table re-renders to only those networks.
4. Family, Geo, and Status dropdowns all still work and compose correctly with the TopBar.
5. The "More cols" toggle still works.
6. Row click navigation to `/campaigns/[id]` still works and preserves the TopBar filters in the URL.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes. Test count drops by however many cases were tied to the Network filter; report the before / after numbers in the PR description.
3. `npm run build` is clean.
4. The relevant E2E spec runs green.

## Commit shape

Single commit on the branch is fine. Title: `Drop Network filter from Campaigns table — TopBar Channels chip is the single source of truth`. Body should call out the four files touched, the test count delta, and the principle (TopBar is authoritative for any dimension that exists at both page and row level).

## Follow-up housekeeping (not part of this PR)

The queued prompt at `prompts/2026-05-18-campaigns-page-real-data-and-profile.md` still lists "Channel (existing) — Meta / Google / TikTok / ASA / AppLovin / All" as one of the four filter chips in its WS2 spec. After this PR lands, that line in the queued prompt is stale. Omer will update the queued prompt separately so it does not re-introduce the chip if it ever ships. Claude Code does NOT need to touch the queued prompt as part of this PR.
