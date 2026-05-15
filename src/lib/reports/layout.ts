import type {
  CampaignCommentary,
  CampaignRow,
  Channel,
  ChannelCampaignSection,
  ChannelWeeklySection,
  HistoricalWeekRow,
  Platform,
  PlatformOverallSection,
  Report,
  ReportSection,
  WeeklyBullet,
  WeeklySummaryRow,
  WeeklySummaryTable,
} from "./types";

// =============================================================================
// Shared slide-layout step. Both the on-screen carousel and the PPTX exporter
// walk this list, so any tweak to per-slide budgets ripples to both surfaces
// at once. The reason the step exists at all is that a 16:9 slide is a fixed
// frame; long sections (12 campaign rows, 10 bullets) would otherwise spill
// past the bottom of the slide. Here we split a long section into a first
// slide plus one or more continuation slides whose title gains "(cont.)".
// =============================================================================

export type ContinuationInfo = {
  /** 0-based; 0 is the first slide of a section. */
  partIndex: number;
  /** How many slides this section was split into. Always >= 1. */
  partTotal: number;
};

export type PlatformOverallSlide = {
  id: string;
  title: string;
  continuation: ContinuationInfo;
  /** Present only on partIndex === 0. Continuation slides set this to null
   *  so the renderer knows to skip the data area entirely. */
  summary: WeeklySummaryTable | null;
  bullets: WeeklyBullet[];
  platform: Platform;
};

export type ChannelWeeklySlide = {
  id: string;
  title: string;
  continuation: ContinuationInfo;
  /** Present only on partIndex === 0. */
  currentWeek: WeeklySummaryRow | null;
  history: HistoricalWeekRow[];
  bullets: WeeklyBullet[];
  platform: Platform;
  channel: Channel;
};

export type ChannelCampaignSlide = {
  id: string;
  title: string;
  continuation: ContinuationInfo;
  rows: CampaignRow[];
  commentary: CampaignCommentary[];
  platform: Platform;
  channel: Channel;
};

/** Legacy sections render as a single slide each, mirroring the pre-yellowHEAD
 *  layout. The new budget logic does not apply; we just hand the section back
 *  to whichever renderer (carousel or PPTX) knows how to draw it. */
export type LegacySection = Extract<
  ReportSection,
  | { id: "executive_summary" }
  | { id: "kpis" }
  | { id: "channel_breakdown" }
  | { id: "top_campaigns" }
  | { id: "recommendations" }
>;

export type LegacySlide = {
  id: string;
  title: string;
  continuation: ContinuationInfo;
  section: LegacySection;
};

export type LaidOutSlide =
  | { kind: "cover"; report: Report }
  | { kind: "platform_overall"; slide: PlatformOverallSlide }
  | { kind: "channel_weekly"; slide: ChannelWeeklySlide }
  | { kind: "channel_campaign"; slide: ChannelCampaignSlide }
  | { kind: "legacy"; slide: LegacySlide };

// =============================================================================
// Per-section budgets. These numbers are calibrated for the worst-case
// carousel viewport on the Reports page: 850px wide x 478px tall (16:9 with
// the sidebar + reports drawer open). The compact variants of the section
// components live within that envelope; the PPTX export uses the same
// budgets, so a 13.333" x 7.5" slide gets more breathing room than it
// strictly needs and that's fine.
//
// Tune here if the dev-mode overflow assertion starts firing.
// =============================================================================

const FIRST_BULLETS_OVERALL = 3;
const CONT_BULLETS_OVERALL = 7;

const FIRST_HISTORY_WEEKLY = 2;
const CONT_HISTORY_WEEKLY = 5;
const FIRST_BULLETS_WEEKLY = 2;
const CONT_BULLETS_WEEKLY = 7;

const FIRST_ROWS_CAMPAIGN = 5;
const CONT_ROWS_CAMPAIGN = 6;
const FIRST_COMMENTARY_CAMPAIGN = 1;
const CONT_COMMENTARY_CAMPAIGN = 2;
/** When a channel_campaign section has no rows at all, the first slide
 *  hands the entire data area to commentary. We let it absorb more blocks
 *  in that case so a commentary-only section doesn't unnecessarily spill. */
const FIRST_COMMENTARY_CAMPAIGN_NO_ROWS = 3;

/**
 * Orphan-suppression slack on the first-slide bullet cap. If the section
 * has just one bullet too many for the first slide, we'd rather put it on
 * slide 1 than create a continuation slide that holds a single bullet.
 */
const ORPHAN_SLACK = 1;

// =============================================================================
// Public entry point.
// =============================================================================

