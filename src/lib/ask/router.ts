import { allRows, ASK_TODAY, type AskRow } from "./data";
import type { Answer, Channel, Formatter, Metric } from "./types";
import type { PinnedConfig } from "@/lib/pins/types";

const METRIC_PATTERNS: { metric: Metric; pat: RegExp }[] = [
  { metric: "roas",     pat: /\broas\b/i },
  { metric: "cpi",      pat: /\bcpi\b|cost\s*per\s*install/i },
  { metric: "installs", pat: /\binstalls?\b|conversions?/i },
  { metric: "revenue",  pat: /\brevenue|earnings\b/i },
  { metric: "spend",    pat: /\bspend(?:ing)?\b|\bspent\b|\bcost\b|\bbudget\b/i },
];

const CHANNEL_PATTERNS: { ch: Channel; pat: RegExp }[] = [
  { ch: "Meta",      pat: /\bmeta\b|\bfacebook\b|\binstagram\b/i },
  { ch: "TikTok",    pat: /\btiktok\b|\btt\b/i },
  { ch: "Google",    pat: /\bgoogle\b|\buac\b/i },
  { ch: "AppsFlyer", pat: /\bappsflyer\b/i },
];

const detectMetric = (q: string): Metric | undefined =>
  METRIC_PATTERNS.find((m) => m.pat.test(q))?.metric;
const detectChannel = (q: string): Channel | undefined =>
  CHANNEL_PATTERNS.find((c) => c.pat.test(q))?.ch;

const detectN = (q: string): number => {
  const m = q.match(/\btop\s+(\d+)\b/i);
  return m ? Math.min(20, Math.max(3, Number(m[1]))) : 5;
};

const daysAgo = (date: string): number => {
  const t = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(`${ASK_TODAY}T00:00:00Z`).getTime();
  return Math.round((today - t) / 86_400_000);
};

const inWindow = (rows: AskRow[], from: number, to: number) =>
  rows.filter((r) => {
    const d = daysAgo(r.date);
    return d >= from && d < to;
  });

const sumMetric = (rows: AskRow[], metric: Metric): number => {
  if (metric === "spend" || metric === "installs" || metric === "revenue") {
    return rows.reduce((acc, r) => acc + r[metric], 0);
  }
  if (metric === "cpi") {
    const spend = rows.reduce((a, r) => a + r.spend, 0);
    const installs = rows.reduce((a, r) => a + r.installs, 0);
    return installs > 0 ? spend / installs : 0;
  }
  const spend = rows.reduce((a, r) => a + r.spend, 0);
  const revenue = rows.reduce((a, r) => a + r.revenue, 0);
  return spend > 0 ? revenue / spend : 0;
};

export type AskFilters = {
  windowDays: number;
};

export function inferWindow(filters: AskFilters | undefined, q: string): number {
  const m = q.match(/\b(?:last|past)\s+(\d+)\s+days?\b/i);
  if (m) return Math.min(90, Math.max(1, Number(m[1])));
  if (/\b(this|last|past)\s+week\b/i.test(q)) return 7;
  if (/\b(this|last|past)\s+month\b/i.test(q)) return 30;
  if (/\b(this|last|past)\s+quarter\b/i.test(q)) return 90;
  return filters?.windowDays ?? 30;
}

const formatterFor = (m: Metric): Formatter => {
  if (m === "roas") return "ratio";
  if (m === "cpi" || m === "spend" || m === "revenue") return "money";
  return "count";
};

