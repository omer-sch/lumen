"use client";

import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
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
      className="flex flex-col gap-4"
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
        <div
          className="rounded-lg p-6"
          style={{
            background: "var(--surface-glass)",
            border: "1px dashed var(--border-default)",
          }}
        >
          <EmptyState
            title="Nothing pinned yet"
            description="Build a chart in Ask and tap the pin icon to keep it on your dashboard. Pinned views are personal and stay across sessions."
            bulbSize={120}
            accent="mint"
          />
        </div>
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
