# Consolidate network color into one design-system source of truth (2026-05-19)

Owner: Omer. Single PR on a new branch off `main` named `network-color-consolidation`. Three workstreams. Supersedes `prompts/2026-05-19-applovin-color.md` (do NOT ship that one — this PR includes the AppLovin fix as part of consolidation).

## Why this exists

Five networks render on the dashboard (Google, Meta, TikTok, Apple Search Ads, AppLovin). Today there are **two unrelated color maps** for them, sitting in two files, with different mappings:

| Network | `src/lib/dashboard/network-colors.ts` (used by TrendChart, PlatformFilter) | `src/components/campaigns/CampaignsTable.tsx#networkStyle` (used by Campaigns pill) |
|---|---|---|
| Google | mint `#54F0A3` | yellow |
| Meta | violet `#926FDE` | mint (UA token) |
| TikTok | coral `#F88673` | coral (Creative token) |
| Apple Search Ads | gray `#9CA9C5` | violet (Organic token) |
| AppLovin | (missing — falls through to gray fallback, same as Apple) | coral (Creative token, same as TikTok) |

Concrete consequences:
- AppLovin and Apple Search Ads render identical gray on the dashboard's TrendChart and PlatformFilter.
- AppLovin and TikTok render identical coral on the Campaigns table.
- The same Meta campaign reads mint on the Campaigns table and violet on the TrendChart line for the same data window — the user sees a different color for the same network depending on which surface they're on.
- The canonical file (`network-colors.ts`) violates the project's "no raw hex in components" rule from `CLAUDE.md` — it uses `#54F0A3` directly instead of `var(--color-ua)`.

Both maps are also missing a structural piece: `network-colors.ts` only returns a solid color (for lines / dots), while the Campaigns table needs both a background tint and a foreground text color. The two shapes need to coexist behind one helper file.

## The canonical mapping this PR locks in

After this PR, every consumer reads from one helper. The mapping:

| Network | Solid (line / dot / accent stripe) | Soft tint (pill background) | Foreground (pill text) |
|---|---|---|---|
| Google | `var(--color-ua)` mint | `var(--tint-ua-soft)` | `var(--color-ua)` |
| Meta | `var(--color-organic)` violet | `var(--tint-organic-soft)` | `var(--color-organic)` |
| TikTok | `var(--color-creative)` coral | `var(--tint-creative-soft)` | `var(--color-creative)` |
| AppLovin | `var(--color-yellow)` yellow | `var(--tint-yellow-soft)` | `var(--color-yellow)` |
| Apple Search Ads | `var(--text-muted)` neutral gray | `var(--surface-hover)` | `var(--text-secondary)` |

