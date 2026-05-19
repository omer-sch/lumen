import { cn } from "@/lib/utils";

type SkeletonProps = {
  /** Tailwind utility classes (h-/w-/rounded-) for the skeleton shape. */
  className?: string;
};

/**
 * Layout-shaped placeholder that matches the size of the eventual content.
 * Use these as building blocks for KpiSkeleton / TrendChartSkeleton, never
 * a generic spinner. Shimmer animation respects prefers-reduced-motion.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

/** Skeleton matching the KpiCard shape. */
export function KpiCardSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-5"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
    >
      <Skeleton className="h-3 w-24 rounded-full" />
      <div className="flex items-baseline gap-3">
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-3 w-40 rounded-full" />
    </div>
  );
}

/** Skeleton matching the TrendChart shape. */
export function TrendChartSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 rounded-lg p-6"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
    >
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-3 w-44 rounded-full" />
        </div>
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="h-72 w-full rounded-md" />
    </div>
  );
}

/** Skeleton matching the CadenceTable shape (header + segmented toggle +
 *  6-column table). Sized so the eventual content swaps in without a
 *  vertical layout shift; row count picks "5" because that's the typical
 *  Weekly cadence for a 30-day window. */
export function CadenceTableSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
      data-testid="cadence-table-skeleton"
    >
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full rounded-full" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching the WeekendsVsWeekdays shape (header + 2 table rows
 *  on the left + share bars on the right at md+). */
export function WeekendsVsWeekdaysSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
      data-testid="weekends-skeleton"
    >
      <Skeleton className="h-5 w-44 rounded-md" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-2 min-w-[360px]">
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-2 w-3/5 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching the decomposed LifecycleTab shape: 3-tile KPI strip,
 *  then an asymmetric pair (Net Sub trend on 2/3, OS Mix donut on 1/3),
 *  then a full-width daily detail table. */
