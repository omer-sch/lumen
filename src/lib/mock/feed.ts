export type FeedSeverity = "highlight" | "spike" | "drop" | "info";

export type FeedItem = {
  id: string;
  severity: FeedSeverity;
  title: string;
  body: string;
  metric: string;
  delta: string;
  timeAgo: string;
  /** 14-day primary-metric trace shown in the drill-in chart. */
  chart: { date: string; value: number }[];
  /** Campaigns the AI tied to this signal — surfaced in the drill-in. */
  campaigns: { name: string; channel: "Meta" | "TikTok" | "Google" | "AppsFlyer"; delta: string }[];
  /** One-line action Lumen recommends. */
  action: string;
};

const series = (
  base: number,
  shape: "rising" | "falling" | "spike" | "flat-then-up",
): { date: string; value: number }[] => {
  const out: { date: string; value: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = `04-${String(17 + (13 - i)).padStart(2, "0")}`;
    let v = base;
    if (shape === "rising") v = base * (0.85 + (13 - i) * 0.025);
    if (shape === "falling") v = base * (1.15 - (13 - i) * 0.022);
    if (shape === "spike") v = base * (i > 4 ? 0.95 : 1.32 - i * 0.04);
    if (shape === "flat-then-up") v = base * (i > 5 ? 1.0 : 1.0 + (5 - i) * 0.08);
    v = +(v * (0.96 + Math.sin(i / 1.4) * 0.06)).toFixed(2);
    out.push({ date: day, value: v });
  }
  return out;
};

export const MOCK_FEED: FeedItem[] = [
  {
    id: "fi-001",
    severity: "highlight",
    title: "ROAS just crossed your weekly target",
    body: "Account-wide D7 ROAS hit 1.42x, up from 1.34x last week. Meta is doing the heavy lifting (+18% vs prior 7d).",
    metric: "ROAS D7",
    delta: "+5.7%",
    timeAgo: "12m ago",
    chart: series(1.34, "flat-then-up"),
    campaigns: [
      { name: "Meta_Promo_Q2",     channel: "Meta",   delta: "+18%" },
      { name: "Meta_Reels_Hook",   channel: "Meta",   delta: "+11%" },
      { name: "TT_SparkAds_Beauty", channel: "TikTok", delta: "+7%"  },
    ],
    action: "Hold spend steady — let the ROAS lift compound through the rest of the week before scaling.",
  },
  {
    id: "fi-002",
    severity: "spike",
    title: "TikTok installs jumped on the Hyper-Casual line",
    body: "Installs on the TikTok HC creative set are +34% vs prior 7d while CPI dropped 9%. Likely a Lookalike refresh kicking in.",
    metric: "Installs",
    delta: "+34%",
    timeAgo: "1h ago",
    chart: series(420, "rising"),
    campaigns: [
      { name: "TT_SparkAds_Beauty", channel: "TikTok", delta: "+41%" },
      { name: "TT_Creator_Skin",    channel: "TikTok", delta: "+27%" },
    ],
    action: "Promote the top 3 creatives to their own ad set and bump the budget by 25%.",
  },
  {
    id: "fi-003",
    severity: "drop",
    title: "CPI ticking up on Google App Campaigns",
    body: "Google AC CPI rose 11% over the last 5 days while installs stayed flat. Saturation on the existing creative set is the most likely cause.",
    metric: "CPI",
    delta: "+11%",
    timeAgo: "3h ago",
    chart: series(3.95, "rising"),
    campaigns: [
      { name: "G_UAC_Search",  channel: "Google", delta: "+14%" },
      { name: "G_UAC_Display", channel: "Google", delta: "+9%"  },
    ],
    action: "Refresh the UAC creative pack — current variants are at day 22, past the brand's healthy rotation point.",
  },
  {
    id: "fi-004",
    severity: "info",
    title: "New audience segment converting unusually well",
    body: "A Lookalike-3 segment based on recent payers is converting at 2.1× the campaign average. Consider promoting it to its own ad set.",
    metric: "Conversion rate",
    delta: "+114%",
    timeAgo: "5h ago",
    chart: series(0.046, "rising"),
    campaigns: [
      { name: "Meta_LookalikeUS", channel: "Meta", delta: "+121%" },
    ],
    action: "Carve the LAL-3-Payers segment into its own ad set with its own budget — early signal worth isolating.",
  },
];
