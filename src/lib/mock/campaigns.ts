import type { Channel } from "@/lib/mock/dashboard";

export type CampaignRow = {
  id: string;
  name: string;
  channel: Channel;
  spend: number;
  installs: number;
  cpi: number;
  roas: number;
  /** Percentage delta vs the equivalent previous window. */
  deltaSpend: number;
  deltaInstalls: number;
  deltaCpi: number;
  deltaRoas: number;
  /** Last-7-days primary metric (spend) — feeds the row sparkline. */
  sparkline: { date: string; value: number }[];
};

type CampaignSeed = {
  id: string;
  name: string;
  channel: Channel;
  /** Relative weight inside the channel — drives spend share. */
  weight: number;
  /** Per-campaign tilt vs channel baseline. 1.0 = on baseline. */
  cpiTilt: number;
  roasTilt: number;
};

const SEEDS: CampaignSeed[] = [
  // Meta
  { id: "meta-promo-q2",    name: "Meta_Promo_Q2",     channel: "Meta",      weight: 1.4, cpiTilt: 0.92, roasTilt: 1.18 },
  { id: "meta-reels-hook",  name: "Meta_Reels_Hook",   channel: "Meta",      weight: 1.2, cpiTilt: 0.96, roasTilt: 1.06 },
  { id: "meta-lookalike",   name: "Meta_LookalikeUS",  channel: "Meta",      weight: 1.0, cpiTilt: 1.04, roasTilt: 0.94 },
  { id: "meta-retarget",    name: "Meta_RetargetCart", channel: "Meta",      weight: 0.7, cpiTilt: 0.82, roasTilt: 1.42 },
  // TikTok
  { id: "tt-spark-beauty",  name: "TT_SparkAds_Beauty", channel: "TikTok",   weight: 1.1, cpiTilt: 1.02, roasTilt: 1.34 },
  { id: "tt-creator-skin",  name: "TT_Creator_Skin",   channel: "TikTok",    weight: 0.9, cpiTilt: 1.08, roasTilt: 0.92 },
  { id: "tt-broadacq-ios",  name: "TT_BroadAcq_iOS",   channel: "TikTok",    weight: 0.8, cpiTilt: 1.18, roasTilt: 0.78 },
  // Google
  { id: "g-uac-search",     name: "G_UAC_Search",      channel: "Google",    weight: 1.0, cpiTilt: 0.92, roasTilt: 1.10 },
  { id: "g-uac-display",    name: "G_UAC_Display",     channel: "Google",    weight: 0.8, cpiTilt: 1.05, roasTilt: 0.88 },
  { id: "g-brand-defense",  name: "G_Brand_Defense",   channel: "Google",    weight: 0.5, cpiTilt: 0.70, roasTilt: 1.62 },
  // AppsFlyer
  { id: "af-programmatic",  name: "AF_Programmatic",   channel: "AppsFlyer", weight: 0.6, cpiTilt: 1.10, roasTilt: 0.84 },
  { id: "af-oem-galaxy",    name: "AF_OEM_Galaxy",     channel: "AppsFlyer", weight: 0.4, cpiTilt: 1.22, roasTilt: 0.74 },
];

const CHANNEL_BASE: Record<
  Channel,
  { spendShare: number; cpi: number; roas: number }
> = {
  Meta:      { spendShare: 0.435, cpi: 4.10, roas: 1.55 },
  TikTok:    { spendShare: 0.275, cpi: 4.85, roas: 1.18 },
  Google:    { spendShare: 0.204, cpi: 3.95, roas: 1.40 },
  AppsFlyer: { spendShare: 0.086, cpi: 5.30, roas: 0.92 },
};

const dayCount = (from: Date, to: Date) =>
  Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

const seeded = (n: number) => {
  let s = n >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const channelTotalWeight = (channel: Channel) =>
  SEEDS.filter((s) => s.channel === channel).reduce((a, s) => a + s.weight, 0);

const sparkSeries = (
  to: Date,
  baseValue: number,
  rng: () => number,
): { date: string; value: number }[] => {
  const out: { date: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(to);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.getUTCDay();
    const weekend = day === 0 || day === 6 ? 0.84 : 1;
    const wave = 1 + Math.sin(i / 1.7) * 0.15;
    const noise = 0.92 + rng() * 0.16;
    out.push({
      date: d.toISOString().slice(5, 10),
      value: +(baseValue * weekend * wave * noise).toFixed(2),
    });
  }
  return out;
};

export type CampaignFilters = {
  from: Date;
  to: Date;
  client?: string;
  channel?: Channel | "all";
};

/**
 * Returns a per-campaign rollup for the active window. Mirrors what the
 * real query layer will return — same shape, same fields, same delta
 * semantics ("vs the prior equivalent window"). Swap the body for a SQL
 * call later; consumers don't need to change.
 */
export function getCampaigns(filters: CampaignFilters): CampaignRow[] {
  const days = dayCount(filters.from, filters.to);
  const totalSpendBase = 9500 * days;
  const channelFilter = filters.channel ?? "all";

  const rng = seeded(0xc0ffee + days);

  const rows: CampaignRow[] = SEEDS.filter(
    (s) => channelFilter === "all" || s.channel === channelFilter,
  ).map((s) => {
    const channelBase = CHANNEL_BASE[s.channel];
    const totalWeight = channelTotalWeight(s.channel);
    const spend = +(
      totalSpendBase *
      channelBase.spendShare *
      (s.weight / totalWeight) *
      (0.94 + rng() * 0.12)
    ).toFixed(2);
    const cpi = +(channelBase.cpi * s.cpiTilt * (0.94 + rng() * 0.12)).toFixed(2);
    const installs = Math.max(1, Math.round(spend / cpi));
    const roas = +(channelBase.roas * s.roasTilt * (0.94 + rng() * 0.12)).toFixed(2);

    // Deterministic but varied deltas per campaign.
    const seedDelta = (k: number) => +(((rng() - 0.5) * k * 100) / 5).toFixed(1);

    return {
      id: s.id,
      name: s.name,
      channel: s.channel,
      spend,
      installs,
      cpi,
      roas,
      deltaSpend:    seedDelta(2.4),
      deltaInstalls: seedDelta(2.6),
      deltaCpi:      seedDelta(1.2),
      deltaRoas:     seedDelta(1.6),
      sparkline: sparkSeries(filters.to, spend / days, rng),
    };
  });

  return rows;
}
