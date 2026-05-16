"use client";

import { cn } from "@/lib/utils";
import { AgentByline } from "@/components/agents/AgentByline";
import { formatWeekRange, isoWeek } from "@/lib/reports/week";
import { REPORT_BRAND } from "@/lib/reports/brand";
import { coverTitleSizing } from "@/lib/reports/layout";
import type { Report } from "@/lib/reports/types";
import { EditableText } from "./EditableText";
import { SampleDataBanner } from "./SampleDataBanner";

type ReportCoverHeaderProps = {
  report: Report;
  /** "document" renders the cover inside the light report card.
   *  "carousel" renders it inside the dark 16:9 cover slide. The
   *  elements present and their order do not differ between the two;
   *  only scale and palette change. */
  viewMode: "document" | "carousel";
  readOnly?: boolean;
  /** When provided, the title is contentEditable in place. */
  onTitleChange?: (next: string) => void;
};

/**
 * Shared cover identity for the Reports surface. Both views render the
 * same six elements in the same order: brand mark, "Weekly review"
 * pill, title, client + period subtitle, Nova byline, sample-data
 * banner. The component scales typography for the surface it sits on
 * but never changes the elements present.
 */
export function ReportCoverHeader({
  report,
  viewMode,
  readOnly,
  onTitleChange,
}: ReportCoverHeaderProps) {
  const isCarousel = viewMode === "carousel";

  // Best-effort week + date range. We parse the persisted period back
  // out so a saved report still renders sensibly even if the raw Date
  // values aren't on the report anymore.
  const created = new Date(report.createdAt);
  const week = isoWeek(created);
  const subtitleRange = report.period.includes(" – ")
    ? report.period
    : formatWeekRange(new Date(report.createdAt - 6 * 86400000), created);
  const clientSubtitle = `${report.clientLabel} · ${subtitleRange}`;

  return (
    <div className={cn("flex flex-col", isCarousel ? "gap-5" : "gap-3")}>
      {/* 1. Brand mark + product name */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "grid place-items-center rounded-md font-display font-extrabold",
            isCarousel ? "h-10 w-10 text-xl" : "h-9 w-9 text-lg",
          )}
          style={{
            background: isCarousel
              ? `linear-gradient(135deg, ${REPORT_BRAND.yellow} 0%, ${REPORT_BRAND.yellowLight} 100%)`
              : "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
            color: isCarousel ? REPORT_BRAND.navy : "var(--color-navy)",
            boxShadow: isCarousel
              ? "0 0 24px rgba(255,221,12,0.25)"
              : "0 0 18px color-mix(in oklab, var(--color-yellow) 40%, transparent)",
          }}
        >
          L
        </span>
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-display font-bold tracking-tight",
              isCarousel ? "text-base" : "text-sm",
            )}
            style={{
              color: isCarousel ? REPORT_BRAND.white : "var(--text-light-primary)",
            }}
          >
            Lumen
          </span>
          <span
            className={cn(
              "uppercase tracking-[0.2em] text-[10px]",
              isCarousel ? "text-white/60" : "text-[color:var(--text-light-muted)]",
            )}
          >
            yellowHEAD AI
          </span>
        </div>
        {!isCarousel && (
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
            {report.clientLabel} · Week {week}
          </span>
        )}
      </div>

      {/* 2. "Weekly review" pill */}
      <span
        className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider"
        style={
          isCarousel
            ? {
                background: "rgba(255,221,12,0.12)",
                color: REPORT_BRAND.yellow,
                border: "1px solid rgba(255,221,12,0.3)",
              }
            : {
                background: "var(--tint-yellow-soft)",
                color: "var(--color-yellow-deep)",
                border:
                  "1px solid color-mix(in oklab, var(--color-yellow) 45%, transparent)",
              }
        }
      >
        Weekly review
      </span>

      {/* 3. Title (editable on both surfaces when onTitleChange is provided).
       *    On the carousel cover the type scales down for long titles so a
       *    legitimate-but-long title doesn't run off the cover. The
       *    document view keeps its scale; that surface scrolls. */}
      {(() => {
        const carouselTitleClass = isCarousel
          ? coverTitleSizing(report.title).classFragment
          : "";
        if (readOnly || !onTitleChange) {
          return (
            <h1
              className={cn(
                "font-display font-extrabold leading-tight tracking-tight",
                isCarousel ? carouselTitleClass : "text-3xl sm:text-4xl",
              )}
              style={{
                color: isCarousel
                  ? REPORT_BRAND.white
                  : "var(--text-light-primary)",
              }}
            >
              {report.title}
            </h1>
          );
        }
        return (
          <EditableText
            value={report.title}
            onChange={onTitleChange}
            ariaLabel="Report title"
            tone={isCarousel ? "dark" : "light"}
            className={cn(
              "font-display font-extrabold leading-tight tracking-tight",
              isCarousel
                ? `${carouselTitleClass} text-cloud-white`
                : "text-3xl sm:text-4xl text-[color:var(--text-light-primary)]",
            )}
          />
        );
      })()}

      {/* 4. Client + period subtitle (+ filter range when narrowed) */}
      <div className="flex flex-col gap-1">
        <p
          className={cn(
            "font-body",
            isCarousel ? "text-lg font-semibold" : "text-sm",
          )}
          style={{
            color: isCarousel ? REPORT_BRAND.yellow : "var(--text-light-secondary)",
          }}
        >
          {clientSubtitle}
        </p>
        {report.filterRange && (
          <p
            className={cn(
              "font-body",
              isCarousel ? "text-xs text-white/55" : "text-[11px] text-[color:var(--text-light-muted)]",
            )}
          >
            Filter: {report.filterRange}
          </p>
        )}
        {report.preparedFor && (
          <p
            className={cn(
              "font-body",
              isCarousel ? "text-xs text-white/55" : "text-[11px] text-[color:var(--text-light-muted)]",
            )}
          >
            Prepared for {report.preparedFor}
          </p>
        )}
      </div>

      {/* 5. Author byline */}
      <AgentByline
        agentId={report.authoredBy ?? "nova"}
        prefix="Drafted by"
        size="md"
        tone={isCarousel ? "dark" : "light"}
        className={isCarousel ? "mt-1" : "pt-1"}
      />

      {/* 6. Sample-data disclosure banner */}
      <SampleDataBanner tone={isCarousel ? "dark" : "light"} className="mt-1" />
    </div>
  );
}
