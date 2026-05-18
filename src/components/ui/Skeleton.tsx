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

/** Skeleton matching the SubscriberLifecycle shape (header + 3 KPI tiles
 *  + OS-mix bars + Net Sub chart). Reuses KpiCardSkeleton shape for the
 *  3 tile slots so the bounding boxes match the eventual KpiCard render. */
export function SubscriberLifecycleSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
      data-testid="lifecycle-skeleton"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-5 w-44 rounded-md" />
        <Skeleton className="h-3 w-64 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-3 w-3/4 rounded-full" />
          <Skeleton className="h-3 w-1/3 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-40 rounded-full" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton matching the PaidVsOrganic shape (header + BCAC headline
 *  on the left + paid/organic split on the right + share bar below).
 *  Reshaped post-review to mirror the two-column integrated layout
 *  the component switched to. */
export function PaidVsOrganicSkeleton() {
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
      data-testid="paid-vs-organic-skeleton"
    >
      <div className="flex items-baseline justify-between gap-2">
        <Skeleton className="h-5 w-36 rounded-md" />
        <Skeleton className="h-3 w-56 rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr] md:gap-8">
        {/* BCAC block: small label + big number + small caption */}
        <div className="flex flex-col gap-1.5 md:min-w-[180px]">
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-10 w-32 rounded-md" />
          <Skeleton className="h-3 w-28 rounded-full" />
        </div>
        {/* Split block: two labels + count + percent on each side, then bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex flex-col gap-0.5 items-start">
              <Skeleton className="h-3 w-12 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-3 w-8 rounded-full" />
            </div>
            <div className="flex flex-col gap-0.5 items-end">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-3 w-8 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
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