export function layoutSlides(report: Report): LaidOutSlide[] {
  const out: LaidOutSlide[] = [{ kind: "cover", report }];

  for (const section of report.sections) {
    if (!isRenderable(section)) continue;
    switch (section.id) {
      case "platform_overall":
        out.push(...layoutPlatformOverall(section));
        break;
      case "channel_weekly":
        out.push(...layoutChannelWeekly(section));
        break;
      case "channel_campaign":
        out.push(...layoutChannelCampaign(section));
        break;
      case "executive_summary":
      case "kpis":
      case "channel_breakdown":
      case "top_campaigns":
      case "recommendations":
        out.push(layoutLegacy(section));
        break;
    }
  }

  return out;
}

// =============================================================================
// Per-section packers.
// =============================================================================

function layoutPlatformOverall(
  section: PlatformOverallSection,
): LaidOutSlide[] {
  const idPrefix = `${section.id}-${section.platform}`;
  const partials: PlatformOverallSlide[] = [];

  // Orphan suppression: if all bullets fit in (cap + slack), keep them on
  // slide 1 instead of creating a 1-bullet continuation.
  const bullets = section.bullets;
  const firstCap =
    bullets.length <= FIRST_BULLETS_OVERALL + ORPHAN_SLACK
      ? bullets.length
      : FIRST_BULLETS_OVERALL;

  let cursor = 0;
  partials.push({
    id: `${idPrefix}-p0`,
    title: section.title,
    continuation: { partIndex: 0, partTotal: 0 },
    summary: section.summary,
    bullets: bullets.slice(0, firstCap),
    platform: section.platform,
  });
  cursor += firstCap;

  while (cursor < bullets.length) {
    const partIndex = partials.length;
    partials.push({
      id: `${idPrefix}-p${partIndex}`,
      title: appendCont(section.title, partIndex),
      continuation: { partIndex, partTotal: 0 },
      summary: null,
      bullets: bullets.slice(cursor, cursor + CONT_BULLETS_OVERALL),
      platform: section.platform,
    });
    cursor += CONT_BULLETS_OVERALL;
  }

  return finalize(partials, "platform_overall");
}

function layoutChannelWeekly(section: ChannelWeeklySection): LaidOutSlide[] {
  const idPrefix = `${section.id}-${section.platform}-${section.channel}`;
  const partials: ChannelWeeklySlide[] = [];

  const history = section.history;
  const bullets = section.bullets;

  // First slide: current-week row + up to 3 history + up to 3 bullets.
  // Orphan slack on bullets (same rule as the overall section).
  const firstBulletsCap =
    bullets.length <= FIRST_BULLETS_WEEKLY + ORPHAN_SLACK
      ? bullets.length
      : FIRST_BULLETS_WEEKLY;

  let histCursor = 0;
  let bulletsCursor = 0;

  partials.push({
    id: `${idPrefix}-p0`,
    title: section.title,
    continuation: { partIndex: 0, partTotal: 0 },
    currentWeek: section.currentWeek ?? null,
    history: history.slice(0, FIRST_HISTORY_WEEKLY),
    bullets: bullets.slice(0, firstBulletsCap),
    platform: section.platform,
    channel: section.channel,
  });
  histCursor = Math.min(FIRST_HISTORY_WEEKLY, history.length);
  bulletsCursor = firstBulletsCap;

  // Continuation rule: history first (up to 6 per slide), then bullets
  // (up to 9 per slide). A single continuation slide carries one or the
  // other, never both, so the visual hierarchy stays predictable. Mixing
  // would also make the height budget harder to defend.
  while (histCursor < history.length) {
    const partIndex = partials.length;
    partials.push({
      id: `${idPrefix}-p${partIndex}`,
      title: appendCont(section.title, partIndex),
      continuation: { partIndex, partTotal: 0 },
      currentWeek: null,
      history: history.slice(histCursor, histCursor + CONT_HISTORY_WEEKLY),
      bullets: [],
      platform: section.platform,
      channel: section.channel,
    });
    histCursor += CONT_HISTORY_WEEKLY;
  }

  while (bulletsCursor < bullets.length) {
    const partIndex = partials.length;
    partials.push({
      id: `${idPrefix}-p${partIndex}`,
      title: appendCont(section.title, partIndex),
      continuation: { partIndex, partTotal: 0 },
      currentWeek: null,
      history: [],
      bullets: bullets.slice(bulletsCursor, bulletsCursor + CONT_BULLETS_WEEKLY),
      platform: section.platform,
      channel: section.channel,
    });
    bulletsCursor += CONT_BULLETS_WEEKLY;
  }

  return finalize(partials, "channel_weekly");
}

