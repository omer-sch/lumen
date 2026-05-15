"use client";

import { REPORT_BRAND, reportFilename } from "./brand";
import {
  coverTitleSizing,
  layoutSlides,
  type ChannelCampaignSlide,
  type ChannelWeeklySlide,
  type ContinuationInfo,
  type LaidOutSlide,
  type LegacySlide,
  type PlatformOverallSlide,
} from "./layout";
import { CALLOUT_HEX } from "@/components/reports/sections/callout";
import {
  iconBadgeTone,
  platformChannelDataUri,
} from "@/components/reports/sections/platformChannelIcons";
import type {
  CalloutColor,
  CampaignCommentary,
  CampaignRow,
  HistoricalWeekRow,
  MetricValue,
  Report,
  WeeklyBullet,
  WeeklySummaryRow,
} from "./types";

/**
 * Renders the report as a pptxgenjs deck. The slide list comes from the
 * shared `layoutSlides` step so a long section splits the same way as
 * in the on-screen carousel — first slide + one or more " (cont.)" slides.
 * Tables are real PPTX tables (not images), so the client can edit them
 * in PowerPoint or Keynote.
 *
 * Brand colors come from REPORT_BRAND. pptxgenjs expects hex strings
 * without the leading '#' for color params, so we strip them before
 * passing.
 */
export async function exportReportAsPptx(report: Report): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.333" x 7.5", standard 16:9
  pres.author = "Lumen — yellowHEAD AI";
  pres.company = "yellowHEAD";
  pres.title = report.title;

  const slides = layoutSlides(report);
  for (const s of slides) {
    buildSlide(pres, s, report);
  }

  await pres.writeFile({
    fileName: reportFilename({
      client: report.clientLabel,
      period: report.period,
      title: report.title,
      ext: "pptx",
    }),
  });
}

// ---------------------------------------------------------------------------
// Constants — slide geometry. All units are inches (LAYOUT_WIDE = 13.333x7.5).
// ---------------------------------------------------------------------------

const SLIDE_W = 13.333;
const TITLE_BAND_H = 1.0;
const CONTENT_START_Y = 1.25;
const FOOTER_Y = 7.2;
const CONTENT_BOTTOM = 7.05;
const PAGE_LEFT = 0.6;
const PAGE_RIGHT_MARGIN = 0.6;
const PAGE_W = SLIDE_W - PAGE_LEFT - PAGE_RIGHT_MARGIN;

const GAP_AFTER_TABLE = 0.2;
const GAP_AFTER_BULLETS = 0.2;
const GAP_AFTER_COMMENTARY = 0.15;

const SUMMARY_HEADER_H = 0.32;
const SUMMARY_ROW_H = 0.34;
const HISTORY_HEADER_H = 0.32;
const HISTORY_ROW_H = 0.32;
const CAMPAIGN_HEADER_H = 0.32;
const CAMPAIGN_ROW_H = 0.36;
const BULLET_ROW_H = 0.36;
const COMMENTARY_BLOCK_H = 1.05;

// ---------------------------------------------------------------------------
// Type alias for the pptxgenjs runtime instance. We dynamic-import the
// module so it doesn't ship in the main bundle; `typeof import(...)` reads
// the module's static types without forcing a runtime import.
// ---------------------------------------------------------------------------

type Pptx = InstanceType<(typeof import("pptxgenjs"))["default"]>;
type Slide = ReturnType<Pptx["addSlide"]>;

const hex = (c: string) => c.replace("#", "");

// Approximate light-grey rendering of the brand's rgba textSecondary so PPTX,
// which doesn't accept rgba color strings, still reads as a muted body color.
const TEXT_SECONDARY_HEX = "55617A";
const TEXT_MUTED_HEX = "9099AA";
const DELTA_GOOD_HEX = "16A34A";
const DELTA_BAD_HEX = "DC2626";

// ---------------------------------------------------------------------------
// Slide dispatch
// ---------------------------------------------------------------------------

