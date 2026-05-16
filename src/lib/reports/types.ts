import type { AgentId } from "@/lib/agents/identity";

/** Section IDs are stable so a saved report keeps the right structure even
 *  if the user rearranges section labels. The legacy ids (executive_summary,
 *  kpis, channel_breakdown, top_campaigns, recommendations) remain in the
 *  union so reports persisted before the yellowHEAD format ships still
 *  hydrate cleanly. */
export type SectionId =
  | "executive_summary"
  | "kpis"
  | "channel_breakdown"
  | "top_campaigns"
  | "recommendations"
  | "platform_overall"
  | "channel_weekly"
  | "channel_campaign";

// =============================================================================
// Legacy types — pre yellowHEAD-format Reports. Kept so localStorage rows
// from before the switch still render via the fallback path in
// ReportDocument.tsx. New work should use the yellowHEAD section types below.
// =============================================================================

/** @deprecated use the yellowHEAD format */
export type ReportKpi = {
  label: string;
  value: string;
  delta: string;
  /** Tone drives the brand color used on the delta chip. */
  tone: "good" | "bad" | "neutral";
};

/** @deprecated use the yellowHEAD format */
export type ReportChannelRow = {
  channel: string;
  spend: string;
  share: string;
  roas: string;
};

/** @deprecated use the yellowHEAD format */
export type ReportCampaignRow = {
  name: string;
  channel: string;
  spend: string;
  installs: string;
  roas: string;
};

// =============================================================================
// yellowHEAD weekly-review format — three section templates, instanced
// across Platform x Channel. See globalcomix-w18-learnings.html for the
// visual reference.
// =============================================================================

export type Platform = "android" | "ios" | "web";
export type Channel = "meta" | "google" | "tiktok" | "asa" | "search";

/** Pink/orange/blue are the everyday callouts; green/violet are reserved
 *  for cases where we need a fourth or fifth highlight on a single slide. */
export type CalloutColor = "pink" | "orange" | "blue" | "green" | "violet";

export type MetricValue = {
  /** `null` means the metric was deliberately suppressed (e.g. an
   *  immature D7 cohort that would produce statistical garbage). The
   *  renderer prints null + maturing as an em-dash with no delta arrow
   *  and no tone. Consumers that need a numeric value should typeguard
   *  on `typeof value === "number"`. */
  value: number | string | null;
  /** Week-over-week % change. Positive = went up. */
  delta?: number;
  /** Drives the arrow color. Cost metrics flip the polarity: a drop in
   *  CPA is "good", which the renderer interprets per-metric. */
  tone?: "good" | "bad" | "neutral";
  /** True when the metric's attribution window is still settling (e.g.
   *  D7 viewed less than 7 days after the period closes). */
  maturing?: boolean;
};

export type WeeklyBullet = {
  text: string;
  /** "headline-bad" renders the bullet in coral; the first bullet of a
   *  bad-news section uses this. */
  tone?: "headline-bad" | "headline-good" | "neutral";
};

export type WeeklySummaryRow = {
  /** "Facebook" / "Google" / "TikTok" / "Total" — the row label on the
   *  platform-overall summary table. */
  label: string;
  spend: MetricValue;
  substart: MetricValue;
  subD0: MetricValue;
  subD7: MetricValue;
  cpSubstart: MetricValue;
  cpaD0: MetricValue;
  cpaD7: MetricValue;
};

export type WeeklySummaryTable = {
  /** One row per channel under the platform. */
  rows: WeeklySummaryRow[];
  total: WeeklySummaryRow;
};

export type HistoricalWeekRow = {
  /** "Week 17", "Week 16", … */
  label: string;
  /** "20 Apr 2026 to 26 Apr 2026" */
  range: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  cpi: number;
  substart: number;
  cpSubstart: number;
  subD0: number;
  cpaD0: number;
  /** Null means the window is still maturing — render as "—" with a
   *  "maturing" hint. */
  subD7: number | null;
  cpaD7: number | null;
};

export type CampaignRow = {
  /** Full yellowHEAD-style name,
   *  e.g. "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW-Top". */
  campaignName: string;
  spend: number;
  installs: number;
  cpi: number;
  substart: number;
  cpSubstart: number;
  cpSubstartDelta: number;
  subD0: number;
  cpaD0: number;
  cpaD0Delta: number;
  subD7: number | null;
  cpaD7: number | null;
  cpaD7Delta: number | null;
  /**
   * Optional callout color. When set, the row renders with a colored
   * arrow on the right edge. The same color highlights the matching
   * phrase in the commentary below. Set by the generator based on
   * delta magnitude.
   */
  highlight?: CalloutColor;
};