Apple Search Ads stays gray on purpose — the existing comment in `network-colors.ts` documents the reasoning (Apple's volume on GlobalComix is structurally lower; the dashed line + gray treatment signals "support cast" without making it invisible). Keep `networkLineDashed("Apple Search Ads") === true`.

**Read `.claude/skills/yellowhead-brand/SKILL.md` first** to confirm the exact CSS variable names (`--color-ua`, `--tint-ua-soft`, `--color-yellow`, `--tint-yellow-soft`, etc.). If any of the five tokens the table above references does not exist in the brand skill or `globals.css`, propose the missing token in the PR description rather than inlining a hex. Most likely all five exist; `--color-yellow` and `--tint-yellow-soft` are the highest risk because yellow is a less-used accent.

The mapping decision (Google = mint, Meta = violet, TikTok = coral, AppLovin = yellow, Apple = gray) inherits from `network-colors.ts`'s existing deliberate design (per its header comment). `CampaignsTable.networkStyle`'s mapping is treated as drift that this PR corrects.

## Out of scope

- Do NOT change the dashed-line treatment. Apple Search Ads stays dashed.
- Do NOT touch any reports / Hermes / Smart Reports color usage. Those have their own (deliberate) color logic that doesn't read from these helpers.
- Do NOT change the ChannelMix component's bar treatment (it uses a single mint accent for active state, not per-network color — different visual language).
- Do NOT migrate the cell-tone helpers (`cell-tone.ts`) in this PR. They use brand color tokens but for good/bad/neutral signaling, not for network identity.
- Do NOT rename the existing `networkColor` function. Adding `networkTint` and `networkForeground` is fine; renaming `networkColor` would touch many consumers for no semantic reason.

## TL;DR

Three workstreams, single PR.

1. **WS1 — Canonical helpers.** Rewrite `network-colors.ts` to use CSS variables, add `networkTint` and `networkForeground` helpers alongside `networkColor`, add the AppLovin entry.
2. **WS2 — Migrate CampaignsTable.** Delete the local `networkStyle` function in `CampaignsTable.tsx`. Call the new helpers from `network-colors.ts` instead.
3. **WS3 — Test the regression guard.** Add or extend `tests/unit/lib/dashboard/network-colors.test.ts` to assert all five solid colors are distinct, all five tints are distinct, and the unknown-network case still hits the fallback.

Estimated PR size: 3 to 5 files touched. ~80 lines added, ~60 lines removed. Test budget: +10 to +15 unit, 0 E2E (visual change is the test).

---

## WS1 — Canonical helpers

### File touchpoints

```
src/lib/dashboard/network-colors.ts     // full rewrite
```

### Shape

The file exports three helpers and one type. Each helper takes a network name and returns a CSS-variable string ready to drop into `style={{ color: ..., background: ..., borderColor: ... }}`.

```ts
export const CANONICAL_NETWORKS = [
  "Google",
  "Meta",
  "TikTok",
  "AppLovin",
  "Apple Search Ads",
] as const;

export type CanonicalNetwork = (typeof CANONICAL_NETWORKS)[number];

/** Solid color: lines, dots, accent stripes, dot legends. */
export function networkColor(network: string): string { ... }

/** Soft tint: pill backgrounds, row tints, hover fills. */
export function networkTint(network: string): string { ... }

/** Foreground: pill text, on-tint label color. */
export function networkForeground(network: string): string { ... }

/** Whether this network renders dashed on a line chart. */
export function networkLineDashed(network: string): boolean { ... }
```

Internally, encode the mapping as a single record so the three helpers stay in lockstep:

```ts
const NETWORK_TOKENS: Record<CanonicalNetwork, {
  color: string;
  tint: string;
  foreground: string;
}> = {
  Google:             { color: "var(--color-ua)",        tint: "var(--tint-ua-soft)",        foreground: "var(--color-ua)" },
  Meta:               { color: "var(--color-organic)",   tint: "var(--tint-organic-soft)",   foreground: "var(--color-organic)" },
  TikTok:             { color: "var(--color-creative)",  tint: "var(--tint-creative-soft)",  foreground: "var(--color-creative)" },
  AppLovin:           { color: "var(--color-yellow)",    tint: "var(--tint-yellow-soft)",    foreground: "var(--color-yellow)" },
  "Apple Search Ads": { color: "var(--text-muted)",      tint: "var(--surface-hover)",       foreground: "var(--text-secondary)" },
};
```

Fallback strings for unknown networks: solid `var(--text-muted)`, tint `var(--surface-hover)`, foreground `var(--text-secondary)`. Same as Apple Search Ads, intentionally — Apple is the canonical "support cast" treatment, and an unknown network should read identically.

### Aliases

The Campaigns table today receives some network names that don't match the canonical labels exactly: `"Facebook"` (alias of Meta), `"Google Ads"` (alias of Google), `"Apple"` (alias of Apple Search Ads). The canonical helpers should normalize these BEFORE the lookup:

```ts
const NETWORK_ALIASES: Record<string, CanonicalNetwork> = {
  "Facebook": "Meta",
  "Google Ads": "Google",
  "Apple": "Apple Search Ads",
};

function normalize(network: string): CanonicalNetwork | undefined {
  if ((NETWORK_TOKENS as Record<string, unknown>)[network]) {
    return network as CanonicalNetwork;
  }
  return NETWORK_ALIASES[network];
}
```

Each public helper calls `normalize` first, then looks up in `NETWORK_TOKENS`, then falls through to the fallback.

This kills the silent-alias drift today where `"Google Ads"` and `"Google"` could render different colors depending on which call site.

### Existing consumers

- `src/components/dashboard/TrendChart.tsx` already imports `networkColor` and `networkLineDashed`. No change needed at the call site; the new file exports the same function names with the same signatures.
- `src/components/shell/PlatformFilter.tsx` already imports `networkColor`. Same — no call-site change.

The function signatures stay identical (`(network: string) => string`); only the returned string changes from a raw hex to a CSS variable.

---

## WS2 — Migrate CampaignsTable

### File touchpoints

```
src/components/campaigns/CampaignsTable.tsx     // delete networkStyle, import + call helpers
```

### Change

Today, lines 55 to 72 of `CampaignsTable.tsx` define a local `networkStyle(n: string): { bg: string; fg: string }` function with its own hardcoded map. Replace it.

Delete the entire `networkStyle` function. Replace its single call site (around line 292: `const ch = networkStyle(row.network);`) with two calls to the canonical helpers:

```ts
const bg = networkTint(row.network);
const fg = networkForeground(row.network);
```

Update the JSX a few lines below to use `bg` and `fg` instead of `ch.bg` and `ch.fg`. The pill rendering shape stays identical; only the values flow from a different source.

Add the imports at the top of the file:

```ts
import { networkTint, networkForeground } from "@/lib/dashboard/network-colors";
```

That's the entire migration. The Campaigns table's pills now read from the canonical map, AppLovin gets yellow, Meta becomes violet to match the dashboard, Google becomes mint to match the dashboard, Apple becomes gray to match the dashboard.

---

## WS3 — Regression guard tests

### File touchpoints

```
tests/unit/lib/dashboard/network-colors.test.ts     // new or extend
```

### Test cases

1. **Each canonical network maps to its specific color.** Five assertions: `expect(networkColor("Google")).toBe("var(--color-ua)")`, etc. for all five networks. Same for `networkTint` and `networkForeground`.

2. **No two canonical solid colors are equal.** This is the headline regression guard. Iterate over the cross product of canonical networks and assert `networkColor(a) !== networkColor(b)` for every distinct pair. Same assertion for `networkTint` and `networkForeground`. This is the test that would have caught the original AppLovin = Apple-gray bug AND would catch any future drift where a sixth network is added without a color.

3. **Aliases resolve correctly.** `networkColor("Facebook")` equals `networkColor("Meta")`. `networkColor("Google Ads")` equals `networkColor("Google")`. `networkColor("Apple")` equals `networkColor("Apple Search Ads")`.

4. **Unknown networks fall through.** `networkColor("MystèreNet")` equals the documented fallback (Apple's color, per the doc comment). Same for tint and foreground.

5. **`networkLineDashed` unchanged.** Returns true only for Apple Search Ads and its aliases. Verify the alias works: `networkLineDashed("Apple")` is also true.

If a unit test file for `network-colors.ts` does not exist today, create one. If it does, extend it; some of these assertions may already exist.

---

## Acceptance

Manual:

1. Load `/dashboard`. The TrendChart's five network lines render in mint / violet / coral / yellow / gray. AppLovin is yellow. Apple Search Ads is gray and dashed. No two lines share a color.
2. Load `/campaigns`. The Network column pills match the dashboard's TrendChart colors. A Meta row pill is violet (not mint). A Google row pill is mint (not yellow). A TikTok row pill is coral. An AppLovin row pill is yellow. An Apple row pill is gray.
3. Switch between TrendChart and CampaignsTable — same network reads the same color on both surfaces.
4. The PlatformFilter chip strip in the TopBar shows the five filter chips with their network colors. No visual change from today except AppLovin is now yellow instead of gray.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes, including the new distinctness assertions. Test count delta reported in PR description.
3. `npm run build` is clean.

## Commit shape

Suggested commits in order:

1. `WS1: canonical network color helpers in network-colors.ts (CSS variables, AppLovin, aliases)`
2. `WS2: CampaignsTable migrates to networkTint/networkForeground, deletes local networkStyle`
3. `WS3: regression-guard tests asserting all five canonical colors are distinct`

PR title: `Network color: single source of truth across dashboard surfaces`

PR description should include:
- A before / after table of the five network colors as they render on the TrendChart, CampaignsTable, and PlatformFilter.
- Confirmation that all five colors resolve to CSS variables from `globals.css` / yellowhead-brand, no raw hex.
- Test count delta.
- Note that this supersedes `prompts/2026-05-19-applovin-color.md` (the AppLovin fix lands as part of this PR, not as a separate one-liner).

## Follow-up not part of this PR

- **Smart Reports / Hermes color usage.** Reports today has its own color logic that does not read from `network-colors.ts`. Worth a future audit — if the deck's per-platform sections should match the dashboard's network colors, that's a deliberate alignment decision that needs its own PR.
- **`ChannelMix` per-slice color.** Today the donut uses a single mint accent and varies opacity per slice. A future improvement would have each slice take its network color so the donut reads more clearly. Not blocking; defer.
- **`--color-yellow` and `--tint-yellow-soft` audit.** If WS1 reveals the brand skill does NOT define yellow tokens, this PR creates the placeholder and a follow-up PR formalizes them in the brand skill. The brand skill is the eventual source of truth for any new token.