function buildSlide(pres: Pptx, s: LaidOutSlide, report: Report) {
  switch (s.kind) {
    case "cover":
      return buildCoverSlide(pres, report);
    case "platform_overall":
      return buildPlatformOverallSlide(pres, s.slide, report);
    case "channel_weekly":
      return buildChannelWeeklySlide(pres, s.slide, report);
    case "channel_campaign":
      return buildChannelCampaignSlide(pres, s.slide, report);
    case "legacy":
      return buildLegacySlide(pres, s.slide, report);
  }
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

function buildCoverSlide(pres: Pptx, report: Report) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.navy) };

  // Lumen mark + wordmark. No letter-spacing on the wordmark; the previous
  // charSpacing: 4 rendered "yellowHEAD AI" as "y e l l o w H E A D".
  slide.addShape("rect", {
    x: 0.6,
    y: 0.55,
    w: 0.55,
    h: 0.55,
    fill: { color: hex(REPORT_BRAND.yellow) },
    line: { color: hex(REPORT_BRAND.yellow), width: 0 },
  });
  slide.addText("L", {
    x: 0.6,
    y: 0.55,
    w: 0.55,
    h: 0.55,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: 22,
    bold: true,
    color: hex(REPORT_BRAND.navy),
    align: "center",
    valign: "middle",
  });
  slide.addText("Lumen", {
    x: 1.3,
    y: 0.5,
    w: 3,
    h: 0.4,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: 14,
    bold: true,
    color: hex(REPORT_BRAND.cloud),
  });
  slide.addText("yellowHEAD AI", {
    x: 1.3,
    y: 0.82,
    w: 3,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: "BFC7D6",
  });

  // Eyebrow pill — actual rounded rect shape with navy text inside it,
  // matching the on-screen carousel cover. Previously the eyebrow was
  // tracked-out yellow text, which doesn't read as a pill in print.
  const eyebrowW = 1.55;
  slide.addShape("roundRect", {
    x: 0.6,
    y: 3.0,
    w: eyebrowW,
    h: 0.36,
    fill: { color: hex(REPORT_BRAND.yellow) },
    line: { color: hex(REPORT_BRAND.yellow), width: 0 },
    rectRadius: 0.18,
  });
  slide.addText("WEEKLY REVIEW", {
    x: 0.6,
    y: 3.0,
    w: eyebrowW,
    h: 0.36,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    bold: true,
    color: hex(REPORT_BRAND.navy),
    align: "center",
    valign: "middle",
  });

  // Title — font size scales with character count via the shared helper.
  const sizing = coverTitleSizing(report.title);
  slide.addText(report.title, {
    x: 0.6,
    y: 3.5,
    w: 12,
    h: 1.6,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: sizing.pptFontSize,
    bold: true,
    color: hex(REPORT_BRAND.cloud),
    fit: "shrink",
  });

  // Subtitle (client + period). Yellow accent so it reads as part of the
  // identity, not body text.
  slide.addText(`${report.clientLabel}  ·  ${report.period}`, {
    x: 0.6,
    y: 5.25,
    w: 12,
    h: 0.5,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 16,
    bold: true,
    color: hex(REPORT_BRAND.yellow),
  });

  // Byline — "Drafted by Nova" parity with the on-screen cover. The agent
  // identity is on the report record; if missing (legacy) we still surface
  // Nova so the surface stays consistent.
  slide.addText("Drafted by Nova · Reports analyst", {
    x: 0.6,
    y: 5.85,
    w: 12,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 11,
    color: "BFC7D6",
  });

  // Sample-data disclosure. Mirrors the on-screen banner so a PPTX export
  // carries the same disclosure as the shared link and the PDF.
  slide.addText(
    "SAMPLE REPORT: FIGURES SHOWN ARE ILLUSTRATIVE, NOT LIVE BIGQUERY DATA.",
    {
      x: 0.6,
      y: 6.3,
      w: 12,
      h: 0.35,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 9,
      bold: true,
      color: hex(REPORT_BRAND.yellow),
      fill: { color: "33270C" },
      margin: 0.08,
    },
  );

  // Footer (no Part X of Y on the cover slide).
  slide.addText("Lumen Reports", {
    x: PAGE_LEFT,
    y: FOOTER_Y,
    w: 6,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: TEXT_MUTED_HEX,
  });
  slide.addText(new Date(report.createdAt).toLocaleDateString(), {
    x: 7.3,
    y: FOOTER_Y,
    w: 5.5,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: TEXT_MUTED_HEX,
    align: "right",
  });
}

// ---------------------------------------------------------------------------
// Platform Overall
// ---------------------------------------------------------------------------

function buildPlatformOverallSlide(
  pres: Pptx,
  slide: PlatformOverallSlide,
  report: Report,
) {
  const pptSlide = pres.addSlide();
  pptSlide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(pptSlide, slide.title);
  paintPlatformBadges(pptSlide, slide.platform);
  paintPlatformChip(pptSlide, slide.platform);

  const cursor = makeCursor(CONTENT_START_Y);

  if (slide.summary) {
    const rows = [...slide.summary.rows, slide.summary.total];
    const colW = [1.4, 1.5, 1.4, 1.3, 1.3, 1.6, 1.3, 1.3];
    const tableW = sum(colW);
    const tableRows = [
      headerRow(
        ["Channel", "Spend", "SubStart", "Sub D0", "Sub D7", "CP SubStart", "CPA D0", "CPA D7"],
        [{ align: "left" }, ...Array(7).fill({ align: "right" })],
      ),
      ...rows.map((r, i) => weeklyRowToCells(r, i === rows.length - 1)),
    ];
    pptSlide.addTable(tableRows, {
      x: PAGE_LEFT,
      y: cursor.y,
      w: tableW,
      colW,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 10,
      color: hex(REPORT_BRAND.textPrimary),
      border: { type: "solid", pt: 0.5, color: "E8ECF2" },
    });
    cursor.advance(SUMMARY_HEADER_H + rows.length * SUMMARY_ROW_H + GAP_AFTER_TABLE);
  }

  if (slide.bullets.length > 0) {
    paintBullets(pptSlide, slide.bullets, cursor);
  }

  paintFooter(pptSlide, report, slide.continuation);
}

