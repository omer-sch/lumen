export type NotificationType =
  | "anomaly"        // unexpected drop / spike — coral
  | "opportunity"    // scale, promote, expand — yellow
  | "target_hit"     // milestone reached — mint
  | "recommendation" // Lumen's nudge — mint
  | "risk"           // creative fatigue, pacing — coral
  | "system";        // sync done, data refresh — neutral

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeAgo: string;
  metricChip?: string;
  team?: "UA" | "Organic" | "Creative" | "CSM";
  actionLabel?: string;
  actionHref?: string;
};

/**
 * Demo notifications — fresh items first. Mix of types to exercise every
 * surface state (anomalies, opportunities, milestones, risks, system).
 * The freshest 5 are unread by default in the store.
 */
export const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "n-001",
    type: "opportunity",
    title: "TikTok HC creative set is on a tear",
    body: "Installs +34% / CPI -9% over the last 7 days. Lumen suggests promoting the top 3 creatives to their own ad set and bumping the budget by 25%.",
    timeAgo: "12m ago",
    metricChip: "Installs +34%",
    team: "UA",
    actionLabel: "Open in AI Feed",
    actionHref: "/feed",
  },
  {
    id: "n-002",
    type: "target_hit",
    title: "Weekly ROAS target crossed",
    body: "D7 ROAS hit 1.42x, above your 1.30x weekly target. Meta is the lead contributor (+18% WoW).",
    timeAgo: "38m ago",
    metricChip: "ROAS 1.42x",
    team: "UA",
    actionLabel: "View on dashboard",
    actionHref: "/dashboard",
  },
  {
    id: "n-003",
    type: "anomaly",
    title: "AppsFlyer ROAS dropped sharply",
    body: "AF Programmatic ROAS fell to 0.74x today (-22% vs 7d avg). Worth pausing pending an attribution check — Lumen flagged a possible postback delay.",
    timeAgo: "1h ago",
    metricChip: "ROAS -22%",
    team: "UA",
    actionLabel: "Investigate",
    actionHref: "/feed",
  },
  {
    id: "n-004",
    type: "risk",
    title: "Creative fatigue detected on Meta_Reels_Hook",
    body: "CTR has been declining for 9 days. Frequency is now 5.8 — past the brand's healthy ceiling. Consider rotating in fresh hook variants.",
    timeAgo: "2h ago",
    metricChip: "CTR -27%",
    team: "Creative",
    actionLabel: "Open creative",
  },
  {
    id: "n-005",
    type: "recommendation",
    title: "New high-converting Lookalike segment",
    body: "A Lookalike-3 built on recent payers is converting at 2.1× campaign average. Promoting it to its own ad set could unlock more efficient spend.",
    timeAgo: "4h ago",
    metricChip: "CVR 2.1×",
    team: "UA",
    actionLabel: "Apply suggestion",
  },
  {
    id: "n-006",
    type: "anomaly",
    title: "Google UAC CPI rising for 5 days",
    body: "CPI on Google App Campaigns has climbed 11% while installs stayed flat. Lumen's read: creative saturation on the existing pack.",
    timeAgo: "6h ago",
    metricChip: "CPI +11%",
    team: "UA",
    actionLabel: "Open in AI Feed",
    actionHref: "/feed",
  },
  {
    id: "n-007",
    type: "opportunity",
    title: "iOS outperforming Android on payback",
    body: "iOS D7 ROAS is 1.62x vs Android 1.18x over the last 14 days. A platform-aware budget reallocation is up for review.",
    timeAgo: "8h ago",
    metricChip: "iOS +37%",
    team: "UA",
  },
  {
    id: "n-008",
    type: "target_hit",
    title: "Spend pacing on track for the month",
    body: "$284k of $300k monthly budget deployed at day 27. Pacing within ±2% of plan across all four channels.",
    timeAgo: "yesterday",
    metricChip: "Pacing 95%",
    team: "UA",
  },
  {
    id: "n-009",
    type: "system",
    title: "Daily data sync complete",
    body: "Rivery finished pulling Meta, TikTok, Google, AppsFlyer, AppTweak, and Search Console for 2026-04-30. All KPIs are fresh.",
    timeAgo: "yesterday",
  },
  {
    id: "n-010",
    type: "recommendation",
    title: "Weekend pattern: 18% softer ROAS",
    body: "ROAS dips an average 18% on Sat–Sun across all UA channels. Consider a daypart adjustment or weekend creative pack.",
    timeAgo: "2 days ago",
    metricChip: "ROAS -18%",
    team: "UA",
    actionLabel: "View pattern",
  },
  {
    id: "n-011",
    type: "anomaly",
    title: "Meta_RetargetCart spend doubled",
    body: "Daily spend jumped from $410 to $912. Bid-cap was raised on Apr 27 — verify it's intentional before today's spend.",
    timeAgo: "3 days ago",
    metricChip: "Spend +122%",
    team: "UA",
    actionLabel: "Open campaign",
  },
  {
    id: "n-012",
    type: "opportunity",
    title: "ASO push on Apple Search rising",
    body: "AppTweak signal: keyword 'water tracker' search volume +28% WoW. Coordinate with Organic to time a paid search push.",
    timeAgo: "3 days ago",
    metricChip: "Volume +28%",
    team: "Organic",
  },
  {
    id: "n-013",
    type: "system",
    title: "Lumen learned a new pattern",
    body: "Added to the brain: 'TikTok creators with 3+ hooks in the first 1.5s outperform single-hook formats by 41% on D7 ROAS.'",
    timeAgo: "4 days ago",
    actionLabel: "View knowledge",
    actionHref: "/knowledge",
  },
  {
    id: "n-014",
    type: "risk",
    title: "Frequency cap nearing limit on prospecting",
    body: "Meta prospecting frequency at 4.6 (cap 5.0). Audience refresh recommended within 48h to prevent CTR decay.",
    timeAgo: "5 days ago",
    metricChip: "Freq 4.6",
    team: "UA",
  },
  {
    id: "n-015",
    type: "target_hit",
    title: "First $1M revenue month",
    body: "April crossed $1.04M attributed revenue across UA — a first for the account. Strong contribution from TikTok (+62% YoY).",
    timeAgo: "1 week ago",
    metricChip: "Rev $1.04M",
    team: "UA",
  },
];

/** IDs that start unread — the freshest 5. */
export const DEFAULT_UNREAD_IDS = MOCK_NOTIFICATIONS.slice(0, 5).map((n) => n.id);
