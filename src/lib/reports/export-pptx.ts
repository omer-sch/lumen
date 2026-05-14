"use client";

import { REPORT_BRAND, reportFilename } from "./brand";
import type {
  CampaignRow,
  ChannelCampaignSection,
  ChannelWeeklySection,
  HistoricalWeekRow,
  PlatformOverallSection,
  Report,
  ReportSection,
  WeeklySummaryRow,
} from "./types";

/**
 * Renders the report as a pptxgenjs deck. One slide per renderable
 * section, plus a dark navy cover. Tables are real PPTX tables (not
 * images) so the client can edit them in PowerPoint or Keynote.
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

  buildCoverSlide(pres, report);

  for (const section of report.sections) {
    buildSectionSlide(pres, section);
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
// Type alias for the pptxgenjs runtime instance. We dynamic-import the
// module so it doesn't ship in the main bundle; `typeof import(...)` reads
// the module's static types without forcing a runtime import.
// ---------------------------------------------------------------------------

type Pptx = InstanceType<(typeof import("pptxgenjs"))["default"]>;

const hex = (c: string) => c.replace("#", "");

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

function buildCoverSlide(pres: Pptx, report: Report) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.navy) };

  // Lumen mark + wordmark
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
    y: 0.8,
    w: 3,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 8,
    color: "BFC7D6",
    charSpacing: 4,
  });

  // Eyebrow
  slide.addText("WEEKLY REVIEW", {
    x: 0.6,
    y: 3.2,
    w: 4,
    h: 0.35,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    bold: true,
    color: hex(REPORT_BRAND.yellow),
    charSpacing: 6,
  });

  // Title
  slide.addText(report.title, {
    x: 0.6,
    y: 3.6,
    w: 12,
    h: 1.6,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: 44,
    bold: true,
    color: hex(REPORT_BRAND.cloud),
  });

  // Subtitle
  slide.addText(`${report.clientLabel}  ·  ${report.period}`, {
    x: 0.6,
    y: 5.4,
    w: 12,
    h: 0.5,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 16,
    bold: true,
    color: hex(REPORT_BRAND.yellow),
  });

  // Footer
  slide.addText("Lumen Reports", {
    x: 0.6,
    y: 6.9,
    w: 6,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: "BFC7D6",
    charSpacing: 4,
  });
  slide.addText(new Date(report.createdAt).toLocaleDateString(), {
    x: 7.3,
    y: 6.9,
    w: 5.5,
    h: 0.3,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: "BFC7D6",
    align: "right",
    charSpacing: 4,
  });
}

// ---------------------------------------------------------------------------
// Section dispatch
// ---------------------------------------------------------------------------

function buildSectionSlide(pres: Pptx, section: ReportSection) {
  switch (section.id) {
    case "platform_overall":
      return buildPlatformOverallSlide(pres, section);
    case "channel_weekly":
      return buildChannelWeeklySlide(pres, section);
    case "channel_campaign":
      return buildChannelCampaignSlide(pres, section);
    case "executive_summary":
      return buildBodySlide(pres, section.title, section.body);
    case "kpis":
      return buildKpiSlide(pres, section.title, section.kpis);
    case "channel_breakdown":
      return buildLegacyChannelBreakdownSlide(pres, section.title, section.body, section.rows);
    case "top_campaigns":
      return buildLegacyTopCampaignsSlide(pres, section.title, section.body, section.rows);
    case "recommendations":
      return buildRecommendationsSlide(pres, section.title, section.body, section.bullets);
  }
}

// ---------------------------------------------------------------------------
// yellowHEAD format slides
// ---------------------------------------------------------------------------

function buildPlatformOverallSlide(pres: Pptx, section: PlatformOverallSection) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, section.title);

  const rows = [...section.summary.rows, section.summary.total];
  const header: string[] = [
    "Channel",
    "Spend",
    "SubStart",
    "Sub D0",
    "Sub D7",
    "CP SubStart",
    "CPA D0",
    "CPA D7",
  ];
  const tableRows = [
    headerRow(header),
    ...rows.map((r, i) => weeklyRowToCells(r, i === rows.length - 1)),
  ];
  slide.addTable(tableRows, {
    x: 0.6,
    y: 1.55,
    w: 12.1,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });

  paintBullets(slide, section.bullets, 5.0);
}

function buildChannelWeeklySlide(pres: Pptx, section: ChannelWeeklySection) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, section.title);

  const header: string[] = [
    "",
    "Spend",
    "SubStart",
    "Sub D0",
    "Sub D7",
    "CP SubStart",
    "CPA D0",
    "CPA D7",
  ];
  const currentRow: WeeklySummaryRow = section.currentWeek;
  const tableRows = [
    headerRow(header),
    weeklyRowToCells({ ...currentRow, label: "This week" }, false),
  ];
  slide.addTable(tableRows, {
    x: 0.6,
    y: 1.55,
    w: 12.1,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 10,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });

  if (section.history.length > 0) {
    const historyHeader = [
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
    ];
    const historyRows = section.history.map(historyRowToCells);
    slide.addTable([headerRow(historyHeader), ...historyRows], {
      x: 0.6,
      y: 3.0,
      w: 12.1,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 9,
      color: hex(REPORT_BRAND.textPrimary),
      border: { type: "solid", pt: 0.5, color: "E8ECF2" },
    });
  }

  paintBullets(slide, section.bullets, 5.6);
}

function buildChannelCampaignSlide(pres: Pptx, section: ChannelCampaignSection) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, section.title);

  const header: string[] = [
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
  ];
  const tableRows = [headerRow(header), ...section.rows.map(campaignRowToCells)];
  slide.addTable(tableRows, {
    x: 0.6,
    y: 1.55,
    w: 12.1,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 9,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });

  // Commentary block at the bottom of the slide.
  let y = 4.6;
  for (const c of section.commentary) {
    slide.addText(
      [
        {
          text: `${c.groupLabel}: `,
          options: { bold: true, color: hex(REPORT_BRAND.textPrimary) },
        },
        { text: c.observation, options: { color: hex(REPORT_BRAND.textPrimary) } },
      ],
      {
        x: 0.6,
        y,
        w: 12.1,
        h: 0.35,
        fontFace: REPORT_BRAND.fontBody,
        fontSize: 10,
      },
    );
    y += 0.35;
    slide.addShape("rect", {
      x: 0.6,
      y: y + 0.05,
      w: 0.95,
      h: 0.28,
      fill: { color: hex(REPORT_BRAND.yellow) },
      line: { color: hex(REPORT_BRAND.yellow), width: 0 },
    });
    slide.addText("<> Action Item", {
      x: 0.6,
      y: y + 0.05,
      w: 0.95,
      h: 0.28,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 8,
      bold: true,
      color: hex(REPORT_BRAND.navy),
      align: "center",
      valign: "middle",
    });
    slide.addText(c.actionItem, {
      x: 1.65,
      y: y + 0.05,
      w: 11.05,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 10,
      color: hex(REPORT_BRAND.textPrimary),
    });
    y += 0.65;
  }
}

// ---------------------------------------------------------------------------
// Legacy format slides
// ---------------------------------------------------------------------------

function buildBodySlide(pres: Pptx, title: string, body: string) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  slide.addText(body, {
    x: 0.6,
    y: 1.7,
    w: 12.1,
    h: 5,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 14,
    color: hex(REPORT_BRAND.textPrimary),
    valign: "top",
  });
}

function buildKpiSlide(
  pres: Pptx,
  title: string,
  kpis: { label: string; value: string; delta: string; tone: "good" | "bad" | "neutral" }[],
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);

  const cardW = 2.9;
  const cardH = 1.7;
  const startX = 0.6;
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
      charSpacing: 4,
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
}

function buildLegacyChannelBreakdownSlide(
  pres: Pptx,
  title: string,
  body: string,
  rows: { channel: string; spend: string; share: string; roas: string }[],
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  if (body) {
    slide.addText(body, {
      x: 0.6,
      y: 1.55,
      w: 12.1,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: "55617A",
    });
  }
  const tableRows = [
    headerRow(["Channel", "Spend", "Share", "ROAS"]),
    ...rows.map((r) => [
      bodyCell(r.channel, { bold: true }),
      bodyCell(r.spend, { align: "right" }),
      bodyCell(r.share, { align: "right" }),
      bodyCell(r.roas, { align: "right" }),
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.6,
    y: 2.2,
    w: 12.1,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 12,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });
}

function buildLegacyTopCampaignsSlide(
  pres: Pptx,
  title: string,
  body: string,
  rows: { name: string; channel: string; spend: string; installs: string; roas: string }[],
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);
  if (body) {
    slide.addText(body, {
      x: 0.6,
      y: 1.55,
      w: 12.1,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: "55617A",
    });
  }
  const tableRows = [
    headerRow(["Campaign", "Channel", "Spend", "Installs", "ROAS"]),
    ...rows.map((r) => [
      bodyCell(r.name, { bold: true }),
      bodyCell(r.channel),
      bodyCell(r.spend, { align: "right" }),
      bodyCell(r.installs, { align: "right" }),
      bodyCell(r.roas, { align: "right" }),
    ]),
  ];
  slide.addTable(tableRows, {
    x: 0.6,
    y: 2.2,
    w: 12.1,
    fontFace: REPORT_BRAND.fontBody,
    fontSize: 11,
    color: hex(REPORT_BRAND.textPrimary),
    border: { type: "solid", pt: 0.5, color: "E8ECF2" },
  });
}

function buildRecommendationsSlide(
  pres: Pptx,
  title: string,
  body: string,
  bullets: string[],
) {
  const slide = pres.addSlide();
  slide.background = { color: hex(REPORT_BRAND.lightSurface) };
  paintTitleBand(slide, title);

  if (body) {
    slide.addText(body, {
      x: 0.6,
      y: 1.55,
      w: 12.1,
      h: 0.5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      color: "55617A",
    });
  }

  slide.addText(
    bullets.map((b) => ({ text: b, options: { bullet: true } })),
    {
      x: 0.6,
      y: 2.1,
      w: 12.1,
      h: 5,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 14,
      color: hex(REPORT_BRAND.textPrimary),
      valign: "top",
    },
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function paintTitleBand(slide: ReturnType<Pptx["addSlide"]>, title: string) {
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.333,
    h: 1.0,
    fill: { color: hex(REPORT_BRAND.navy) },
    line: { color: hex(REPORT_BRAND.navy), width: 0 },
  });
  slide.addShape("rect", {
    x: 0,
    y: 1.0,
    w: 13.333,
    h: 0.06,
    fill: { color: hex(REPORT_BRAND.yellow) },
    line: { color: hex(REPORT_BRAND.yellow), width: 0 },
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.2,
    w: 12.1,
    h: 0.7,
    fontFace: REPORT_BRAND.fontHeader,
    fontSize: 22,
    bold: true,
    color: hex(REPORT_BRAND.cloud),
    valign: "middle",
  });
}

function paintBullets(
  slide: ReturnType<Pptx["addSlide"]>,
  bullets: { text: string; tone?: "headline-bad" | "headline-good" | "neutral" }[],
  y: number,
) {
  bullets.forEach((b, i) => {
    const color =
      b.tone === "headline-bad"
        ? REPORT_BRAND.creative
        : b.tone === "headline-good"
          ? REPORT_BRAND.ua
          : REPORT_BRAND.textPrimary;
    slide.addText(`•  ${b.text}`, {
      x: 0.6,
      y: y + i * 0.32,
      w: 12.1,
      h: 0.3,
      fontFace: REPORT_BRAND.fontBody,
      fontSize: 11,
      bold: b.tone === "headline-bad" || b.tone === "headline-good",
      color: hex(color),
    });
  });
}

function headerRow(labels: string[]) {
  return labels.map((label) => ({
    text: label,
    options: {
      bold: true,
      color: hex(REPORT_BRAND.cloud),
      fill: { color: hex(REPORT_BRAND.navy) },
      align: "left" as const,
      fontSize: 9,
      charSpacing: 4,
    },
  }));
}

function bodyCell(
  text: string,
  opts?: { bold?: boolean; align?: "left" | "right" | "center" },
) {
  return {
    text,
    options: {
      bold: opts?.bold ?? false,
      color: hex(REPORT_BRAND.textPrimary),
      align: opts?.align ?? "left",
    },
  };
}

function weeklyRowToCells(r: WeeklySummaryRow, isTotal: boolean) {
  const fmt = (n: number | string) =>
    typeof n === "number"
      ? n >= 1000
        ? `$${Math.round(n).toLocaleString()}`
        : n.toFixed(2)
      : String(n);
  return [
    bodyCell(r.label, { bold: true }),
    bodyCell(fmt(r.spend.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.substart.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.subD0.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.subD7.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.cpSubstart.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.cpaD0.value), { align: "right", bold: isTotal }),
    bodyCell(fmt(r.cpaD7.value), { align: "right", bold: isTotal }),
  ];
}

function historyRowToCells(r: HistoricalWeekRow) {
  return [
    bodyCell(r.label, { bold: true }),
    bodyCell(r.range),
    bodyCell(formatMoneyShort(r.spend), { align: "right" }),
    bodyCell(r.impressions.toLocaleString(), { align: "right" }),
    bodyCell(`$${r.cpi.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.substart), { align: "right" }),
    bodyCell(`$${r.cpSubstart.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.subD0), { align: "right" }),
    bodyCell(`$${r.cpaD0.toFixed(2)}`, { align: "right" }),
    bodyCell(r.subD7 === null ? "—" : String(r.subD7), { align: "right" }),
    bodyCell(r.cpaD7 === null ? "—" : `$${r.cpaD7.toFixed(2)}`, { align: "right" }),
  ];
}

function campaignRowToCells(r: CampaignRow) {
  return [
    bodyCell(r.campaignName, { bold: true }),
    bodyCell(formatMoneyShort(r.spend), { align: "right" }),
    bodyCell(r.installs.toLocaleString(), { align: "right" }),
    bodyCell(`$${r.cpi.toFixed(2)}`, { align: "right" }),
    bodyCell(String(r.substart), { align: "right" }),
    bodyCell(`$${r.cpSubstart.toFixed(2)}`, { align: "right" }),
    bodyCell(`${r.cpSubstartDelta.toFixed(1)}%`, { align: "right" }),
    bodyCell(String(r.subD0), { align: "right" }),
    bodyCell(`$${r.cpaD0.toFixed(2)}`, { align: "right" }),
    bodyCell(`${r.cpaD0Delta.toFixed(1)}%`, { align: "right" }),
    bodyCell(r.subD7 === null ? "—" : String(r.subD7), { align: "right" }),
    bodyCell(r.cpaD7 === null ? "—" : `$${r.cpaD7.toFixed(2)}`, { align: "right" }),
  ];
}

function formatMoneyShort(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}