// ---------------------------------------------------------------------------
// Channel Weekly
// ---------------------------------------------------------------------------

function buildChannelWeeklySlide(
  pres: Pptx,
  slide: ChannelWeeklySlide,
  report: Report,
) {
  const pptSlide = pres.addSlide();
  pptSlide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(pptSlide, slide.title);
  paintPlatformBadges(pptSlide, slide.platform, slide.channel);
  paintPlatformChip(pptSlide, slide.platform, slide.channel);

  const cursor = makeCursor(CONTENT_START_Y);

  // Current-week single-row table sits above the history table. Same
  // columns as the platform-overall summary so the eye can compare.
  if (slide.currentWeek) {
    const colW = [1.4, 1.5, 1.4, 1.3, 1.3, 1.6, 1.3, 1.3];
    const tableW = sum(colW);
    const tableRows = [
      headerRow(
        ["", "Spend", "SubStart", "Sub D0", "Sub D7", "CP SubStart", "CPA D0", "CPA D7"],
        [{ align: "left" }, ...Array(7).fill({ align: "right" })],
      ),
      weeklyRowToCells({ ...slide.currentWeek, label: "This week" }, false),
    ];
    pptSlide.addTable(tableRows, {
      x: PAGE_LEFT,
      y: cursor.y,
      w: tableW,
      colW,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 10,
      color: hex(REPORT_BRAND.textPrimary),
      border: { type: "solid", pt: 0.5, color: "E8ECF2" },
    });
    cursor.advance(SUMMARY_HEADER_H + 1 * SUMMARY_ROW_H + GAP_AFTER_TABLE);
  }

  if (slide.history.length > 0) {
    const colW = [0.7, 1.7, 0.85, 0.85, 0.65, 0.85, 0.95, 0.8, 0.8, 0.8, 0.85];
    const tableW = sum(colW);
    const tableRows = [
      headerRow(
        [
          "Week",
          "Range",
          "Spend",
          "Installs",
          "CPI",
          "SubStart",
          "CP SubStart",
          "Sub D0",
          "CPA D0",
          "Sub D7",
          "CPA D7",
        ],
        [
          { align: "left" },
          { align: "left" },
          ...Array(9).fill({ align: "right" }),
        ],
      ),
      ...slide.history.map(historyRowToCells),
    ];
    pptSlide.addTable(tableRows, {
      x: PAGE_LEFT,
      y: cursor.y,
      w: tableW,
      colW,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 9,
      color: hex(REPORT_BRAND.textPrimary),
      border: { type: "solid", pt: 0.5, color: "E8ECF2" },
    });
    cursor.advance(
      HISTORY_HEADER_H + slide.history.length * HISTORY_ROW_H + GAP_AFTER_TABLE,
    );
  }

  if (slide.bullets.length > 0) {
    paintBullets(pptSlide, slide.bullets, cursor);
  }

  paintFooter(pptSlide, report, slide.continuation);
}

// ---------------------------------------------------------------------------
// Channel Campaign
// ---------------------------------------------------------------------------

function buildChannelCampaignSlide(
  pres: Pptx,
  slide: ChannelCampaignSlide,
  report: Report,
) {
  const pptSlide = pres.addSlide();
  pptSlide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(pptSlide, slide.title);
  paintPlatformBadges(pptSlide, slide.platform, slide.channel);
  paintPlatformChip(pptSlide, slide.platform, slide.channel);

  const cursor = makeCursor(CONTENT_START_Y);

  // Campaign-row callouts (left-pointing arrow on the right edge of the
  // table) need to know the absolute Y of each row, which depends on
  // where the table started. Capture that here.
  let tableTopY: number | null = null;

  if (slide.rows.length > 0) {
    const colW = [3.0, 0.85, 0.7, 0.65, 0.75, 0.85, 0.6, 0.7, 0.7, 0.6, 0.7, 0.9];
    const tableW = sum(colW);
    const tableRows = [
      headerRow(
        [
          "Campaign",
          "Spend",
          "Installs",
          "CPI",
          "SubStart",
          "CP SubStart",
          "%Δ",
          "Sub D0",
          "CPA D0",
          "%Δ",
          "Sub D7",
          "CPA D7",
        ],
        [
          { align: "left" },
          ...Array(11).fill({ align: "right" }),
        ],
      ),
      ...slide.rows.map(campaignRowToCells),
    ];
    tableTopY = cursor.y;
    pptSlide.addTable(tableRows, {
      x: PAGE_LEFT,
      y: cursor.y,
      w: tableW,
      colW,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 9,
      color: hex(REPORT_BRAND.textPrimary),
      border: { type: "solid", pt: 0.5, color: "E8ECF2" },
    });

    // Callout arrows on flagged rows. Position relative to the table's
    // top-left + row index. The arrow sits just past the right edge of
    // the last cell so it doesn't fight the cell padding.
    slide.rows.forEach((row, i) => {
      if (!row.highlight) return;
      const arrowY =
        tableTopY! + CAMPAIGN_HEADER_H + i * CAMPAIGN_ROW_H + (CAMPAIGN_ROW_H - 0.2) / 2;
      pptSlide.addShape("leftArrow", {
        x: PAGE_LEFT + tableW + 0.05,
        y: arrowY,
        w: 0.22,
        h: 0.2,
        fill: { color: hex(CALLOUT_HEX[row.highlight]) },
        line: { color: hex(CALLOUT_HEX[row.highlight]), width: 0 },
      });
    });

    cursor.advance(
      CAMPAIGN_HEADER_H + slide.rows.length * CAMPAIGN_ROW_H + GAP_AFTER_TABLE,
    );
  }

  if (slide.commentary.length > 0) {
    for (const c of slide.commentary) {
      if (cursor.y + COMMENTARY_BLOCK_H > CONTENT_BOTTOM) {
        if (process.env.NODE_ENV !== "production") {
          console.warn(
            "[export-pptx] commentary overflow on slide:",
            slide.title,
            "— tune layout budgets",
          );
        }
        break;
      }
      paintCommentaryBlock(pptSlide, c, cursor);
    }
  }

  paintFooter(pptSlide, report, slide.continuation);
}

