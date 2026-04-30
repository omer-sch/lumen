export type FeedSeverity = "highlight" | "spike" | "drop" | "info";

export type FeedItem = {
  id: string;
  severity: FeedSeverity;
  title: string;
  body: string;
  metric: string;
  delta: string;
  timeAgo: string;
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
  },
  {
    id: "fi-002",
    severity: "spike",
    title: "TikTok installs jumped on the Hyper-Casual line",
    body: "Installs on the TikTok HC creative set are +34% vs prior 7d while CPI dropped 9%. Likely a Lookalike refresh kicking in. Worth scaling budget.",
    metric: "Installs",
    delta: "+34%",
    timeAgo: "1h ago",
  },
  {
    id: "fi-003",
    severity: "drop",
    title: "CPI ticking up on Google App Campaigns",
    body: "Google AC CPI rose 11% over the last 5 days while installs stayed flat. Saturation on the existing creative set is the most likely cause.",
    metric: "CPI",
    delta: "+11%",
    timeAgo: "3h ago",
  },
  {
    id: "fi-004",
    severity: "info",
    title: "New audience segment converting unusually well",
    body: "A Lookalike-3 segment based on recent payers is converting at 2.1× the campaign average. Consider promoting it to its own ad set.",
    metric: "Conversion rate",
    delta: "+114%",
    timeAgo: "5h ago",
  },
];