export type CampaignCommentary = {
  /** Group label, e.g. "Sub (Evergreen)" or "SubStart (India)". */
  groupLabel: string;
  /** Factual sentence about what the data shows. */
  observation: string;
  /** What the team did or recommends. Rendered after the "<> Action Item" pill. */
  actionItem: string;
  /**
   * Phrases inside `observation` to highlight, keyed by the callout
   * color that links them to a row above.
   */
  highlights?: { color: CalloutColor; phrase: string }[];
};

/**
 * One paragraph of LLM-emitted prose. Phase 1 of the Lumen Reports
 * lifecycle introduces this as an additive field on the section
 * union; sections produced by the legacy bullet pipeline (today's
 * Hermes quill + atelier flow, the bare manual builder) leave it
 * undefined and the renderer falls back to bullet rendering. Sections
 * produced by Smart Reports (src/lib/smart-reports/composeReport)
 * populate it; the renderer prefers prose when present.
 *
 * `highlights` carries the structured highlight markup tokens parsed
 * out of the prose text. Each token resolves a `[[highlight:N]]`
 * placeholder in `text` to a colored span in the deck (yellow for
 * "good", pink for "bad").
 */
export type ProseBlock = {
  /** Optional sub-heading (used in campaign-breakdown for family
   *  grouping). Empty / undefined for a single flowing paragraph. */
  heading?: string;
  /** Prose with `[[highlight:N]]` placeholders. */
  text: string;
  /** Resolved highlight tokens in placeholder order. */
  highlights: { kind: "good" | "bad"; text: string }[];
};

export type PlatformOverallSection = {
  id: "platform_overall";
  platform: Platform;
  /** e.g. "Android | Overall | Weekly Breakdown". */
  title: string;
  summary: WeeklySummaryTable;
  bullets: WeeklyBullet[];
  /** Smart Reports prose. Optional / additive; legacy renderers
   *  ignore. */
  prose?: ProseBlock[];
};

export type ChannelWeeklySection = {
  id: "channel_weekly";
  platform: Platform;
  channel: Channel;
  /** e.g. "Android | Meta | Weekly Breakdown". */
  title: string;
  currentWeek: WeeklySummaryRow;
  /** Last 3 to 4 weeks for context. */
  history: HistoricalWeekRow[];
  bullets: WeeklyBullet[];
  /** Smart Reports prose. Optional / additive; the renderer falls
   *  back to `bullets` when absent. */
  prose?: ProseBlock[];
};

export type ChannelCampaignSection = {
  id: "channel_campaign";
  platform: Platform;
  channel: Channel;
  /** e.g. "Android | Meta | Campaign Breakdown". */
  title: string;
  rows: CampaignRow[];
  /** One paragraph per campaign group. */
  commentary: CampaignCommentary[];
  /** Smart Reports prose, one block per family. The renderer prefers
   *  prose blocks over commentary when both are populated. */
  prose?: ProseBlock[];
};

export type ReportSection =
  /** @deprecated legacy executive-summary section */
  | { id: "executive_summary"; title: string; body: string }
  /** @deprecated legacy kpi section */
  | { id: "kpis"; title: string; body: string; kpis: ReportKpi[] }
  /** @deprecated legacy channel-breakdown section */
  | { id: "channel_breakdown"; title: string; body: string; rows: ReportChannelRow[] }
  /** @deprecated legacy top-campaigns section */
  | { id: "top_campaigns"; title: string; body: string; rows: ReportCampaignRow[] }
  /** @deprecated legacy recommendations section */
  | { id: "recommendations"; title: string; body: string; bullets: string[] }
  | PlatformOverallSection
  | ChannelWeeklySection
  | ChannelCampaignSection;

/**
 * One platform-scoped chapter within a multi-section weekly review
 * deck. Phase 2 introduces this on top of the flat `sections` field;
 * the renderer prefers `chapters` when populated and falls back to
 * `sections` for legacy / single-channel reports.
 *
 * Each chapter is a series of consecutive sections, separated from
 * neighbours by a full-bleed divider slide. Chapter order is
 * deterministic: Android, then iOS, then Web (when those platforms
 * have any spend in the period).
 */
