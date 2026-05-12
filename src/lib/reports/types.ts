import type { AgentId } from "@/lib/agents/identity";

/** Section IDs are stable so a saved report keeps the right structure even
 *  if the user rearranges section labels. */
export type SectionId =
  | "executive_summary"
  | "kpis"
  | "channel_breakdown"
  | "top_campaigns"
  | "recommendations";

export type ReportKpi = {
  label: string;
  value: string;
  delta: string;
  /** Tone drives the brand color used on the delta chip. */
  tone: "good" | "bad" | "neutral";
};

export type ReportChannelRow = {
  channel: string;
  spend: string;
  share: string;
  roas: string;
};

export type ReportCampaignRow = {
  name: string;
  channel: string;
  spend: string;
  installs: string;
  roas: string;
};

export type ReportSection =
  | { id: "executive_summary"; title: string; body: string }
  | { id: "kpis"; title: string; body: string; kpis: ReportKpi[] }
  | { id: "channel_breakdown"; title: string; body: string; rows: ReportChannelRow[] }
  | { id: "top_campaigns"; title: string; body: string; rows: ReportCampaignRow[] }
  | { id: "recommendations"; title: string; body: string; bullets: string[] };

export type Report = {
  id: string;
  /** Owner — phase 1 mock; phase 2 is the auth user id. */
  userId: string;
  createdAt: number;
  updatedAt: number;
  /** Free-text prompt the user gave when generating. */
  prompt: string;
  /** "UA weekly summary for GlobalComix" — derived from the prompt + filter. */
  title: string;
  /** Period the report covers, e.g. "Apr 1 – Apr 30, 2026". */
  period: string;
  /** Display label for the active client (e.g. "GlobalComix"). */
  clientLabel: string;
  /** Which agent drafted the report — drives the byline under the title.
   *  Nova is the report writer; legacy reports persisted before this field
   *  existed default to her in the UI. */
  authoredBy?: AgentId;
  sections: ReportSection[];
};
