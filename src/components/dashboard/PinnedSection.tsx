"use client";

import { Pin } from "lucide-react";
import { usePinnedTiles } from "@/lib/pins/store";
import { EmptyState } from "@/components/ui/EmptyState";

export function PinnedSection() {
  const { tiles, hydrated } = usePinnedTiles();

  // Avoid SSR/CSR mismatch — render the section only after the hook has
  // hydrated from localStorage. The "padding" while waiting is invisible
  // because the section gates its own visibility on `tiles.length`.
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
          {tiles.map((t) => (
            <div
              key={t.id}
              data-testid={`pinned-tile-${t.id}`}
              className="rounded-lg p-5"
              style={{
                background: "var(--surface-glass)",
                border: "1px solid var(--border-glass)",
                boxShadow: "var(--shadow-glass)",
              }}
            >
              <p className="font-display text-md font-bold text-cloud-white">
                {t.label ?? t.question ?? "Pinned view"}
              </p>
              <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
                {t.config.kind.toUpperCase()} · pinned{" "}
                {new Date(t.pinnedAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
