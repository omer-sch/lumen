import type { Channel, KpiId } from "@/types/dashboard";

/**
 * The AI Dashboard tile pool. Each tile is a small "the AI noticed this"
 * card: a metric, a why, and either a kpi value or a tiny series. The pool
 * is hand-curated for v1 — when the real Claude integration lands, the
 * single shape this file exports stays the same and the tiles come from
 * the LLM instead of this file.
 */

export type AITileKind = "kpi" | "spark" | "bars" | "anomaly";

export type AITileBase = {
  id: string;
  why: string;
  /** "AI Mode" tiles can pull any team accent; UA-only for now. */
  accent: "ua" | "yellow" | "creative" | "organic";
  /** Optional CTA — text + relative href (router.push compatible). */
  cta?: { label: string; href: string };
  /** Optional weight — heavier tiles surface more often when re-rolled. */
  weight?: number;
};

export type AIKpiTile = AITileBase & {
  kind: "kpi";
  metric: KpiId;
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
};

export type AISparkTile = AITileBase & {
  kind: "spark";
  title: string;
  metricLabel: string;
  formatter: "money" | "count" | "ratio";
  data: { date: string; value: number }[];
};

export type AIBarsTile = AITileBase & {
  kind: "bars";
  title: string;
  metricLabel: string;
  formatter: "money" | "count" | "ratio";
  data: { label: string; value: number }[];
  highlightLabel?: string;
};

export type AIAnomalyTile = AITileBase & {
  kind: "anomaly";
  title: string;
  channel?: Channel;
  body: string;
  delta: string;
};

export type AITile = AIKpiTile | AISparkTile | AIBarsTile | AIAnomalyTile;

/** Curated pool — re-shuffles each AI Mode entry. */
export const AI_TILE_POOL: AITile[] = [
  {
    id: "ai-tt-spike",
    kind: "anomaly",
    accent: "ua",
    why: "TikTok HC creatives jumped well outside their 7-day band — usually means a Lookalike refresh. Worth scaling.",
    title: "TikTok HC creative set is on a tear",
    channel: "TikTok",
    body: "Installs +34% / CPI -9% over the last 7 days, against a fairly stable channel baseline.",
    delta: "Installs +34%",
    cta: { label: "Open in Feed", href: "/feed" },
    weight: 3,
  },
  {
    id: "ai-roas-target",
    kind: "kpi",
    accent: "yellow",
    why: "ROAS crossed your weekly target. Lumen surfaces hero KPIs when they break a known threshold.",
    metric: "roas",
    label: "UA ROAS (D7)",
    value: "1.42x",
    delta: 5.7,
    deltaLabel: "vs target 1.30x",
    weight: 3,
  },
  {
    id: "ai-google-cpi",
    kind: "anomaly",
    accent: "creative",
    why: "Five days of CPI drift on Google UAC, while installs stayed flat — classic creative saturation pattern.",
    title: "Google UAC CPI rising for 5 days",
    channel: "Google",
    body: "CPI is up 11% week-over-week. Lumen flagged this once it cleared the 5-day persistence threshold.",
    delta: "CPI +11%",
    cta: { label: "Open in Feed", href: "/feed" },
    weight: 2,
  },
  {
    id: "ai-channel-mix",
    kind: "bars",
    accent: "ua",
    why: "Mix shifted enough that one channel changed rank. Lumen highlights the leader so you can act on it.",
    title: "Channel mix this week",
    metricLabel: "Spend share",
    formatter: "money",
    data: [
      { label: "Meta",      value: 124000 },
      { label: "TikTok",    value: 78400 },
      { label: "Google",    value: 58200 },
      { label: "AppsFlyer", value: 24320 },
    ],
    highlightLabel: "Meta",
    weight: 2,
  },
  {
    id: "ai-spend-curve",
    kind: "spark",
    accent: "ua",
    why: "Spend curve broke its 30-day trend on day 27. Could be a budget pacing thing — worth a glance.",
    title: "Spend trajectory",
    metricLabel: "Spend",
    formatter: "money",
    data: Array.from({ length: 14 }, (_, i) => ({
      date: `04-${String(17 + i).padStart(2, "0")}`,
      value: 8800 + Math.round(Math.sin(i / 2) * 900) + i * 90,
    })),
    weight: 2,
  },
  {
    id: "ai-ios-android",
    kind: "anomaly",
    accent: "ua",
    why: "iOS payback is dragging Android. Big enough delta that a platform-aware budget split may be in order.",
    title: "iOS outperforming Android on D7 ROAS",
    body: "iOS at 1.62x vs Android at 1.18x over the last 14 days, across all UA channels.",
    delta: "iOS +37%",
    weight: 2,
  },
  {
    id: "ai-frequency-cap",
    kind: "anomaly",
    accent: "creative",
    why: "Prospecting frequency is approaching the brand's healthy ceiling — fresh audiences usually fix it.",
    title: "Meta prospecting frequency at 4.6 / 5.0",
    channel: "Meta",
    body: "CTR has been declining for nine days. Audience refresh recommended within 48 hours.",
    delta: "Freq 4.6",
    weight: 1,
  },
  {
    id: "ai-weekend-pattern",
    kind: "spark",
    accent: "ua",
    why: "Saturday + Sunday consistently underperform mid-week. A weekend creative pack could close the gap.",
    title: "Weekend ROAS dip",
    metricLabel: "ROAS",
    formatter: "ratio",
    data: Array.from({ length: 14 }, (_, i) => ({
      date: `04-${String(17 + i).padStart(2, "0")}`,
      value: i % 7 === 5 || i % 7 === 6 ? 1.18 : 1.42,
    })),
    weight: 1,
  },
  {
    id: "ai-creative-fatigue",
    kind: "anomaly",
    accent: "creative",
    why: "Creative fatigue follows a pretty predictable curve. Meta_Reels_Hook is on day 9 of decline — past the brand's usual rotation point.",
    title: "Creative fatigue on Meta_Reels_Hook",
    body: "CTR has been declining for 9 days. Frequency is now 5.8.",
    delta: "CTR -27%",
    weight: 1,
  },
];

/**
 * Deterministic but rotating AI tile selection. Each entry into AI Mode
 * picks 6 tiles, weighted by tile.weight, and orders them so the highest
 * weight surfaces first. The seed is the entry timestamp rounded to the
 * minute — so refreshing within a minute keeps the same view, navigating
 * away and back rolls a new one.
 */
export function rollAITiles(seed = Math.floor(Date.now() / 60_000), count = 6): AITile[] {
  let s = seed >>> 0;
  const lcg = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  // Weighted shuffle.
  const expanded: AITile[] = AI_TILE_POOL.flatMap((t) =>
    Array(t.weight ?? 1).fill(t),
  );
  const seen = new Set<string>();
  const out: AITile[] = [];
  while (out.length < count && seen.size < AI_TILE_POOL.length) {
    const pick = expanded[Math.floor(lcg() * expanded.length)];
    if (!seen.has(pick.id)) {
      seen.add(pick.id);
      out.push(pick);
    }
  }
  return out;
}
