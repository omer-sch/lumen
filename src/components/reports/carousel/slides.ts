import type { Report, ReportSection } from "@/lib/reports/types";

export type CoverSlide = { kind: "cover"; title: string; subtitle: string };

export type SectionSlide = {
  kind: "section";
  /** Stable id for keys + a11y labels. */
  id: string;
  /** Used as the slide aria-label and the slide header in the off-screen
   *  renderer / PPTX. */
  label: string;
  section: ReportSection;
};

export type Slide = CoverSlide | SectionSlide;

/**
 * Build the ordered slide list from a report. Empty sections are dropped
 * so a generator that omits a renderer (yellowHEAD format, currently no
 * recommendations card) doesn't leave a blank slide behind.
 */
export function buildSlides(report: Report): Slide[] {
  const slides: Slide[] = [
    {
      kind: "cover",
      title: report.title,
      subtitle: `${report.clientLabel} · ${report.period}`,
    },
  ];

  for (const section of report.sections) {
    if (!isSectionRenderable(section)) continue;
    slides.push({
      kind: "section",
      id: `${section.id}-${slides.length}`,
      label: slideLabelFor(section),
      section,
    });
  }

  return slides;
}

function isSectionRenderable(section: ReportSection): boolean {
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
      return Boolean(section.currentWeek || section.bullets.length);
    case "channel_campaign":
      return Boolean(section.rows.length);
    default:
      return false;
  }
}

function slideLabelFor(section: ReportSection): string {
  // Prefer the explicit title set by the generator.
  if ("title" in section && section.title) return section.title;
  return section.id;
}
