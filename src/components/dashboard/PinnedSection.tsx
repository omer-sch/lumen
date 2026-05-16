"use client";

import Link from "next/link";
import { ArrowUpRight, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePinnedTiles } from "@/lib/pins/store";
import { PinnedRenderer } from "@/components/ask/visualizations/Pinned";

const relativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  return `${mo}mo ago`;
};

export function PinnedSection() {
  const { tiles, unpin, hydrated } = usePinnedTiles();

  // Avoid SSR/CSR mismatch — render the section only after the hook has
  // hydrated from localStorage.
  if (!hydrated) return null;

  return (
    <section
      aria-label="Pinned views"
      className="flex shrink-0 flex-col gap-4"
      data-testid="pinned-section"
    >
      <header className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pin className="h-4 w-4 text-ua" strokeWidth={2.25} />
          <h2 className="font-display text-md font-bold leading-none text-cloud-white">
            Pinned views
          </h2>
          {tiles.length > 0 && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ua"
              style={{ background: "var(--tint-ua-soft)" }}
            >
              {tiles.length}
            </span>
          )}
        </div>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          Charts you pinned from Ask. They live here across sessions.
        </p>
      </header>

      {tiles.length === 0 ? (
        <Link
          href="/queries"
          className="group flex items-center gap-3 rounded-lg p-4 transition-[transform,background-color,border-color] duration-280 ease-out-quart hover:-translate-y-px hover:border-ua focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          style={{
            background: "var(--surface-glass)",
            border: "1px dashed var(--border-default)",
          }}
        >
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
            style={{
              background: "var(--tint-ua-soft)",
              color: "var(--color-ua)",
              boxShadow:
                "0 0 12px color-mix(in oklab, var(--color-ua) 28%, transparent)",
            }}
          >
            <Pin className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col">
            <p className="font-display text-sm font-bold leading-tight text-cloud-white">
              Nothing pinned yet
            </p>
            <p className="font-body text-xs leading-snug text-[color:var(--text-muted)]">
              Build a chart in Ask, tap the pin icon, and keep it here across sessions.
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 font-body text-[11px] font-semibold uppercase tracking-wider text-ua transition-transform duration-280 ease-out-quart group-hover:translate-x-0.5">
            Open Ask
            <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
          </span>
        </Link>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
          {tiles.map((t, i) => (
            <GlassCard
              key={t.id}
              glow="ua"
              enterIndex={Math.min(8, i + 1)}
              className="flex flex-col gap-4 p-5"
              data-testid={`pinned-tile-${t.id}`}
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    Pinned · {relativeTime(t.pinnedAt)}
                  </p>
                  <p className="mt-1 font-display text-md font-bold leading-snug text-cloud-white">
                    {t.label ?? t.question ?? "Pinned view"}
                  </p>
                  {t.question && t.label && (
                    <p className="mt-0.5 font-body text-xs italic text-[color:var(--text-muted)]">
                      &ldquo;{t.question}&rdquo;
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unpin(t.id)}
                  aria-label="Unpin"
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--text-muted)]",
                    "transition-[transform,background-color,color] duration-280 ease-out-quart",
                    "hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white",
                    "active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                  )}
                >
                  <PinOff className="h-4 w-4" strokeWidth={2} />
                </button>
              </header>
              <PinnedRenderer config={t.config} size="md" />
            </GlassCard>
          ))}
        </div>
      )}
    </section>
  );
}
