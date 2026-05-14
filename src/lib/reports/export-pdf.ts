"use client";

import { DECK_DIMENSIONS, reportFilename } from "./brand";
import type { Report } from "./types";

/**
 * Captures every `[data-deck-slide]` inside the given root element with
 * html2canvas and assembles a 16:9 landscape PDF — one page per slide.
 *
 * The caller is responsible for mounting `<ReportDeckOffscreen report=...>`
 * (or any equivalent off-screen tree) and passing its DOM node here.
 * That separation keeps the export idempotent and lets React control
 * the mount lifecycle.
 */
export async function exportReportAsPdf(
  report: Report,
  root: HTMLElement,
): Promise<void> {
  // Lazy-load the heavy libs so they don't ship in the main bundle.
  const [{ default: html2canvas }, jsPDFModule] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const JsPDF = jsPDFModule.jsPDF;

  const slides = Array.from(
    root.querySelectorAll<HTMLElement>("[data-deck-slide]"),
  ).sort(
    (a, b) =>
      Number(a.dataset.slideIndex ?? 0) - Number(b.dataset.slideIndex ?? 0),
  );

  if (slides.length === 0) {
    throw new Error("No slides found in deck root");
  }

  // 16:9 landscape custom format in pixels so the deck dimensions map
  // 1:1 with the captured canvas.
  const doc = new JsPDF({
    orientation: "landscape",
    unit: "px",
    format: [DECK_DIMENSIONS.width, DECK_DIMENSIONS.height],
    compress: true,
  });

  for (let i = 0; i < slides.length; i++) {
    const node = slides[i];
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#FFFFFF",
      useCORS: true,
      logging: false,
      // Match the node's own dimensions so html2canvas doesn't try to
      // capture document.documentElement bounds.
      width: DECK_DIMENSIONS.width,
      height: DECK_DIMENSIONS.height,
      windowWidth: DECK_DIMENSIONS.width,
      windowHeight: DECK_DIMENSIONS.height,
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    if (i > 0) doc.addPage([DECK_DIMENSIONS.width, DECK_DIMENSIONS.height], "landscape");
    doc.addImage(
      dataUrl,
      "JPEG",
      0,
      0,
      DECK_DIMENSIONS.width,
      DECK_DIMENSIONS.height,
      undefined,
      "FAST",
    );
  }

  doc.save(
    reportFilename({
      client: report.clientLabel,
      period: report.period,
      title: report.title,
      ext: "pdf",
    }),
  );
}