// ---------------------------------------------------------------------------
// Legacy slide builder — preserves the pre-yellowHEAD slide layouts for any
// report persisted before the format switch.
// ---------------------------------------------------------------------------

function buildLegacySlide(pres: Pptx, slide: LegacySlide, report: Report) {
  const section = slide.section;
  switch (section.id) {
    case "executive_summary":
      buildBodySlide(pres, section.title, section.body, report);
      return;
    case "kpis":
      buildKpiSlide(pres, section.title, section.kpis, report);
      return;
    case "channel_breakdown":
      buildLegacyChannelBreakdownSlide(
        pres,
        section.title,
        section.body,
        section.rows,
        report,
      );
      return;
    case "top_campaigns":
      buildLegacyTopCampaignsSlide(
        pres,
        section.title,
        section.body,
        section.rows,
        report,
      );
      return;
    case "recommendations":
      buildRecommendationsSlide(
        pres,
        section.title,
        section.body,
        section.bullets,
        report,
      );
      return;
  }
}

function buildBodySlide(pres: Pptx, title: string, body: string, report: Report) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  slide.addText(body, {
    x: PAGE_LEFT,
    y: CONTENT_START_Y,
    w: PAGE_W,
    h: 5,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 14,
    color: hex(REPORT_BRAND.textPrimary),
    valign: "top",
  });
  paintFooter(slide, report, undefined);
}

function buildKpiSlide(
  pres: Pptx,
  title: string,
  kpis: { label: string; value: string; delta: string; tone: "good" | "bad" | "neutral" }[],
  report: Report,
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);

  const cardW = 2.9;
  const cardH = 1.7;
  const startX = PAGE_LEFT;
  const y = 2.0;
  kpis.slice(0, 4).forEach((k, i) => {
    const x = startX + i * (cardW + 0.18);
    slide.addShape("rect", {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: { color: hex(REPORT_BRAND.white) },
      line: { color: "E8ECF2", width: 1 },
    });
    slide.addText(k.label.toUpperCase(), {
      x: x + 0.2,
      y: y + 0.15,
      w: cardW - 0.4,
      h: 0.3,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 9,
      bold: true,
      color: "6B7280",
    });
    slide.addText(k.value, {
      x: x + 0.2,
      y: y + 0.5,
      w: cardW - 0.4,
      h: 0.7,
      fontFace: REPORT_BRAND.fontHeader,
      fontSize: 26,
      bold: true,
      color: hex(REPORT_BRAND.textPrimary),
    });
    const tone = k.tone === "good" ? REPORT_BRAND.ua : k.tone === "bad" ? REPORT_BRAND.creative : "6B7280";
    slide.addText(k.delta, {
      x: x + 0.2,
      y: y + 1.2,
      w: cardW - 0.4,
      h: 0.3,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      bold: true,
      color: hex(tone),
    });
  });
  paintFooter(slide, report, undefined);
}

function buildLegacyChannelBreakdownSlide(
  pres: Pptx,
  title: string,
  body: string,
  rows: { channel: string; spend: string; share: string; roas: string }[],
  report: Report,
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  if (body) {
    slide.addText(body, {
      x: PAGE_LEFT,
      y: 1.55,
      w: PAGE_W,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: TEXT_SECONDARY_HEX,
    });
  }
  const colW = [3.5, 3, 2.8, 2.8];
  const tableW = sum(colW);
  const tableRows = [
    headerRow(["Channel", "Spend", "Share", "ROAS"], [
      { align: "left" },
      { align: "right" },
      { align: "right" },
      { align: "right" },
    ]),
    ...rows.map((r) => [
      bodyCell(r.channel, { bold: true }),
      bodyCell(r.spend, { align: "right" }),
      bodyCell(r.share, { align: "right" }),
      bodyCell(r.roas, { align: "right" }),
    ]),
  ];
  slide.addTable(tableRows, {
    x: PAGE_LEFT,
    y: 2.2,
    w: tableW,
    colW,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 12,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });
  paintFooter(slide, report, undefined);
}

