"use client";

import { Suspense } from "react";
import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { MobileNavToggle } from "./MobileNavToggle";
import { NotificationBell } from "./NotificationBell";
import { DateRangePicker } from "./DateRangePicker";
import { ClientSelector } from "./ClientSelector";

type RouteMeta = { title: string; subtitle: string; showFilters: boolean };

const ROUTE_META: { match: string; meta: RouteMeta }[] = [
  { match: "/dashboard", meta: { title: "Dashboard", subtitle: "Performance at a glance.",                                          showFilters: true  } },
  { match: "/campaigns", meta: { title: "Campaigns", subtitle: "Drill into every campaign — filtered by your global selection.",     showFilters: true  } },
  { match: "/queries",   meta: { title: "Ask Lumen", subtitle: "Plain-English questions, charts in return.",                         showFilters: true  } },
  { match: "/reports",   meta: { title: "Reports",   subtitle: "Build, share, and export client-ready summaries.",                   showFilters: true  } },
  { match: "/feed",      meta: { title: "Feed",      subtitle: "Anomalies, trends, and recommendations as they happen.",             showFilters: false } },
  { match: "/knowledge", meta: { title: "Knowledge", subtitle: "Lumen's brain — what it has learned about your accounts.",           showFilters: false } },
];

const FALLBACK: RouteMeta = {
  title: "Lumen",
  subtitle: "yellowHEAD AI",
  showFilters: false,
};

export function TopBar() {
  const pathname = usePathname();
  const meta =
    ROUTE_META.find((r) => pathname.startsWith(r.match))?.meta ?? FALLBACK;

  return (
    <header
      className="sticky top-0 z-20 flex h-16 items-center gap-3 px-4 backdrop-blur-glass md:gap-4 md:px-8"
      style={{
        background: "rgba(10, 20, 40, 0.65)",
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      <MobileNavToggle />

      <div className="min-w-0 shrink-0">
        <h1 className="truncate font-display text-md font-bold leading-none text-cloud-white">
          {meta.title}
        </h1>
        <p className="mt-1 hidden truncate text-xs text-[color:var(--text-muted)] sm:block">
          {meta.subtitle}
        </p>
      </div>

      {meta.showFilters && (
        // overflow-visible (not overflow-x-auto) — the Custom-date popover and
        // the client listbox are absolutely positioned children, and any
        // ancestor with overflow != visible becomes a clipping context that
        // hides them on open. Layout space is reserved by min-w-0 + flex-1.
        <div className="ml-4 flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 md:gap-3">
          {/* Suspense boundary required because useGlobalFilters reads
              search params, which suspend during route transitions. */}
          <Suspense fallback={null}>
            <DateRangePicker />
            <ClientSelector />
          </Suspense>
        </div>
      )}

      <div
        className={
          meta.showFilters
            ? "flex shrink-0 items-center gap-2 md:gap-3"
            : "ml-auto flex shrink-0 items-center gap-2 md:gap-3"
        }
      >
        <NotificationBell />
        <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
      </div>
    </header>
  );
}