function layoutChannelCampaign(
  section: ChannelCampaignSection,
): LaidOutSlide[] {
  const idPrefix = `${section.id}-${section.platform}-${section.channel}`;
  const partials: ChannelCampaignSlide[] = [];

  const rows = section.rows;
  const commentary = section.commentary;
  const hasRows = rows.length > 0;

  // When there are no rows, slide 1 hands the table area to commentary,
  // so its commentary budget gets the no-rows allowance.
  const firstCommentaryCap = hasRows
    ? FIRST_COMMENTARY_CAMPAIGN
    : FIRST_COMMENTARY_CAMPAIGN_NO_ROWS;

  let rowsCursor = 0;
  let commCursor = 0;

  partials.push({
    id: `${idPrefix}-p0`,
    title: section.title,
    continuation: { partIndex: 0, partTotal: 0 },
    rows: rows.slice(0, FIRST_ROWS_CAMPAIGN),
    commentary: commentary.slice(0, firstCommentaryCap),
    platform: section.platform,
    channel: section.channel,
  });
  rowsCursor = Math.min(FIRST_ROWS_CAMPAIGN, rows.length);
  commCursor = Math.min(firstCommentaryCap, commentary.length);

  // Continuations: rows first (8 per slide), then commentary (3 per slide).
  while (rowsCursor < rows.length) {
    const partIndex = partials.length;
    partials.push({
      id: `${idPrefix}-p${partIndex}`,
      title: appendCont(section.title, partIndex),
      continuation: { partIndex, partTotal: 0 },
      rows: rows.slice(rowsCursor, rowsCursor + CONT_ROWS_CAMPAIGN),
      commentary: [],
      platform: section.platform,
      channel: section.channel,
    });
    rowsCursor += CONT_ROWS_CAMPAIGN;
  }

  while (commCursor < commentary.length) {
    const partIndex = partials.length;
    partials.push({
      id: `${idPrefix}-p${partIndex}`,
      title: appendCont(section.title, partIndex),
      continuation: { partIndex, partTotal: 0 },
      rows: [],
      commentary: commentary.slice(
        commCursor,
        commCursor + CONT_COMMENTARY_CAMPAIGN,
      ),
      platform: section.platform,
      channel: section.channel,
    });
    commCursor += CONT_COMMENTARY_CAMPAIGN;
  }

  return finalize(partials, "channel_campaign");
}

function layoutLegacy(section: LegacySection): LaidOutSlide {
  return {
    kind: "legacy",
    slide: {
      id: `${section.id}-p0`,
      title: section.title,
      continuation: { partIndex: 0, partTotal: 1 },
      section,
    },
  };
}

// =============================================================================
// Helpers.
// =============================================================================

function isRenderable(section: ReportSection): boolean {
  switch (section.id) {
    case "executive_summary":
      return Boolean(section.body?.trim() || section.title?.trim());
    case "kpis":
      return section.kpis.length > 0;
    case "channel_breakdown":
      return section.rows.length > 0;
    case "top_campaigns":
      return section.rows.length > 0;
    case "recommendations":
      return section.bullets.length > 0;
    case "platform_overall":
      return Boolean(section.summary?.rows?.length || section.bullets.length);
    case "channel_weekly":
      return Boolean(
        section.currentWeek || section.history.length || section.bullets.length,
      );
    case "channel_campaign":
      return Boolean(section.rows.length || section.commentary.length);
  }
}

function appendCont(title: string, partIndex: number): string {
  return partIndex === 0 ? title : `${title} (cont.)`;
}

function finalize<T extends { continuation: ContinuationInfo }>(
  partials: T[],
  kind: "platform_overall" | "channel_weekly" | "channel_campaign",
): LaidOutSlide[] {
  const partTotal = partials.length;
  for (const p of partials) p.continuation.partTotal = partTotal;
  if (kind === "platform_overall") {
    return (partials as unknown as PlatformOverallSlide[]).map((slide) => ({
      kind: "platform_overall",
      slide,
    }));
  }
  if (kind === "channel_weekly") {
    return (partials as unknown as ChannelWeeklySlide[]).map((slide) => ({
      kind: "channel_weekly",
      slide,
    }));
  }
  return (partials as unknown as ChannelCampaignSlide[]).map((slide) => ({
    kind: "channel_campaign",
    slide,
  }));
}

// =============================================================================
// Cover title font-size scale. Shared by the on-screen ReportCoverHeader and
// the PPTX cover builder so a long title scales identically on both.
// =============================================================================

export type CoverTitleSizing = {
  /** PPTX font size in points. */
  pptFontSize: number;
  /** Tailwind-compatible class fragment for the on-screen carousel cover. */
  classFragment: string;
  /** Max number of lines before the renderer clamps. */
  maxLines: number;
};

export function coverTitleSizing(title: string): CoverTitleSizing {
  const len = title.length;
  if (len <= 50) {
    return {
      pptFontSize: 44,
      classFragment: "text-5xl leading-[1.05]",
      maxLines: 3,
    };
  }
  if (len <= 75) {
    return {
      pptFontSize: 36,
      classFragment: "text-4xl leading-[1.08]",
      maxLines: 3,
    };
  }
  if (len <= 110) {
    return {
      pptFontSize: 28,
      classFragment: "text-3xl leading-[1.12]",
      maxLines: 3,
    };
  }
  return {
    pptFontSize: 24,
    classFragment: "text-2xl leading-[1.18] line-clamp-3",
    maxLines: 3,
  };
}