function buildLegacyTopCampaignsSlide(
  pres: Pptx,
  title: string,
  body: string,
  rows: { name: string; channel: string; spend: string; installs: string; roas: string }[],
  report: Report,
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  if (body) {
    slide.addText(body, {
      x: PAGE_LEFT,
      y: 1.55,
      w: PAGE_W,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: TEXT_SECONDARY_HEX,
    });
  }
  const colW = [4.5, 1.6, 1.7, 1.7, 1.6];
  const tableW = sum(colW);
  const tableRows = [
    headerRow(["Campaign", "Channel", "Spend", "Installs", "ROAS"], [
      { align: "left" },
      { align: "left" },
      { align: "right" },
      { align: "right" },
      { align: "right" },
    ]),
    ...rows.map((r) => [
      bodyCell(r.name, { bold: true }),
      bodyCell(r.channel),
      bodyCell(r.spend, { align: "right" }),
      bodyCell(r.installs, { align: "right" }),
      bodyCell(r.roas, { align: "right" }),
    ]),
  ];
  slide.addTable(tableRows, {
    x: PAGE_LEFT,
    y: 2.2,
    w: tableW,
    colW,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 11,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });
  paintFooter(slide, report, undefined);
}

function buildRecommendationsSlide(
  pres: Pptx,
  title: string,
  body: string,
  bullets: string[],
  report: Report,
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);

  if (body) {
    slide.addText(body, {
      x: PAGE_LEFT,
      y: 1.55,
      w: PAGE_W,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: TEXT_SECONDARY_HEX,
    });
  }

  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: true } })),
    {
      x: PAGE_LEFT,
      y: 2.1,
      w: PAGE_W,
      h: 5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 14,
      color: hex(REPORT_BRAND.textPrimary),
      valign: "top",
    },
  );
  paintFooter(slide, report, undefined);
}

// ---------------------------------------------------------------------------
// Drawing primitives
// ---------------------------------------------------------------------------

function paintTitleBand(slide: Slide, title: string) {
  // Navy band only — no yellow accent line under the title. Accent lines
  // are a flagged anti-pattern from the pptx skill ("hallmark of AI-
  // generated slides"). The navy band against the light-surface body is
  // already a strong enough boundary.
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: TITLE_BAND_H,
    fill: { color: hex(REPORT_BRAND.navy) },
    line: { color: hex(REPORT_BRAND.navy), width: 0 },
  });
  // Title text. Leaves margin on the left for the icon-only badge column
  // and on the right for the icon+name pill.
  slide.addText(title, {
    x: PAGE_LEFT + 0.1,
    y: 0.2,
    w: PAGE_W - 3.1,
    h: 0.7,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: 22,
    bold: true,
    color: hex(REPORT_BRAND.cloud),
    valign: "middle",
  });
}

const PLATFORM_LABEL: Record<string, string> = {
  android: "ANDROID",
  ios: "IOS",
  web: "WEB",
};

const CHANNEL_LABEL: Record<string, string> = {
  meta: "META",
  google: "GOOGLE",
  tiktok: "TIKTOK",
  asa: "ASA",
  search: "SEARCH",
};

/**
 * Small pill in the top-right of every content slide showing platform +
 * channel as ICON + NAME pairs. Provides a visual anchor on text-only
 * continuation slides so they don't read as plain text on white.
 */
function paintPlatformChip(
  slide: Slide,
  platform: "android" | "ios" | "web",
  channel?: "meta" | "google" | "tiktok" | "asa" | "search",
) {
  const w = channel ? 2.4 : 1.55;
  const x = SLIDE_W - PAGE_RIGHT_MARGIN - w;
  const y = 0.3;
  const h = 0.4;
  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    fill: { color: hex(REPORT_BRAND.yellow), transparency: 78 },
    line: { color: hex(REPORT_BRAND.yellow), width: 0.5, transparency: 50 },
    rectRadius: 0.2,
  });

  // Icon-then-text layout inside the pill. Each icon sits inside a small
  // white circular backdrop so the brand colors (green Android, blue
  // Meta, multi-color Google) read instantly against the navy band /
  // yellow pill chrome. Sizes in inches.
  const badgeSize = 0.3;
  const iconSize = 0.22;
  const padLeft = 0.08;
  const badgeY = y + (h - badgeSize) / 2;
  const iconOffset = (badgeSize - iconSize) / 2;
  let cursorX = x + padLeft;

  paintIconBadge(slide, platform, cursorX, badgeY, badgeSize, iconSize, iconOffset);
  cursorX += badgeSize + 0.08;

  const platformLabel = PLATFORM_LABEL[platform] ?? platform.toUpperCase();
  const channelLabel = channel
    ? (CHANNEL_LABEL[channel] ?? channel.toUpperCase())
    : "";

  const labelW = channel ? 0.8 : w - (cursorX - x) - 0.1;
  slide.addText(platformLabel, {
    x: cursorX,
    y,
    w: labelW,
    h,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    bold: true,
    color: hex(REPORT_BRAND.yellow),
    align: "left",
    valign: "middle",
  });
  cursorX += labelW;

  if (channel) {
    slide.addText("·", {
      x: cursorX,
      y,
      w: 0.1,
      h,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 10,
      bold: true,
      color: hex(REPORT_BRAND.yellow),
      align: "center",
      valign: "middle",
    });
    cursorX += 0.1;

    paintIconBadge(slide, channel, cursorX, badgeY, badgeSize, iconSize, iconOffset);
    cursorX += badgeSize + 0.05;

    slide.addText(channelLabel, {
      x: cursorX,
      y,
      w: x + w - cursorX - 0.1,
      h,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 10,
      bold: true,
      color: hex(REPORT_BRAND.yellow),
      align: "left",
      valign: "middle",
    });
  }
}

