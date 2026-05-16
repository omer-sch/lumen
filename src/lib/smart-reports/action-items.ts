import type { ReadyData } from "@/lib/analyst/types";

// Action-items module. Parses free-form analyst notes the user pastes
// in the manual builder / Hermes paste-email modal into structured
// items the prose-writer can weave into campaign-breakdown sections
// as `<> AI:` callouts.
//
// Input shape
// -----------
// One free-form string, one item per line. Blank lines and bullet
// markers ("-", "*", "•") are stripped. Examples:
//
//   We paused the WW Sub Seasonal Invincible campaign last week.
//   Added fresh creatives to the Archetype ad groups on TikTok.
//   - Excluded low-performing geos on the Meta WW SubStart Evergreen
//
// Classification
// --------------
// Each line is matched against the campaigns ReadyData carries and
// the network / family / geo keywords those campaigns expose. A
// match attaches the item to one family group; an unclassified line
// becomes a generic "ungrouped" item that the prose-writer can
// surface in a catch-all paragraph.
//
// We keep classification simple: case-insensitive substring match
// against (network, family, geo, campaign_name). The downside is
// false positives (a note mentioning "WW" attaches to every WW
// family). The upside is robustness -- a single keyword change in
// the warehouse won't break classification. Phase 4 can tighten this
// with a small LLM classification step if false positives become a
// real problem.

export type ActionItem = {
  /** Original text of the line, normalised (leading bullet stripped,
   *  trailing whitespace trimmed). The prose-writer is instructed to
   *  weave this verbatim into the matching family's paragraph as a
   *  `<> AI:` callout. */
  text: string;
  /** Family the item attaches to, or null when unclassified. Matched
   *  against EnrichedCampaignRow.family in ReadyData.campaigns. */
  family: string | null;
  /** Networks the item references (zero, one, or many). Used by the
   *  prose-writer to disambiguate when multiple families across
   *  different networks share the same name. */
  networks: string[];
};

const BULLET_PREFIX_RE = /^(?:[-*•]\s+|^\d+[.)]\s+)/;

/**
 * Split a free-form notes string into one entry per line, with
 * bullet markers stripped and empty lines removed.
 */
export function splitNotesIntoLines(notes: string): string[] {
  if (typeof notes !== "string" || notes.length === 0) return [];
  return notes
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET_PREFIX_RE, "").trim())
    .filter((l) => l.length > 0);
}

/**
 * Classify a single line against the campaigns + networks in
 * ReadyData. Returns the best match (family + networks) or null
 * fields for an unclassified line.
 */
export function classifyActionLine(
  line: string,
  ready: ReadyData,
): { family: string | null; networks: string[] } {
  const lower = line.toLowerCase();

  // Collect every family + network + geo + campaign_name token that
  // appears in the line. Multi-token matches are stronger evidence;
  // we pick the family with the most matches.
  const familyScore = new Map<string, number>();
  const networkHit = new Set<string>();

  for (const c of ready.campaigns) {
    let score = 0;
    if (c.family && lower.includes(c.family.toLowerCase())) score += 3;
    if (c.geo && lower.includes(c.geo.toLowerCase())) score += 1;
    if (c.network && lower.includes(c.network.toLowerCase())) {
      score += 1;
      networkHit.add(c.network);
    }
    if (c.campaign_name && lower.includes(c.campaign_name.toLowerCase())) {
      score += 4;
    }
    if (score > 0) {
      familyScore.set(c.family, (familyScore.get(c.family) ?? 0) + score);
      // When ANY signal hits a campaign, the campaign's network is
      // relevant context for the prose-writer -- not just when the
      // line literally names the network. This lets a note about
      // "Sub Evergreen" surface "Meta" downstream so the writer
      // disambiguates between same-family campaigns on different
      // networks.
      if (c.network) networkHit.add(c.network);
    }
  }

  // Also scan the network labels independently -- the user may
  // mention "TikTok" without naming a specific family.
  for (const n of ready.networks) {
    if (lower.includes(n.network.toLowerCase())) networkHit.add(n.network);
  }

  // Pick the highest-scoring family, breaking ties alphabetically so
  // the output is stable across runs.
  let bestFamily: string | null = null;
  let bestScore = 0;
  for (const [family, score] of familyScore) {
    if (
      score > bestScore ||
      (score === bestScore && bestFamily != null && family < bestFamily)
    ) {
      bestFamily = family;
      bestScore = score;
    }
  }

  return {
    family: bestFamily,
    networks: Array.from(networkHit).sort(),
  };
}

/**
 * Parse a notes string into structured ActionItems. Returns [] for
 * empty / null input. Never throws.
 */
export function parseActionItems(
  notes: string | null | undefined,
  ready: ReadyData,
): ActionItem[] {
  if (!notes) return [];
  const lines = splitNotesIntoLines(notes);
  return lines.map((line) => {
    const { family, networks } = classifyActionLine(line, ready);
    return { text: line, family, networks };
  });
}

/**
 * Group classified action items by family for the prose-writer.
 * Unclassified items land under the `null` family. Sorted: classified
 * groups first (alphabetical), unclassified last.
 */
export function groupActionItemsByFamily(
  items: ActionItem[],
): { family: string | null; items: ActionItem[] }[] {
  const byFamily = new Map<string | null, ActionItem[]>();
  for (const it of items) {
    const arr = byFamily.get(it.family) ?? [];
    arr.push(it);
    byFamily.set(it.family, arr);
  }
  const out: { family: string | null; items: ActionItem[] }[] = [];
  for (const [family, items] of byFamily) {
    if (family != null) out.push({ family, items });
  }
  out.sort((a, b) => (a.family ?? "").localeCompare(b.family ?? ""));
  const unclassified = byFamily.get(null);
  if (unclassified) out.push({ family: null, items: unclassified });
  return out;
}

/**
 * Render the structured items as a context paragraph the
 * campaign-breakdown prose-writer can read alongside the campaigns
 * data. The format is a simple bulleted list grouped by family so the
 * LLM can pattern-match without parsing JSON.
 */
export function actionItemsAsContextString(items: ActionItem[]): string {
  if (items.length === 0) return "";
  const groups = groupActionItemsByFamily(items);
  const blocks: string[] = [];
  for (const g of groups) {
    const label = g.family ?? "Other / Unclassified";
    blocks.push(`Family: ${label}`);
    for (const it of g.items) {
      blocks.push(`- ${it.text}`);
    }
    blocks.push("");
  }
  return blocks.join("\n").trimEnd();
}
