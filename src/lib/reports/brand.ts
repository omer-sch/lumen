/**
 * Shared brand tokens for exported reports (PDF + PPTX). Keep these
 * mirrored with the canonical CSS variables in `src/app/globals.css` so
 * the on-screen carousel and the off-screen / PPTX render stay aligned.
 *
 * Why duplicate the tokens here? The exporters can't read CSS variables
 * from a document context (jsPDF and pptxgenjs are pure JS / Canvas),
 * and the off-screen render container is built independent of the live
 * document's theme.
 */
export const REPORT_BRAND = {
  navy: "#0A1428",
  navyCard: "#0D1B35",
  yellow: "#FFDD0C",
  yellowLight: "#FFE85C",
  cloud: "#FAFAFA",
  white: "#FFFFFF",
  lightSurface: "#FAFAFA",
  lightSurfaceCard: "#FFFFFF",
  lightLine: "#E8ECF2",
  textPrimary: "#0A1428",
  textSecondary: "rgba(10, 20, 40, 0.65)",
  textMuted: "rgba(10, 20, 40, 0.4)",
  // Team accents — used for KPI deltas and callouts.
  ua: "#54F0A3",
  creative: "#F88673",
  organic: "#926FDE",
  // Fonts: pptxgenjs ships no fonts so we always supply a sensible
  // system fallback that will render close to the brand on Windows
  // and macOS without surprises.
  fontHeader: "Bricolage Grotesque",
  fontBody: "Montserrat",
  headerFallback: "Calibri",
  bodyFallback: "Arial",
} as const;

/** Deck dimensions used by both the off-screen renderer and the PDF
 *  export. 16:9 landscape, 1600 x 900 logical pixels — large enough
 *  to look sharp when rasterized at 2x for retina PDFs. */
export const DECK_DIMENSIONS = {
  width: 1600,
  height: 900,
  // pptxgenjs uses inches by default for standard 16:9 widescreen
  // (13.333 x 7.5 in). We rely on that default layout in the PPTX
  // exporter and only need the px dimensions for the HTML capture.
} as const;

/** File-system-safe filename slug for exports. */
export function reportFilename(parts: {
  client: string;
  period: string;
  title: string;
  ext: "pdf" | "pptx";
}): string {
  const safe = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  const stem = [safe(parts.client), safe(parts.period), safe(parts.title)]
    .filter(Boolean)
    .join("__");
  return `${stem || "lumen_report"}.${parts.ext}`;
}