/**
 * Paints a circular backdrop with the brand icon inside. Used by both
 * the title-band badges and the in-pill icon clusters so both surfaces
 * carry the same visual treatment.
 */
function paintIconBadge(
  slide: Slide,
  key: "android" | "ios" | "web" | "meta" | "google" | "tiktok" | "asa" | "search",
  x: number,
  y: number,
  badgeSize: number,
  iconSize: number,
  iconOffset: number,
) {
  const tone = iconBadgeTone(key);
  slide.addShape("ellipse", {
    x,
    y,
    w: badgeSize,
    h: badgeSize,
    fill: { color: tone === "black" ? hex(REPORT_BRAND.navy) : "FFFFFF" },
    line: {
      color: tone === "black" ? "FFFFFF" : "0A1428",
      width: 0.25,
      transparency: 80,
    },
  });
  slide.addImage({
    data: platformChannelDataUri(key),
    x: x + iconOffset,
    y: y + iconOffset,
    w: iconSize,
    h: iconSize,
  });
}

/**
 * Icon-only badges (vertical stack) on the left edge of the title band.
 * Mirrors the carousel SectionDivider's icon-only avatars so the deck has
 * the same dual treatment: anchor on the left (icon only), full name on
 * the right (icon + text). The y values fit inside the 1.0" title band.
 */
function paintPlatformBadges(
  slide: Slide,
  platform: "android" | "ios" | "web",
  channel?: "meta" | "google" | "tiktok" | "asa" | "search",
) {
  const items: ("android" | "ios" | "web" | "meta" | "google" | "tiktok" | "asa" | "search")[] = channel
    ? [platform, channel]
    : [platform];
  const badgeSize = 0.32;
  const iconSize = 0.22;
  const iconOffset = (badgeSize - iconSize) / 2;
  const gap = 0.06;
  const stackH = items.length * badgeSize + (items.length - 1) * gap;
  const startY = (TITLE_BAND_H - stackH) / 2;
  const x = 0.18;

  items.forEach((key, i) => {
    const y = startY + i * (badgeSize + gap);
    paintIconBadge(slide, key, x, y, badgeSize, iconSize, iconOffset);
  });
}

function paintFooter(
  slide: Slide,
  report: Report,
  continuation: ContinuationInfo | undefined,
) {
  const dateStr = new Date(report.createdAt).toLocaleDateString();
  const partLabel =
    continuation && continuation.partTotal > 1
      ? `Part ${continuation.partIndex + 1} of ${continuation.partTotal} · `
      : "";
  slide.addText(`Lumen Reports · ${report.clientLabel}`, {
    x: PAGE_LEFT,
    y: FOOTER_Y,
    w: 7,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 8,
    color: TEXT_MUTED_HEX,
  });
  slide.addText(`${partLabel}${dateStr}`, {
    x: 6.5,
    y: FOOTER_Y,
    w: 6.3,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 8,
    color: TEXT_MUTED_HEX,
    align: "right",
  });
}

function paintBullets(
  slide: Slide,
  bullets: WeeklyBullet[],
  cursor: Cursor,
) {
  bullets.forEach((b, i) => {
    const color =
      b.tone === "headline-bad"
        ? REPORT_BRAND.creative
        : b.tone === "headline-good"
          ? REPORT_BRAND.ua
          : REPORT_BRAND.textPrimary;
    slide.addText(`•  ${b.text}`, {
      x: PAGE_LEFT,
      y: cursor.y + i * BULLET_ROW_H,
      w: PAGE_W,
      h: BULLET_ROW_H,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      bold: b.tone === "headline-bad" || b.tone === "headline-good",
      color: hex(color),
      valign: "top",
    });
  });
  cursor.advance(bullets.length * BULLET_ROW_H + GAP_AFTER_BULLETS);
}