const fmt = {
  money: (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`),
  count: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString()),
  ratio: (n: number) => `${n.toFixed(2)}x`,
  percent: (n: number) => `${n.toFixed(1)}%`,
} as const;

const labelMetric: Record<Metric, string> = {
  spend: "Spend", installs: "Installs", cpi: "CPI", roas: "ROAS", revenue: "Revenue",
};

const formatValue = (m: Metric, n: number) => fmt[formatterFor(m)](n);

// ---- Answer builders -------------------------------------------------------

function kpiAnswer(question: string, metric: Metric, windowDays: number): Answer {
  const rows = allRows();
  const recent = inWindow(rows, 0, windowDays);
  const previous = inWindow(rows, windowDays, windowDays * 2);
  const cur = sumMetric(recent, metric);
  const prev = sumMetric(previous, metric);
  const delta = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
  const direction: "higher-better" | "lower-better" =
    metric === "cpi" ? "lower-better" : "higher-better";
  const periodLabel =
    windowDays === 7 ? "week-over-week" : `vs prev ${windowDays}d`;
  const flat = Math.abs(delta) < 0.5;
  const arrow = delta >= 0 ? "up" : "down";
  const movement = flat
    ? `essentially flat ${periodLabel}`
    : `${arrow} ${Math.abs(delta).toFixed(1)}% ${periodLabel}`;

  const config: PinnedConfig = {
    kind: "kpi",
    metric: labelMetric[metric],
    value: formatValue(metric, cur),
    delta,
    deltaLabel: periodLabel,
    direction,
  };

  return {
    question,
    narration: `UA ${labelMetric[metric]} is ${formatValue(metric, cur)} — ${movement}.`,
    rationale: `A single number reads fastest for "${labelMetric[metric]}-only" questions over a fixed window.`,
    alternative: {
      kind: "line",
      reason: `Want to see how ${labelMetric[metric]} moved across the window?`,
    },
    config,
  };
}

function lineAnswer(question: string, metric: Metric, windowDays: number, channel?: Channel): Answer {
  const rows = allRows();
  const scoped = channel ? rows.filter((r) => r.channel === channel) : rows;
  const recent = inWindow(scoped, 0, windowDays);

  const byDay = new Map<string, AskRow[]>();
  for (const r of recent) {
    const list = byDay.get(r.date);
    if (list) list.push(r);
    else byDay.set(r.date, [r]);
  }
  const days = [...byDay.keys()].sort();
  const data = days.map((d) => ({
    date: d.slice(5),
    value: +sumMetric(byDay.get(d)!, metric).toFixed(2),
  }));

  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  const flat = Math.abs(change) < 0.5;
  const arrow = change >= 0 ? "up" : "down";
  const subject = [channel, labelMetric[metric]].filter(Boolean).join(" ");

  const config: PinnedConfig = {
    kind: "line",
    metric: subject,
    formatter: formatterFor(metric),
    data,
  };

  return {
    question,
    narration: flat
      ? `${subject} stayed essentially flat over the last ${windowDays} days.`
      : `${subject} trended ${arrow} ${Math.abs(change).toFixed(1)}% over the last ${windowDays} days.`,
    rationale: `Trend questions read best as a line over time — the shape carries more meaning than the totals.`,
    alternative: {
      kind: "kpi",
      reason: `Or just the headline number for the window.`,
    },
    config,
  };
}

function barAnswer(question: string, metric: Metric, dimension: "channel", windowDays: number): Answer {
  const rows = allRows();
  const recent = inWindow(rows, 0, windowDays);
  const buckets = new Map<string, AskRow[]>();
  for (const r of recent) {
    const key = r[dimension];
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }
  const data = [...buckets.entries()]
    .map(([label, list]) => ({ label, value: +sumMetric(list, metric).toFixed(2) }))
    .sort((a, b) => (metric === "cpi" ? a.value - b.value : b.value - a.value));
  const top = data[0];
  const bottom = data[data.length - 1];

  const config: PinnedConfig = {
    kind: "bar",
    metric: labelMetric[metric],
    formatter: formatterFor(metric),
    data,
    highlightLabel: top?.label,
  };

  return {
    question,
    narration:
      top && bottom && data.length > 1
        ? `${top.label} leads on ${labelMetric[metric]} at ${formatValue(metric, top.value)}; ${bottom.label} trails at ${formatValue(metric, bottom.value)}.`
        : `${labelMetric[metric]} by channel, last ${windowDays} days.`,
    rationale: `Bars rank channels at a glance — eight datapoints fit a bar far better than a line.`,
    alternative: {
      kind: "table",
      reason: `Want the exact numbers in a sortable table?`,
    },
    config,
  };
}

function tableAnswer(question: string, metric: Metric, windowDays: number): Answer {
  const rows = allRows();
  const n = detectN(question);
  const recent = inWindow(rows, 0, windowDays);
  const buckets = new Map<string, AskRow[]>();
  for (const r of recent) {
    const list = buckets.get(r.campaign);
    if (list) list.push(r);
    else buckets.set(r.campaign, [r]);
  }
  type Rank = {
    campaign: string;
    channel: Channel;
    spend: number;
    installs: number;
    revenue: number;
    roas: number;
    cpi: number;
  };
  const ranked: Rank[] = [...buckets.entries()]
    .map(([campaign, list]) => ({
      campaign,
      channel: list[0].channel,
      spend: +list.reduce((a, r) => a + r.spend, 0).toFixed(2),
      installs: list.reduce((a, r) => a + r.installs, 0),
      revenue: +list.reduce((a, r) => a + r.revenue, 0).toFixed(2),
      roas: +sumMetric(list, "roas").toFixed(2),
      cpi: +sumMetric(list, "cpi").toFixed(2),
    }))
    .sort((a, b) => (metric === "cpi" ? a[metric] - b[metric] : b[metric] - a[metric]))
    .slice(0, n);

  const first = ranked[0];
  const verb = metric === "cpi" ? "Lowest" : "Top";
  const config: PinnedConfig = {
    kind: "table",
    columns: [
      { key: "campaign", label: "Campaign" },
      { key: "channel",  label: "Channel" },
      { key: "spend",    label: "Spend",    align: "right", format: "money" },
      { key: "installs", label: "Installs", align: "right", format: "count" },
      { key: "roas",     label: "ROAS",     align: "right", format: "ratio" },
      { key: "cpi",      label: "CPI",      align: "right", format: "money" },
    ],
    rows: ranked.map((r) => ({ ...r })),
  };

  return {
    question,
    narration: first
      ? `${verb} ${n} campaigns by ${labelMetric[metric]} — ${first.campaign} ${
          metric === "cpi" ? "has the lowest CPI at" : "leads at"
        } ${formatValue(metric, first[metric])}.`
      : `${verb} ${n} campaigns by ${labelMetric[metric]}.`,
    rationale: `Top-N questions need exact numbers across multiple metrics — a table beats any chart for that.`,
    alternative: {
      kind: "bar",
      reason: `Or a bar chart of just the ${labelMetric[metric]} column?`,
    },
    config,
  };
}

// ---- Public API ------------------------------------------------------------

export async function askLumen(
  question: string,
  filters?: AskFilters,
): Promise<Answer> {
  const q = question.trim();
  // Mock "thinking" so the UI gets a chance to show the reasoning state.
  await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));

  const metric = detectMetric(q) ?? "spend";
  const windowDays = inferWindow(filters, q);

  if (/\btop\s+\d+\b|\btop\s+(?:campaigns?|creatives?)\b|\bbest\b|\bworst\b|\branked?\b/i.test(q)) {
    return tableAnswer(q, metric, windowDays);
  }

  if (/\b(by\s+channel|across\s+channels?|each\s+channel|channel\s+(?:mix|breakdown))\b/i.test(q)) {
    return barAnswer(q, metric, "channel", windowDays);
  }
  if (/\bcompare\b|\bvs\b|\bversus\b/i.test(q)) {
    return barAnswer(q, metric, "channel", windowDays);
  }

  if (/\btrend(?:ed|ing)?\b|\bover\s*time\b|\bdaily\b|\bchart\b|\bgraph\b|\b(?:last|past)\s+\d+\s+days?\b/i.test(q)) {
    return lineAnswer(q, metric, windowDays, detectChannel(q));
  }

  if (detectChannel(q)) {
    return lineAnswer(q, metric, windowDays, detectChannel(q));
  }

  return kpiAnswer(q, metric, windowDays);
}