export type ReportChapter = {
  platform: Platform;
  /** Divider slide content. Phase 2 ships title + optional subtitle;
   *  the renderer paints the platform name in white on a dark slide
   *  with the channel logos arranged in the corner. */
  divider: { title: string; subtitle?: string };
  /** Sections inside this chapter, in render order. Typically one
   *  platform_overall + N (channel_weekly + channel_campaign) pairs. */
  sections: ReportSection[];
};

/**
 * Closer slide content (Phase 2). Branded, no data claims. The
 * renderer paints the title prominently, then the subtitle and
 * contact line below. Optional; legacy reports omit it.
 */
export type ReportCloser = {
  title: string;
  subtitle?: string;
  contactLine?: string;
};

export type Report = {
  id: string;
  /** Owner. Clerk userId on the server, "preview-user" under LUMEN_PREVIEW,
   *  legacy "mock-user-1" for localStorage rows persisted before the
   *  Supabase migration in v0.5-A. The server fills this from the auth
   *  context on every write; the client field is informational. */
  userId: string;
  /** Client filter key (e.g. "globalcomix"), the value the global filter
   *  uses. clientLabel is the display string ("GlobalComix"). */
  client: string;
  createdAt: number;
  updatedAt: number;
  /** Free-text prompt the user gave when generating. */
  prompt: string;
  /** "UA weekly summary for GlobalComix" — derived from the prompt + filter. */
  title: string;
  /** Period the report covers, e.g. "Apr 1 to Apr 30, 2026". */
  period: string;
  /** Set when the active global filter is wider than a single week and the
   *  report has narrowed itself to the most recent complete ISO week.
   *  Rendered as a muted "Filter: ..." line under the period on the cover
   *  so the user isn't surprised by the narrowed window. */
  filterRange?: string;
  /** Display label for the active client (e.g. "GlobalComix"). */
  clientLabel: string;
  /** Which agent drafted the report — drives the byline under the title.
   *  Nova is the report writer; Hermes is the v0.5 drafter; legacy reports
   *  persisted before this field existed default to Nova in the UI. */
  authoredBy?: AgentId;
  /** "manual" for user-built reports via the Reports prompt; "hermes" for
   *  agent-drafted reports landed from /api/agents/hermes/generate. The UI
   *  uses this to surface the Hermes byline + the per-section regenerate
   *  affordance. */
  source?: "manual" | "hermes";
  /** Set on Hermes-drafted reports; links back to agent_runs for trace
   *  view and per-section regenerate. */
  agentRunId?: string | null;
  /** Manual reports default intent.platforms + intent.channels to
   *  Android / Meta because the builder UI does not capture them yet.
   *  When this flag is true, the cover and section dividers suppress
   *  the platform / channel pills so the deck does not claim a scope
   *  the user did not pick. Set by generateReport() in the manual
   *  path; left unset (falsy) for Hermes where the platform / channel
   *  came from the email and is a real signal. Drop when the pickers
   *  ship in the manual builder UI. */
  suppressPlatformChannelPills?: boolean;
  /** Display name of the recognised contact ("Emily Foster"), shown
   *  as "Prepared for ..." on the cover when set. Populated by Atelier
   *  from state.contact (see chunk B4). */
  preparedFor?: string | null;
  sections: ReportSection[];
  /** Phase 2 (Smart Reports `weekly-review-globalcomix` template).
   *  When populated, the renderer walks chapters in order, emits a
   *  divider slide per chapter, then the chapter's sections. Legacy
   *  reports leave this undefined and the renderer falls back to
   *  the flat `sections` list. The two coexist intentionally:
   *  Hermes's single-channel-weekly template ships `sections` only;
   *  the manual builder's full weekly review ships both
   *  (the flat list is the union of every chapter's sections, kept
   *  so backwards-compatible consumers still resolve). */
  chapters?: ReportChapter[];
  /** Phase 2 closer slide content. Optional; legacy reports omit it
   *  and the renderer skips the slide. */
  closer?: ReportCloser;
  /** Audit trail. Entries are append-only and shaped per kind:
   *  - {kind:"regenerate_section", slide_target, at, by}
   *  - {kind:"edit", section_id, before, after, at, by}
   *  Stored as jsonb so additional kinds can land without a migration. */
  audit?: ReportAuditEntry[];
};

export type ReportAuditEntry =
  | {
      kind: "regenerate_section";
      slide_target: string;
      at: string;
      by: string;
    }
  | {
      kind: "edit";
      section_id: string;
      before: string;
      after: string;
      at: string;
      by: string;
    }
  | {
      kind: "edit_title";
      before: string;
      after: string;
      at: string;
      by: string;
    };