export function LifecycleSkeleton() {
  const card = {
    background: "var(--surface-glass)",
    border: "1px solid var(--border-glass)",
    WebkitBackdropFilter: "var(--blur-glass)",
    backdropFilter: "var(--blur-glass)",
    boxShadow: "var(--shadow-glass)",
  } as const;
  return (
    <div className="flex flex-col gap-6 md:gap-8" data-testid="lifecycle-skeleton">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
        {[0, 1, 2].map((i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div
          className="flex flex-col gap-3 rounded-lg p-5 lg:col-span-2"
          style={card}
        >
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-3 w-72 rounded-full" />
          <Skeleton className="h-48 w-full rounded-md" />
        </div>
        <div
          className="flex flex-col gap-3 rounded-lg p-5 lg:col-span-1"
          style={card}
        >
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3 w-56 rounded-full" />
          <div className="flex flex-col items-center gap-3 py-4">
            <Skeleton className="h-32 w-32 rounded-full" />
            <Skeleton className="h-3 w-40 rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg p-5" style={card}>
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-3 w-72 rounded-full" />
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching the redesigned AttributionTab shape: BCAC hero,
 *  donut-led PaidVsOrganic card, then the data-freshness compact card,
 *  then a 3-column coverage warnings row. */
export function AttributionSkeleton() {
  const card = {
    background: "var(--surface-glass)",
    border: "1px solid var(--border-glass)",
    WebkitBackdropFilter: "var(--blur-glass)",
    backdropFilter: "var(--blur-glass)",
    boxShadow: "var(--shadow-glass)",
  } as const;
  return (
    <div className="flex flex-col gap-6 md:gap-8" data-testid="attribution-skeleton">
      {/* Row 1 — BCAC hero (full width) */}
      <div className="flex flex-col gap-4 rounded-lg p-6" style={card}>
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-12 w-48 rounded-md" />
        <Skeleton className="h-3 w-3/4 rounded-full" />
      </div>

      {/* Row 2 — Paid vs Organic donut + stat rows on the right */}
      <div className="flex flex-col gap-5 rounded-lg p-6" style={card}>
        <Skeleton className="h-4 w-36 rounded-md" />
        <Skeleton className="h-3 w-72 rounded-full" />
        <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_1fr] md:gap-10">
          <Skeleton className="mx-auto h-48 w-48 rounded-full md:mx-0 md:h-56 md:w-56" />
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-baseline justify-between gap-3 pb-2">
                <Skeleton className="h-3 w-20 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-md" />
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>

      {/* Row 3 — DataFreshness compact card */}
      <div className="flex flex-col gap-3 rounded-lg p-5" style={card}>
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-3 w-48 rounded-full" />
        <Skeleton className="h-3 w-2/3 rounded-full" />
      </div>

      {/* Row 4 — coverage warnings (last) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-lg p-5" style={card}>
            <Skeleton className="h-4 w-2/3 rounded-md" />
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-3/4 rounded-full" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


/** Skeleton matching the CampaignsTable shape (channel-chip strip + a
 *  9-column table). Row count picks 8 — typical mid-range for a UA pilot
 *  client across a 30-day window. */
export function CampaignsTableSkeleton() {
  return (
    <div
      className="flex flex-col gap-5 rounded-lg p-5"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
      data-testid="campaigns-table-skeleton"
    >
      <div className="flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 w-20 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-3 w-28 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full rounded-full" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-5 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching the Creative Breakdown view (header + 6 chip
 *  placeholders + top-ad trend chart + 10-row 12-column table).
 *  Sized so the eventual content swaps in without a vertical layout
 *  shift; 10 rows is the lower mid-range we expect once filters narrow. */
export function CreativeBreakdownSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 py-2"
      data-testid="creative-breakdown-skeleton"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-7 w-72 rounded-md" />
        <Skeleton className="h-3 w-96 rounded-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>
      <TrendChartSkeleton />
      <div
        className="flex flex-col gap-2 rounded-lg p-4"
        style={{
          background: "var(--surface-glass)",
          border: "1px solid var(--border-glass)",
          WebkitBackdropFilter: "var(--blur-glass)",
          backdropFilter: "var(--blur-glass)",
          boxShadow: "var(--shadow-glass)",
        }}
      >
        <Skeleton className="h-3 w-full rounded-full" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <Skeleton key={i} className="h-5 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching the Geo Breakdown view (header + Phase-2 callout
 *  + donut/map split row + color scale + ~10-row 6-column table).
 *  Map slot uses an 800x460 aspect ratio so the SVG swap-in doesn't
 *  shift the layout. */
export function GeoBreakdownSkeleton() {
  const card = {
    background: "var(--surface-glass)",
    border: "1px solid var(--border-glass)",
    WebkitBackdropFilter: "var(--blur-glass)",
    backdropFilter: "var(--blur-glass)",
    boxShadow: "var(--shadow-glass)",
  } as const;
  return (
    <div className="flex flex-col gap-6 py-2" data-testid="geo-breakdown-skeleton">
      <Skeleton className="h-12 w-full rounded-md" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-lg p-4 lg:col-span-1" style={card}>
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-48 rounded-full" />
          <div className="grid place-items-center py-3">
            <Skeleton className="h-44 w-44 rounded-full" />
          </div>
        </div>
        <div
          className="flex flex-col gap-3 rounded-lg p-4 lg:col-span-2"
          style={card}
        >
          <Skeleton className="h-4 w-44 rounded-md" />
          <Skeleton className="h-3 w-64 rounded-full" />
          <Skeleton className="w-full rounded-md" />
          <div
            className="w-full rounded-md"
            style={{ aspectRatio: "800 / 460" }}
          >
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[480px]">
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>
      <div className="flex flex-col gap-2 rounded-lg p-4" style={card}>
        <Skeleton className="h-3 w-full rounded-full" />
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
          <Skeleton key={i} className="h-5 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/** Skeleton matching a feed row. */
export function FeedRowSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-5"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-4 w-20 rounded-full" />
        <Skeleton className="ml-auto h-3 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4 rounded-md" />
      <Skeleton className="h-3 w-full rounded-full" />
      <Skeleton className="h-3 w-5/6 rounded-full" />
    </div>
  );
}
