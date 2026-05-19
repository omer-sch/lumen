# Give AppLovin its own color (2026-05-19)

**SUPERSEDED — DO NOT SHIP.** This one-line fix is superseded by `prompts/2026-05-19-network-color-design-system-consolidation.md`, which fixes AppLovin AS PART OF a broader cleanup that collapses the two competing network color maps into one. Kept on disk for traceability.

---

Owner: Omer. Single PR on a new branch off `main` named `applovin-color`. One-line change plus a test.

## The bug

On the dashboard's TrendChart, NetworkBreakdown, ChannelMix, and anywhere else that reads from `src/lib/dashboard/network-colors.ts`, AppLovin and Apple Search Ads render in **the same gray**. AppLovin isn't in the `NETWORK_COLORS` map, so `networkColor("AppLovin")` falls through to `FALLBACK = "#9CA9C5"`, which is literally the same hex as the Apple Search Ads entry.

Background: AppLovin was added to the data layer in the `globalcomix-full-implementation` PR (2026-05-17) via WS2 (multi-source spend UNION). The presentation layer's color map never got the matching update.

## The fix

In `src/lib/dashboard/network-colors.ts`, add `AppLovin` to `NETWORK_COLORS` with the yellowHEAD brand yellow.

Read `.claude/skills/yellowhead-brand/SKILL.md` to confirm the exact yellow hex the brand defines (likely something like `#FFCC00` or `#FACA0B`, but use whatever the skill canonicalizes — do not pick a hex from memory). The existing entries in this file use raw hex strings, so match that pattern; don't switch to CSS variables in this PR.

After the edit, the map has five entries:

```ts
export const NETWORK_COLORS = {
  Google: "#54F0A3",
  Meta: "#926FDE",
  TikTok: "#F88673",
  "Apple Search Ads": "#9CA9C5",
  AppLovin: "<yellow hex from yellowhead-brand>",
} as const;
```

## Out of scope

- Do NOT touch `CampaignsTable.tsx`'s `networkStyle` function. It maintains its own (inconsistent) color scheme — that's a separate cleanup that deserves its own PR.
- Do NOT switch the file from raw hex to CSS custom properties. Same separate-cleanup reasoning.
- Do NOT change `networkLineDashed` to give AppLovin a line treatment. Solid line is fine.
- Do NOT change the `FALLBACK` value. Keep it equal to the Apple Search Ads gray so unknown networks still read as "support cast" rather than something attention-grabbing.

## Tests

If `tests/unit/lib/dashboard/network-colors.test.ts` exists, add a case asserting `networkColor("AppLovin")` returns the new yellow and is NOT equal to `networkColor("Apple Search Ads")`. If the test file does not exist, create it with at minimum:

1. Each of the five canonical networks returns its specific color.
2. None of the five canonical colors equal each other.
3. An unknown network name returns `FALLBACK`.

The "none of the five equal each other" assertion is the regression guard — it would have caught this exact bug.

## Acceptance

Manual: load `/dashboard` with AppLovin spend in the active window. The TrendChart's AppLovin line is yellow. The NetworkBreakdown's AppLovin row pill is yellow. Apple Search Ads stays gray.

Automated:

1. `npm run typecheck` is clean.
2. `npm test` passes, including the new color-distinctness assertion.
3. `npm run build` is clean.

## Commit shape

Single commit. Title: `Give AppLovin a distinct color on the dashboard`. Body notes that AppLovin was previously rendering in the fallback gray, identical to Apple Search Ads, because the network-colors map only had four entries.

## Follow-up not part of this PR

The `CampaignsTable.tsx` `networkStyle` function defines a totally different color scheme for the same five networks (Google = yellow there, Meta = mint there, etc.) — inconsistent with the dashboard's color language. Worth a dedicated PR that collapses both call sites onto `network-colors.ts` as the single source of truth. Not blocking; defer.
