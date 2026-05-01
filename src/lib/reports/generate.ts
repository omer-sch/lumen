import { findClient } from "@/lib/mock/clients";
import { getDashboardData } from "@/lib/mock/dashboard";
import { getCampaigns } from "@/lib/mock/campaigns";
import type { Report, ReportSection } from "./types";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const newId = () =>
  `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

type GenerateInput = {
  prompt: string;
  from: Date;
  to: Date;
  client: string;
};

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
  const dash = getDashboardData({ from, to, client });
  const campaigns = getCampaigns({ from, to, client }).slice(0, 5);

  const period = `${fmtDay(from)} – ${fmtDay(to)}`;
  const clientLabel = c.slug === "all" ? "All clients" : c.name;

  const titleSeed = prompt.trim().split("\n")[0].slice(0, 80);
  const title =
    titleSeed.length > 6
      ? titleSeed
      : `UA performance summary · ${clientLabel}`;

  const roas = dash.kpis.find((k) => k.id === "roas");
  const spend = dash.kpis.find((k) => k.id === "spend");
  const cpi = dash.kpis.find((k) => k.id === "cpi");
  const installs = dash.kpis.find((k) => k.id === "installs");

  const tone = (delta: number, lowerBetter = false): "good" | "bad" | "neutral" => {
    if (Math.abs(delta) < 0.5) return "neutral";
    if (lowerBetter) return delta < 0 ? "good" : "bad";
    return delta >= 0 ? "good" : "bad";
  };
  const fmtDelta = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

  const sections: ReportSection[] = [
    {
      id: "executive_summary",
      title: "Executive summary",
      body:
        roas && spend
          ? `Across the ${clientLabel} UA portfolio for ${period}, total spend reached ${spend.value} with D7 ROAS of ${roas.value}. The week's headline movement: ROAS ${roas.delta >= 0 ? "lifted" : "softened"} ${fmtDelta(roas.delta)} versus the prior comparable window. Meta carried most of the lift, while Google CPI is drifting in a way that warrants a creative refresh.`
          : `Performance summary for ${clientLabel}, ${period}.`,
    },
    {
      id: "kpis",
      title: "Key metrics",
      body: `Aggregated across all UA channels for the active window. Deltas compare vs the equivalent prior period.`,
      kpis: [
        { label: "Spend",       value: spend?.value    ?? "—", delta: fmtDelta(spend?.delta    ?? 0), tone: tone(spend?.delta    ?? 0)        },
        { label: "Installs",    value: installs?.value ?? "—", delta: fmtDelta(installs?.delta ?? 0), tone: tone(installs?.delta ?? 0)        },
        { label: "CPI",         value: cpi?.value      ?? "—", delta: fmtDelta(cpi?.delta      ?? 0), tone: tone(cpi?.delta      ?? 0, true) },
        { label: "ROAS (D7)",   value: roas?.value     ?? "—", delta: fmtDelta(roas?.delta     ?? 0), tone: tone(roas?.delta     ?? 0)        },
      ],
    },
    {
      id: "channel_breakdown",
      title: "Channel breakdown",
      body: `Spend share and D7 ROAS by channel. Meta remains the dominant share; ROAS leadership shifts on a per-window basis.`,
      rows: dash.channelMix.map((m, i) => ({
        channel: m.channel,
        spend: `$${Math.round(m.spend).toLocaleString()}`,
        share: `${m.pct.toFixed(1)}%`,
        roas: `${(1.55 - i * 0.16).toFixed(2)}x`,
      })),
    },
    {
      id: "top_campaigns",
      title: "Top campaigns",
      body: `Five highest-spend campaigns in the window. Sorted by spend; ROAS shown for context.`,
      rows: campaigns.map((c) => ({
        name: c.name,
        channel: c.channel,
        spend: `$${Math.round(c.spend).toLocaleString()}`,
        installs: c.installs.toLocaleString(),
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
    sections,
  };
}
