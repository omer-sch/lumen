"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlideCard } from "./SlideCard";
import { buildSlides, slideAriaLabel, slideKey } from "./slides";
import type { Report } from "@/lib/reports/types";

type ReportCarouselProps = {
  report: Report;
  onChange: (next: Report) => void;
  readOnly?: boolean;
  /** Controlled active index — used by parent to remember position
   *  across view-toggles. */
  activeIndex: number;
  onActiveIndexChange: (idx: number) => void;
};

const SWIPE_THRESHOLD_PX = 50;

/**
 * Slide-based carousel. Only the active slide renders; navigation snaps
 * to the next slide with no peek or coverflow animation. The previous
 * coverflow version had the off-screen neighbors hover into the active
 * frame during transitions, which read as visual noise.
 */
export function ReportCarousel({
  report,
  onChange,
  readOnly,
  activeIndex,
  onActiveIndexChange,
}: ReportCarouselProps) {
  const slides = useMemo(() => buildSlides(report), [report]);
  const total = slides.length;

  // Clamp the active index if the slide count changes (e.g. user edits a
  // section away).
  const safeIndex = Math.min(Math.max(0, activeIndex), Math.max(0, total - 1));
  useEffect(() => {
    if (safeIndex !== activeIndex) onActiveIndexChange(safeIndex);
  }, [safeIndex, activeIndex, onActiveIndexChange]);

  const goTo = useCallback(
    (idx: number) => {
      const next = Math.min(Math.max(0, idx), total - 1);
      if (next !== safeIndex) onActiveIndexChange(next);
    },
    [safeIndex, total, onActiveIndexChange],
  );

  const prev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);
  const next = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  // ---------------------------------------------------------------------
  // Keyboard navigation. Scope to the carousel region; ignore when the
  // user is typing inside an EditableText / contenteditable surface so
  // the arrow keys still move the caret inside text.
  // ---------------------------------------------------------------------
  const regionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(total - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, goTo, total]);

  // ---------------------------------------------------------------------
  // Pointer swipe — pointer events cover touch + mouse + pen with one
  // path. We only fire a swipe once per gesture; threshold is 50px.
  // ---------------------------------------------------------------------
  const swipeRef = useRef<{ x: number; pointerId: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeRef.current = { x: e.clientX, pointerId: e.pointerId };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = swipeRef.current;
    if (!start || start.pointerId !== e.pointerId) return;
    swipeRef.current = null;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    if (dx < 0) next();
    else prev();
  };

  // First-use hint fades after the user interacts.
  const [hasInteracted, setHasInteracted] = useState(false);
  useEffect(() => {
    if (safeIndex !== 0) setHasInteracted(true);
  }, [safeIndex]);

  const regionId = useId();

  if (total === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={regionRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Report slides"
        aria-describedby={`${regionId}-hint`}
        className="relative select-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipeRef.current = null)}
      >
        <CarouselViewport
          slides={slides}
          activeIndex={safeIndex}
          report={report}
          onChange={onChange}
          readOnly={readOnly}
        />

        {/* Prev / Next buttons */}
        {safeIndex > 0 && (
          <button
            type="button"
            onClick={() => {
              setHasInteracted(true);
              prev();
            }}
            aria-label="Previous slide"
            className="absolute left-2 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full backdrop-blur transition-[transform,background-color] duration-200 hover:-translate-y-1/2 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy sm:left-4"
            style={{
              background: "rgba(13, 27, 53, 0.78)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-glass)",
            }}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
          </button>
        )}
        {safeIndex < total - 1 && (
          <button
            type="button"
            onClick={() => {
              setHasInteracted(true);
              next();
            }}
            aria-label="Next slide"
            className="absolute right-2 top-1/2 z-30 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full backdrop-blur transition-[transform,background-color] duration-200 hover:-translate-y-1/2 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy sm:right-4"
            style={{
              background: "rgba(13, 27, 53, 0.78)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-glass)",
            }}
          >
            <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-4">
        {/* Dot indicators */}
        <div className="flex items-center gap-2" role="tablist" aria-label="Slide navigation">
          {slides.map((s, i) => (
            <button
              key={slideKey(s)}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => {
                setHasInteracted(true);
                goTo(i);
              }}
              className={cn(
                "h-2 rounded-full transition-[width,background-color,opacity] duration-280 ease-out-quart",
                i === safeIndex
                  ? "w-6"
                  : "w-2 opacity-50 hover:opacity-100",
              )}
              style={{
                background:
                  i === safeIndex
                    ? "var(--color-yellow)"
                    : "var(--text-muted)",
              }}
            />
          ))}
        </div>
        <span className="font-mono text-[11px] tabular-nums text-[color:var(--text-muted)]">
          {safeIndex + 1} / {total}
        </span>
      </div>

      <p
        id={`${regionId}-hint`}
        className={cn(
          "text-center font-body text-[11px] uppercase tracking-[0.18em] transition-opacity duration-500",
          hasInteracted ? "opacity-0" : "opacity-60",
        )}
        style={{ color: "var(--text-muted)" }}
        aria-live="polite"
      >
        Use arrow keys, click the peeks, or swipe to navigate
      </p>
    </div>
  );
}

function CarouselViewport({
  slides,
  activeIndex,
  report,
  onChange,
  readOnly,
}: {
  slides: ReturnType<typeof buildSlides>;
  activeIndex: number;
  report: Report;
  onChange: (next: Report) => void;
  readOnly?: boolean;
}) {
  // Only the active slide is rendered. The previous coverflow-style
  // peek-and-slide animation made the off-screen neighbors hover into
  // the active frame, which read as visual noise during navigation.
  // Now we snap to the active slide on change.
  const active = slides[activeIndex];
  if (!active) return null;
  return (
    <div className="relative mx-auto aspect-video w-full max-w-[1100px]">
      <div
        key={slideKey(active)}
        role="group"
        aria-roledescription="slide"
        aria-label={slideAriaLabel(active)}
        className="absolute inset-0 overflow-hidden rounded-2xl"
        style={{
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.35)",
          border: "1px solid var(--surface-light-line)",
          background: "var(--surface-light-card)",
        }}
        tabIndex={0}
      >
        <SlideCard
          slide={active}
          report={report}
          readOnly={readOnly}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
