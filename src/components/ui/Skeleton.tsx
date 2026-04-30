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
