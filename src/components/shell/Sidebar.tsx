"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  FileText,
  Film,
  Globe,
  Sparkles,
  Bot,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dispatchSidebar, listenSidebarToggle } from "./MobileNavToggle";
import { LivePulse } from "@/components/ui/LivePulse";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

const NAV: NavItem[] = [
  { href: "/dashboard",          label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns",          label: "Campaigns", icon: Megaphone },
  { href: "/campaigns/creatives", label: "Creatives", icon: Film },
  { href: "/campaigns/geo",      label: "Geo",       icon: Globe },
  { href: "/queries",            label: "Ask",       icon: MessagesSquare, badge: "new" },
  { href: "/reports",            label: "Reports",   icon: FileText },
  { href: "/feed",               label: "Feed",      icon: Sparkles },
  { href: "/agents",             label: "Agents",    icon: Bot },
  { href: "/knowledge",          label: "Knowledge", icon: BookOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => listenSidebarToggle(setMobileOpen), []);

  useEffect(() => {
    if (mobileOpen) dispatchSidebar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        aria-hidden
        onClick={() => dispatchSidebar(false)}
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity duration-280 ease-out-quart md:hidden",
          mobileOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Primary navigation"
        className={cn(
          "min-h-[100dvh] w-64 shrink-0 flex-col",
          "md:relative md:flex",
          "fixed inset-y-0 left-0 z-40 flex transition-transform duration-450 ease-out-quart md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%), var(--surface-base)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        {/* Logo / wordmark */}
        <div className="flex items-center gap-3 px-6 py-6">
          <span
            aria-hidden
            className="relative grid h-10 w-10 place-items-center rounded-lg font-display text-xl font-extrabold text-navy"
            style={{
              background:
                "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
              boxShadow:
                "0 0 24px color-mix(in oklab, var(--color-yellow) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            L
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-display text-lg font-extrabold tracking-tight text-cloud-white">
              Lumen
            </span>
            <span className="text-xs text-[color:var(--text-muted)]">
              yellowHEAD AI
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            // Longest-prefix match: a path under /campaigns/creatives
            // matches both /campaigns and /campaigns/creatives by
            // prefix; the deeper href wins so only Creatives lights up,
            // not Campaigns AND Creatives both. /dashboard is exact-
            // matched (no sibling sub-routes today).
            const matchesPrefix = (href: string) =>
              href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname === href || pathname.startsWith(`${href}/`);
            const longestMatchHref = NAV.reduce<string | null>(
              (acc, it) =>
                matchesPrefix(it.href) &&
                (acc == null || it.href.length > acc.length)
                  ? it.href
                  : acc,
              null,
            );
            const active = item.href === longestMatchHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart will-change-transform",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                  "active:scale-[0.985]",
                  active
                    ? "text-ua"
                    : "text-[color:var(--text-secondary)] hover:translate-x-0.5 hover:bg-[color:var(--surface-hover)] hover:text-cloud-white",
                )}
                style={
                  active
                    ? {
                        background: "var(--color-ua-dim)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 22%, transparent), 0 0 18px color-mix(in oklab, var(--color-ua) 12%, transparent)",
                      }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full transition-[opacity,height] duration-450 ease-out-quart",
                    active ? "" : "opacity-0",
                  )}
                  style={
                    active
                      ? {
                          background: "var(--color-ua)",
                          boxShadow:
                            "0 0 12px color-mix(in oklab, var(--color-ua) 70%, transparent)",
                        }
                      : undefined
                  }
                />
                <Icon
                  className={cn(
                    "h-[18px] w-[18px] transition-[color,filter,transform] duration-280 ease-out-quart group-hover:scale-105",
                    active && "text-ua",
                  )}
                  strokeWidth={1.75}
                  style={
                    active
                      ? {
                          filter:
                            "drop-shadow(0 0 6px color-mix(in oklab, var(--color-ua) 60%, transparent))",
                        }
                      : undefined
                  }
                />
                <span className="font-medium">{item.label}</span>
                {item.badge && (
                  <span
                    className="ml-auto rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-yellow"
                    style={{ background: "var(--tint-yellow-soft)" }}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Workspace panel — UA-only */}
        <div className="px-4 pb-5">
          <div
            className="relative overflow-hidden rounded-lg p-4"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklab, var(--color-ua) 14%, transparent) 0%, color-mix(in oklab, var(--color-yellow) 8%, transparent) 100%)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 28%, transparent)",
              boxShadow: "var(--shadow-mint)",
            }}
          >
            <div
              aria-hidden
              className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-30 blur-2xl"
              style={{ background: "var(--color-ua)" }}
            />
            <div className="flex items-center gap-2">
              <LivePulse accent="mint" size={8} />
              <p className="text-xs font-semibold uppercase tracking-wider text-ua">
                UA workspace
              </p>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">
              Paid Media · Influencers · Programmatic
            </p>
            <p className="mt-2 text-xs text-[color:var(--text-muted)]">
              More teams coming soon.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
