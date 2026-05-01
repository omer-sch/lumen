import type { Channel } from "./types";

const CHANNELS: Channel[] = ["Meta", "TikTok", "Google", "AppsFlyer"];

const CAMPAIGNS: Record<Channel, string[]> = {
  Meta:      ["Meta_Promo_Q2", "Meta_Reels_Hook", "Meta_LookalikeUS", "Meta_RetargetCart"],
  TikTok:    ["TT_SparkAds_Beauty", "TT_Creator_Skin", "TT_BroadAcq_iOS"],
  Google:    ["G_UAC_Search", "G_UAC_Display", "G_Brand_Defense"],
  AppsFlyer: ["AF_Programmatic", "AF_OEM_Galaxy"],
};

const CHANNEL_BASE: Record<Channel, { dailySpend: number; cpi: number; roas: number }> = {
  Meta:      { dailySpend: 4100, cpi: 4.10, roas: 1.55 },
  TikTok:    { dailySpend: 2600, cpi: 4.85, roas: 1.18 },
  Google:    { dailySpend: 1900, cpi: 3.95, roas: 1.40 },
  AppsFlyer: { dailySpend: 800,  cpi: 5.30, roas: 0.92 },
};

export type AskRow = {
  date: string;
  channel: Channel;
  campaign: string;
  spend: number;
  installs: number;
  revenue: number;
  cpi: number;
  roas: number;
};

const seeded = (n: number) => {
  let s = n >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const TODAY = "2026-04-30";

const buildRows = (): AskRow[] => {
  const today = new Date(`${TODAY}T00:00:00Z`);
  const out: AskRow[] = [];
  const rng = seeded(0xa5a5a5);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const day = d.getUTCDay();
    const weekend = day === 0 || day === 6 ? 0.82 : 1;
    const drift = 1 + (90 - i) * 0.0035;
    const wave = 1 + Math.sin(i / 5) * 0.12;
    for (const ch of CHANNELS) {
      const base = CHANNEL_BASE[ch];
      for (const camp of CAMPAIGNS[ch]) {
        const noise = 0.85 + rng() * 0.3;
        const spend = +(
          (base.dailySpend / CAMPAIGNS[ch].length) *
          weekend *
          drift *
          wave *
          noise
        ).toFixed(2);
        const cpi = +(base.cpi * (0.9 + rng() * 0.2)).toFixed(2);
        const installs = Math.max(1, Math.round(spend / cpi));
        const roas = +(base.roas * (0.85 + rng() * 0.3)).toFixed(2);
        const revenue = +(spend * roas).toFixed(2);
        out.push({
          date: dateStr,
          channel: ch,
          campaign: camp,
          spend,
          installs,
          revenue,
          cpi,
          roas,
        });
      }
    }
  }
  return out;
};

const ROWS = buildRows();

export function allRows(): AskRow[] {
  return ROWS;
}

export const ASK_TODAY = TODAY;
