// Thin carousel-side facade over the shared layout step. The on-screen
// carousel, the off-screen capture deck, and the PPTX exporter all walk
// the same list returned by `layoutSlides` so a long section splits the
// same way everywhere. See `src/lib/reports/layout.ts` for the budgets.
import { layoutSlides, type LaidOutSlide } from "@/lib/reports/layout";
import type { Report } from "@/lib/reports/types";

export type Slide = LaidOutSlide;

export function buildSlides(report: Report): Slide[] {
  return layoutSlides(report);
}

/** Stable React key for any slide. Cover has no id of its own, so we use
 *  a constant; content slides carry the id baked in by the layout step. */
export function slideKey(slide: Slide): string {
  if (slide.kind === "cover") return "cover";
  return slide.slide.id;
}

/** ARIA label for a slide. Cover gets "Cover slide"; everything else uses
 *  the (possibly "(cont.)"-appended) title. */
export function slideAriaLabel(slide: Slide): string {
  if (slide.kind === "cover") return "Cover slide";
  return slide.slide.title;
}
