import { findClient } from "@/lib/mock/clients";
import { getCampaigns } from "@/lib/mock/campaigns";
import type { Report, ReportSection } from "./types";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const newId = () => `rpt_${crypto.randomUUID()}`;

type GenerateInput = {
  prompt: string;
  from: Date;
  to: Date;
  client: string;
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Mock report generator — produces a consistent five-section structure
 * from the prompt + global filter. The shape is exactly what the real
 * Claude integration will return; phase 2 swaps the body for an LLM call
 * and the surrounding UI keeps working.
 */
export function generateReport({
  prompt,
  from,
  to,
  client,
}: GenerateInput): Report {
  const c = findClient(client);
  const campaigns = getCampaigns({ from, to, client });
  const topCampaigns = campaigns.slice(0, 5);

  const period = `${fmtDay(from)} – ${fmtDay(to)}`;
  const clientLabel = c.name;

  const titleSeed = prompt.trim().split("\n")[0].slice(0, 80);
  const title =
    titleSeed.length > 6
      ? titleSeed
      : `UA performance summary · ${clientLabel}`;

  // Roll-up totals from the campaign list — the only real source of truth
  // available to this mock generator now that the dashboard mock is gone.
  const totalSpend = campaigns.reduce((a, r) => a + r.spend, 0);
  const totalInstalls = campaigns.reduce((a, r) => a + r.installs, 0);
  const totalCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const weightedRoas =
    totalSpend > 0
      ? campaigns.reduce((a, r) => a + r.roas * r.spend, 0) / totalSpend
      : 0;

  // Channel-level roll-up from the same campaign source.
  type ChannelRoll = { channel: string; spend: number; share: number };
  const byChannel = new Map<string, number>();
  for (const r of campaigns) {
    byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + r.spend);
  }
  const channelRollup: ChannelRoll[] = [...byChannel.entries()]
    .map(([channel, spend]) => ({
      channel,
      spend,
      share: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const sections: ReportSection[] = [
    {
      id: "executive_summary",
      title: "Executive summary",
      body: `Performance summary for ${clientLabel}, ${period}. Total UA spend reached ${fmtMoney(totalSpend)} across ${campaigns.length} active campaigns with a blended D7 ROAS of ${weightedRoas.toFixed(2)}x.`,
    },
    {
      id: "kpis",
      title: "Key metrics",
      body: `Aggregated across all UA channels for the active window.`,
      kpis: [
        { label: "Spend",     value: fmtMoney(totalSpend),         delta: "—", tone: "neutral" },
        { label: "Installs",  value: fmtCount(totalInstalls),      delta: "—", tone: "neutral" },
        { label: "CPI",       value: `$${totalCpi.toFixed(2)}`,    delta: "—", tone: "neutral" },
        { label: "ROAS (D7)", value: `${weightedRoas.toFixed(2)}x`, delta: "—", tone: "neutral" },
      ],
    },
    {
      id: "channel_breakdown",
      title: "Channel breakdown",
      body: `Spend share by channel for the active window.`,
      rows: channelRollup.map((m, i) => ({
        channel: m.channel,
        spend: fmtMoney(m.spend),
        share: `${m.share.toFixed(1)}%`,
        roas: `${(1.55 - i * 0.16).toFixed(2)}x`,
      })),
    },
    {
      id: "top_campaigns",
      title: "Top campaigns",
      body: `Five highest-spend campaigns in the window. Sorted by spend; ROAS shown for context.`,
      rows: topCampaigns.map((c) => ({
        name: c.name,
        channel: c.channel,
        spend: fmtMoney(c.spend),
        installs: fmtCount(c.installs),
        roas: `${c.roas.toFixed(2)}x`,
      })),
    },
    {
      id: "recommendations",
      title: "Recommendations",
      body: `Three plays Lumen suggests, based on the patterns this window surfaced. Each is a hypothesis the team can test inside the existing budget.`,
      bullets: [
        `Promote the top-performing TikTok HC creatives to their own ad set and bump budget by ~25% — installs are up 34% with CPI dropping.`,
        `Refresh the Google UAC creative pack — CPI has drifted upward for five days against flat installs, classic saturation pattern.`,
        `Carve the LAL-3-Payers segment into its own ad set with its own budget — early conversion signal is 2.1× the campaign average.`,
      ],
    },
  ];

  return {
    id: newId(),
    userId: "mock-user-1",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt,
    title,
    period,
    clientLabel,
    authoredBy: "nova",
    sections,
  };
}
