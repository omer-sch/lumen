"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { MobileNavToggle } from "./MobileNavToggle";
import { NotificationBell } from "./NotificationBell";

type RouteMeta = { title: string; subtitle: string };

const ROUTE_META: { match: string; meta: RouteMeta }[] = [
  { match: "/dashboard", meta: { title: "Dashboard", subtitle: "Performance at a glance." } },
  { match: "/queries",   meta: { title: "Ask Lumen", subtitle: "Get answers from your data — in plain English." } },
  { match: "/feed",      meta: { title: "AI Feed",   subtitle: "Anomalies, trends, and recommendations as they happen." } },
  { match: "/knowledge", meta: { title: "Knowledge", subtitle: "Lumen's brain — what it has learned about your accounts." } },
];

const FALLBACK: RouteMeta = { title: "Lumen", subtitle: "yellowHEAD AI" };

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

      <div className="min-w-0 flex-1">
        <h1 className="truncate font-display text-md font-bold leading-none text-cloud-white">
          {meta.title}
        </h1>
        <p className="mt-1 hidden truncate text-xs text-[color:var(--text-muted)] sm:block">
          {meta.subtitle}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        <NotificationBell />
        <UserButton appearance={{ elements: { avatarBox: "h-9 w-9" } }} />
      </div>
    </header>
  );
}
