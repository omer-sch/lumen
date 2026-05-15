"use client";

import { forwardRef } from "react";
import { SlideCard } from "./carousel/SlideCard";
import { buildSlides, slideKey } from "./carousel/slides";
import { DECK_DIMENSIONS } from "@/lib/reports/brand";
import type { Report } from "@/lib/reports/types";

type ReportDeckOffscreenProps = {
  report: Report;
};

/**
 * Renders every slide stacked vertically at exact deck dimensions
 * (1600 x 900). Mounted by the PDF exporter behind the visible UI so
 * html2canvas can rasterize each slide at native resolution without
 * resizing artifacts. Slides themselves are the same SlideCard the
 * visible carousel uses, so there is no second source of truth to
 * keep in sync.
 *
 * Each slide is annotated with `data-deck-slide` + a numeric
 * `data-slide-index` so the export script can iterate and capture
 * them in order.
 */
export const ReportDeckOffscreen = forwardRef<HTMLDivElement, ReportDeckOffscreenProps>(
  function ReportDeckOffscreen({ report }, ref) {
    const slides = buildSlides(report);
    return (
      <div
        ref={ref}
        aria-hidden
        data-deck-root
        style={{
          position: "fixed",
          top: -100000,
          left: 0,
          width: DECK_DIMENSIONS.width,
          pointerEvents: "none",
          zIndex: -1,
          // The off-screen tree must opt out of any ambient dark-theme
          // styling so the cards capture against the right surfaces.
          // Slides themselves carry their own backgrounds.
          background: "transparent",
        }}
      >
        {slides.map((slide, i) => (
          <div
            key={slideKey(slide)}
            data-deck-slide
            data-slide-index={i}
            style={{
              width: DECK_DIMENSIONS.width,
              height: DECK_DIMENSIONS.height,
              overflow: "hidden",
              background: "#FFFFFF",
              borderRadius: 0,
            }}
          >
            <SlideCard
              slide={slide}
              report={report}
              readOnly
              capture
            />
          </div>
        ))}
      </div>
    );
  },
);