function paintCommentaryBlock(
  slide: Slide,
  c: CampaignCommentary,
  cursor: Cursor,
) {
  // Observation paragraph: bold group label + body with optional inline
  // phrase highlights. pptxgenjs accepts a text array where each chunk
  // carries its own options.
  const observationChunks = buildObservationChunks(c);
  slide.addText(observationChunks, {
    x: PAGE_LEFT,
    y: cursor.y,
    w: PAGE_W,
    h: 0.5,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    color: hex(REPORT_BRAND.textPrimary),
    valign: "top",
  });
  cursor.advance(0.55);

  // Action item: yellow pill at the left, body to its right.
  const pillW = 1.0;
  slide.addShape("roundRect", {
    x: PAGE_LEFT,
    y: cursor.y,
    w: pillW,
    h: 0.32,
    fill: { color: hex(REPORT_BRAND.yellow) },
    line: { color: hex(REPORT_BRAND.yellow), width: 0 },
    rectRadius: 0.06,
  });
  slide.addText("<> ACTION ITEM", {
    x: PAGE_LEFT,
    y: cursor.y,
    w: pillW,
    h: 0.32,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 8,
    bold: true,
    color: hex(REPORT_BRAND.navy),
    align: "center",
    valign: "middle",
  });
  slide.addText(c.actionItem, {
    x: PAGE_LEFT + pillW + 0.1,
    y: cursor.y - 0.04,
    w: PAGE_W - pillW - 0.1,
    h: 0.45,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    color: hex(REPORT_BRAND.textPrimary),
    valign: "top",
  });
  cursor.advance(0.4 + GAP_AFTER_COMMENTARY);
}

type TextChunk = { text: string; options: Record<string, unknown> };

