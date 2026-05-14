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
import { buildSlides } from "./slides";
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

const TRANSITION_MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SWIPE_THRESHOLD_PX = 50;

/**
 * Coverflow-style carousel. Each slide is absolutely positioned and gets
 * its own transform calculated from its offset to the active slide, so
 * scale, opacity and translate all animate together via a single CSS
 * transition.
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

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(m.matches);
    const handler = () => setReducedMotion(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

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
          reducedMotion={reducedMotion}
          onPeekClick={(idx) => {
            setHasInteracted(true);
            goTo(idx);
          }}
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
              key={s.kind === "section" ? s.id : "cover"}
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
  reducedMotion,
  onPeekClick,
}: {
  slides: ReturnType<typeof buildSlides>;
  activeIndex: number;
  report: Report;
  onChange: (next: Report) => void;
  readOnly?: boolean;
  reducedMotion: boolean;
  onPeekClick: (idx: number) => void;
}) {
  // We render the active card and one card on each side; everything else
  // is unmounted so the off-screen cards don't pay re-render cost.
  // Each card sits in an absolutely positioned wrapper with its own
  // transform driven by its offset to the active index.
  return (
    <div
      // The viewport reserves space for the active 16:9 card plus 8% on
      // each side so the peek tails can show without horizontal scroll.
      // Aspect-video ensures the active card stays at 16:9 across widths.
      className="relative mx-auto aspect-video w-full max-w-[1100px]"
      style={{ perspective: "1400px" }}
    >
      {slides.map((slide, i) => {
        const offset = i - activeIndex;
        // We only mount the three cards in the active band; nearby cards
        // fade/scale into view, cards further out are skipped entirely.
        if (Math.abs(offset) > 1) return null;

        const transform = transformFor(offset, reducedMotion);
        const isActive = offset === 0;

        return (
          <div
            key={slide.kind === "section" ? slide.id : "cover"}
            role="group"
            aria-roledescription="slide"
            aria-label={
              slide.kind === "cover" ? "Cover slide" : slide.label
            }
            aria-hidden={!isActive}
            className={cn(
              "absolute inset-0 origin-center overflow-hidden rounded-2xl",
              isActive ? "cursor-default" : "cursor-pointer",
            )}
            style={{
              ...transform,
              transition: reducedMotion
                ? "opacity 100ms linear"
                : `transform ${TRANSITION_MS}ms ${EASE}, opacity ${TRANSITION_MS}ms ${EASE}, filter ${TRANSITION_MS}ms ${EASE}`,
              willChange: "transform, opacity",
              zIndex: isActive ? 20 : 10 - Math.abs(offset),
              boxShadow: isActive
                ? "0 30px 80px -20px rgba(0,0,0,0.55), 0 4px 24px rgba(0,0,0,0.35)"
                : "0 12px 40px rgba(0,0,0,0.35)",
              border: "1px solid var(--surface-light-line)",
              background: "var(--surface-light-card)",
            }}
            onClick={() => {
              if (!isActive) onPeekClick(i);
            }}
            tabIndex={isActive ? 0 : -1}
          >
            <SlideCard
              slide={slide}
              report={report}
              readOnly={readOnly || !isActive}
              onChange={onChange}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Per-slide transform. Active is centered at scale 1. Peeks shift toward
 * their edge by ~60% of the card width and shrink to 0.82 / 0.45 opacity.
 * In reduced-motion mode we drop the translate + scale and just swap
 * opacity for a 100ms cross-fade.
 */
function transformFor(offset: number, reducedMotion: boolean): React.CSSProperties {
  if (reducedMotion) {
    if (offset === 0) return { opacity: 1, transform: "none" };
    return { opacity: 0, transform: "none", pointerEvents: "none" };
  }
  if (offset === 0) {
    return {
      transform: "translateX(0) scale(1)",
      opacity: 1,
      filter: "saturate(1)",
    };
  }
  // Peek cards sit ~58% of the active card's width toward their side,
  // partly clipped by the 1100px viewport edge.
  const sign = offset < 0 ? -1 : 1;
  return {
    transform: `translateX(${sign * 58}%) scale(0.82)`,
    opacity: 0.45,
    filter: "saturate(0.7)",
  };
}