function buildObservationChunks(c: CampaignCommentary): TextChunk[] {
  const chunks: TextChunk[] = [
    {
      text: `${c.groupLabel}: `,
      options: { bold: true, color: hex(REPORT_BRAND.textPrimary) },
    },
  ];

  if (!c.highlights || c.highlights.length === 0) {
    chunks.push({
      text: c.observation,
      options: { color: hex(REPORT_BRAND.textPrimary) },
    });
    return chunks;
  }

  // Split observation into chunks where highlighted phrases get an inline
  // color + bold treatment. Each highlight matches at most once; missing
  // phrases are skipped.
  type Part = { text: string; color?: CalloutColor };
  const parts: Part[] = [{ text: c.observation }];
  for (const h of c.highlights) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.color) continue;
      const idx = p.text.toLowerCase().indexOf(h.phrase.toLowerCase());
      if (idx === -1) continue;
      const before = p.text.slice(0, idx);
      const match = p.text.slice(idx, idx + h.phrase.length);
      const after = p.text.slice(idx + h.phrase.length);
      const next: Part[] = [];
      if (before) next.push({ text: before });
      next.push({ text: match, color: h.color });
      if (after) next.push({ text: after });
      parts.splice(i, 1, ...next);
      break;
    }
  }

  for (const part of parts) {
    if (part.color) {
      chunks.push({
        text: part.text,
        options: {
          bold: true,
          color: hex(CALLOUT_HEX[part.color]),
        },
      });
    } else {
      chunks.push({
        text: part.text,
        options: { color: hex(REPORT_BRAND.textPrimary) },
      });
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Table cell helpers
// ---------------------------------------------------------------------------

type CellOpts = {
  bold?: boolean;
  align?: "left" | "right" | "center";
  color?: string;
};

function headerRow(labels: string[], opts: { align: "left" | "right" | "center" }[]) {
  return labels.map((label, i) => ({
    text: label,
    options: {
      bold: true,
      color: hex(REPORT_BRAND.cloud),
      fill: { color: hex(REPORT_BRAND.navy) },
      align: (opts[i]?.align ?? "left") as "left" | "right" | "center",
      fontSize: 9,
      valign: "middle" as const,
    },
  }));
}

function bodyCell(text: string, opts?: CellOpts) {
  return {
    text,
    options: {
      bold: opts?.bold ?? false,
      color: hex(opts?.color ?? REPORT_BRAND.textPrimary),
      align: (opts?.align ?? "left") as "left" | "right" | "center",
      valign: "middle" as const,
    },
  };
}

/**
 * Cell with a numeric value + a colored delta arrow. Volume metrics are
 * up-good (positive delta = green up-arrow); cost metrics are down-good
 * (negative delta = green down-arrow). Cells with no delta render as a
 * plain value to keep visual noise low.
 */
function metricCell(
  m: MetricValue,
  opts: { polarity: "up-good" | "down-good"; bold?: boolean; format: (v: number | string) => string },
) {
  const valueText = opts.format(m.value);
  const chunks: TextChunk[] = [
    {
      text: valueText,
      options: {
        bold: opts.bold ?? false,
        color: hex(REPORT_BRAND.textPrimary),
      },
    },
  ];
  if (typeof m.delta === "number" && Number.isFinite(m.delta) && m.delta !== 0) {
    const up = m.delta > 0;
    const good = opts.polarity === "up-good" ? up : !up;
    const arrow = up ? " ▲ " : " ▼ ";
    chunks.push({
      text: `${arrow}${Math.abs(m.delta).toFixed(1)}%`,
      options: {
        color: good ? DELTA_GOOD_HEX : DELTA_BAD_HEX,
        bold: true,
        fontSize: 8,
      },
    });
  }
  return {
    text: chunks,
    options: {
      align: "right" as const,
      valign: "middle" as const,
    },
  };
}

function deltaCell(delta: number | null, polarity: "up-good" | "down-good") {
  if (delta === null || !Number.isFinite(delta) || delta === 0) {
    return bodyCell("—", { align: "right", color: TEXT_MUTED_HEX });
  }
  const up = delta > 0;
  const good = polarity === "up-good" ? up : !up;
  const arrow = up ? "▲" : "▼";
  return {
    text: `${arrow} ${Math.abs(delta).toFixed(1)}%`,
    options: {
      color: good ? DELTA_GOOD_HEX : DELTA_BAD_HEX,
      bold: true,
      align: "right" as const,
      valign: "middle" as const,
      fontSize: 9,
    },
  };
}

function weeklyRowToCells(r: WeeklySummaryRow, isTotal: boolean) {
  return [
    bodyCell(r.label, { bold: true }),
    metricCell(r.spend, { polarity: "up-good", bold: isTotal, format: fmtMoney }),
    metricCell(r.substart, { polarity: "up-good", bold: isTotal, format: fmtCount }),
    metricCell(r.subD0, { polarity: "up-good", bold: isTotal, format: fmtCount }),
    metricCell(r.subD7, { polarity: "up-good", bold: isTotal, format: fmtCount }),
    metricCell(r.cpSubstart, { polarity: "down-good", bold: isTotal, format: fmtMoneyExact }),
    metricCell(r.cpaD0, { polarity: "down-good", bold: isTotal, format: fmtMoneyExact }),
    metricCell(r.cpaD7, { polarity: "down-good", bold: isTotal, format: fmtMoneyExact }),
  ];
}

function historyRowToCells(r: HistoricalWeekRow) {
  return [
    bodyCell(r.label, { bold: true }),
    bodyCell(r.range, { color: TEXT_SECONDARY_HEX }),
    bodyCell(fmtMoneyShort(r.spend), { align: "right" }),
    bodyCell(r.installs.toLocaleString(), { align: "right" }),
    bodyCell(`$${r.cpi.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.substart), { align: "right" }),
    bodyCell(`$${r.cpSubstart.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.subD0), { align: "right" }),
    bodyCell(`$${r.cpaD0.toFixed(2)}`, { align: "right" }),
    bodyCell(r.subD7 === null ? "—" : String(r.subD7), {
      align: "right",
      color: r.subD7 === null ? TEXT_MUTED_HEX : undefined,
    }),
    bodyCell(r.cpaD7 === null ? "—" : `$${r.cpaD7.toFixed(2)}`, {
      align: "right",
      color: r.cpaD7 === null ? TEXT_MUTED_HEX : undefined,
    }),
  ];
}

function campaignRowToCells(r: CampaignRow) {
  return [
    bodyCell(r.campaignName, { bold: true }),
    bodyCell(fmtMoneyShort(r.spend), { align: "right" }),
    bodyCell(r.installs.toLocaleString(), { align: "right" }),
    bodyCell(`$${r.cpi.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.substart), { align: "right" }),
    bodyCell(`$${r.cpSubstart.toFixed(2)}`, { align: "right" }),
    deltaCell(r.cpSubstartDelta, "down-good"),
    bodyCell(String(r.subD0), { align: "right" }),
    bodyCell(`$${r.cpaD0.toFixed(2)}`, { align: "right" }),
    deltaCell(r.cpaD0Delta, "down-good"),
    bodyCell(r.subD7 === null ? "—" : String(r.subD7), {
      align: "right",
      color: r.subD7 === null ? TEXT_MUTED_HEX : undefined,
    }),
    bodyCell(r.cpaD7 === null ? "—" : `$${r.cpaD7.toFixed(2)}`, {
      align: "right",
      color: r.cpaD7 === null ? TEXT_MUTED_HEX : undefined,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Number formatting + small helpers
// ---------------------------------------------------------------------------

function fmtMoney(v: number | string): string {
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(2)}`;
}

function fmtMoneyExact(v: number | string): string {
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

function fmtCount(v: number | string): string {
  if (typeof v !== "number") return String(v);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString();
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtMoneyShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// Cursor — tracks the next free Y on a slide so blocks (table, bullets,
// commentary) flow vertically without each block knowing how tall its
// predecessor was.
// ---------------------------------------------------------------------------

type Cursor = {
  y: number;
  advance: (h: number) => void;
};

function makeCursor(startY: number): Cursor {
  const c: Cursor = {
    y: startY,
    advance(h: number) {
      c.y += h;
    },
  };
  return c;
}
