"use client";

import { useState } from "react";
import { Expand, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { ImageLightbox } from "@/components/agents/ImageLightbox";
import type { Agent, AgentRun, ImageOutput } from "@/lib/mock/agents";

type AgentGalleryAriaProps = {
  agent: Agent;
  /** Kicks off another generation. Same handler the bottom Run button
   *  uses, so the inline "Try a different vibe" stays in sync. */
  onRetry?: () => void;
  /** Disables Ship/Retry while a generation is in flight. */
  running?: boolean;
};

/** Mood tags inferred for the hero card. Hardcoded for v1 — a future ticket
 *  will move these onto the run record or have Aria emit them. */
const HERO_MOODS = ["god rays", "mint glow", "single subject", "cinematic"];

/**
 * Aria's main output region: a today's-hero card on top with the generated
 * image (or gradient placeholder), score chip, mood tags, and ship/retry
 * buttons. Below that, a 4-up thumbnail gallery of previous runs.
 */
export function AgentGalleryAria({
  agent,
  onRetry,
  running,
}: AgentGalleryAriaProps) {
  const [shipped, setShipped] = useState<Set<string>>(new Set());
  /** Open lightbox state. Holds the src+alt of whichever run was clicked
   *  so both the hero and any thumbnail can drive the same modal. */
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const imageRuns = agent.history.filter(
    (r) => r.output.kind === "image",
  ) as (AgentRun & { output: { kind: "image"; data: ImageOutput } })[];
  const [hero, ...rest] = imageRuns;

  if (!hero) {
    return (
      <GlassCard className="p-6">
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          Aria hasn&rsquo;t produced an image yet. Hit Run now to kick off a hero.
        </p>
      </GlassCard>
    );
  }

  const isShipped = shipped.has(hero.id);

  const handleShip = () => {
    setShipped((prev) => {
      const next = new Set(prev);
      next.add(hero.id);
      return next;
    });
    console.log(`[Aria] shipped run ${hero.id} (published: true)`);
  };

  return (
    <section aria-label="Aria's gallery" className="flex flex-col gap-4">
      <SectionLabel>Today&rsquo;s hero</SectionLabel>

      <GlassCard glow="ua" className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[1.3fr_1fr]">
        {/* Left tile — the image. Clickable to open the lightbox when the
            image is real (data:/URL); the gradient placeholder is not
            zoomable. */}
        <div className="relative aspect-[1.3/1] w-full overflow-hidden rounded-md">
          {hero.output.data.imageUrl ? (
            <button
              type="button"
              onClick={() =>
                setLightbox({
                  src: hero.output.data.imageUrl!,
                  alt: hero.output.data.title,
                })
              }
              aria-label="Open full image"
              className="block h-full w-full cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            >
              <ImageOrPlaceholder
                data={hero.output.data}
                alt={hero.output.data.title}
              />
            </button>
          ) : (
            <ImageOrPlaceholder
              data={hero.output.data}
              alt={hero.output.data.title}
            />
          )}
          {hero.output.data.imageUrl && (
            <button
              type="button"
              onClick={() =>
                setLightbox({
                  src: hero.output.data.imageUrl!,
                  alt: hero.output.data.title,
                })
              }
              aria-label="Open full image"
              className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-md px-2 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-cloud-white transition-[background-color,opacity] duration-280 ease-out-quart hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua"
              style={{
                background: "rgba(10, 20, 40, 0.55)",
                border: "1px solid rgba(255,255,255,0.18)",
                backdropFilter: "blur(6px)",
              }}
            >
              <Expand className="h-3 w-3" strokeWidth={2.5} />
              Open
            </button>
          )}
          {/* Bottom-left timestamp chip */}
          <span
            className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-cloud-white"
            style={{
              background: "rgba(10, 20, 40, 0.65)",
              border: "1px solid rgba(255,255,255,0.18)",
              backdropFilter: "blur(6px)",
            }}
          >
            {hero.date}
          </span>
          {/* Top-right yellow star score */}
          {hero.score != null && (
            <span
              className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-display text-xs font-bold tabular-nums text-yellow"
              style={{
                background: "rgba(10, 20, 40, 0.65)",
                border: "1px solid color-mix(in oklab, var(--color-yellow) 40%, transparent)",
                backdropFilter: "blur(6px)",
              }}
            >
              <Star className="h-3 w-3 fill-current" strokeWidth={0} />
              {Math.round(hero.score)}
            </span>
          )}
          {isShipped && (
            <span
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
              style={{
                background: "color-mix(in oklab, var(--color-ua) 18%, rgba(10,20,40,0.65))",
                border: "1px solid color-mix(in oklab, var(--color-ua) 50%, transparent)",
                backdropFilter: "blur(6px)",
              }}
            >
              Shipped
            </span>
          )}
        </div>

        {/* Right tile — run note (directive line), composition, moods, actions */}
        <div className="flex flex-col gap-4">
          {hero.note && (
            <p className="font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]">
              {hero.note}
            </p>
          )}
          <p className="font-body text-sm leading-relaxed text-cloud-white">
            {hero.output.data.composition}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {HERO_MOODS.map((m) => (
              <span
                key={m}
                className="rounded-full px-2 py-0.5 font-body text-[11px] font-medium text-[color:var(--text-secondary)]"
                style={{
                  background: "var(--surface-glass)",
                  border: "1px solid var(--border-glass)",
                }}
              >
                {m}
              </span>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={handleShip}
              disabled={isShipped || running}
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-navy transition-[transform,box-shadow,opacity] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              style={{
                background: "var(--color-ua)",
                boxShadow: "var(--shadow-mint)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              {isShipped ? "Shipped" : "Ship this one"}
            </button>
            <button
              type="button"
              onClick={onRetry}
              disabled={!onRetry || running}
              className="inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2.5 font-body text-xs font-semibold uppercase tracking-wider text-cloud-white transition-[transform,background-color,opacity] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              style={{
                background: "var(--surface-input)",
                border: "1px solid var(--border-default)",
              }}
            >
              {running ? "Generating…" : "Try a different vibe"}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* Thumbnail gallery */}
      {rest.length > 0 && (
        <>
          <SectionLabel>Previous runs</SectionLabel>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {rest.slice(0, 4).map((run) => (
              <Thumbnail
                key={run.id}
                run={run}
                onOpen={
                  run.output.data.imageUrl
                    ? () =>
                        setLightbox({
                          src: run.output.data.imageUrl!,
                          alt: run.output.data.title,
                        })
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      {lightbox && (
        <ImageLightbox
          src={lightbox.src}
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}

function ImageOrPlaceholder({
  data,
  alt,
}: {
  data: ImageOutput;
  alt: string;
}) {
  if (data.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.imageUrl}
        alt={alt}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div
      className="relative grid h-full w-full place-items-center"
      style={{
        background: `radial-gradient(circle at 30% 25%, ${data.palette.from} 0%, transparent 55%), radial-gradient(circle at 70% 80%, ${data.palette.to} 0%, transparent 55%), var(--surface-icon-bg)`,
        border: "1px solid var(--border-glass)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.35)",
      }}
    >
      {/* Faux god-ray shafts */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.08) 38%, transparent 46%), linear-gradient(125deg, transparent 50%, rgba(255,255,255,0.05) 56%, transparent 62%)",
        }}
      />
      <GlassBulb size={108} accent="mint" float />
    </div>
  );
}

function Thumbnail({
  run,
}: {
  run: AgentRun & { output: { kind: "image"; data: ImageOutput } };
}) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-md",
      )}
      style={{
        border: "1px solid var(--border-glass)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <ImageOrPlaceholder data={run.output.data} alt={run.output.data.title} />
      {run.score != null && (
        <span
          className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-display text-[10px] font-bold tabular-nums text-yellow"
          style={{
            background: "rgba(10, 20, 40, 0.65)",
            border: "1px solid color-mix(in oklab, var(--color-yellow) 40%, transparent)",
            backdropFilter: "blur(6px)",
          }}
        >
          <Star className="h-2.5 w-2.5 fill-current" strokeWidth={0} />
          {Math.round(run.score)}
        </span>
      )}
      <span
        className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-[0.14em] text-cloud-white"
        style={{
          background: "rgba(10, 20, 40, 0.65)",
          backdropFilter: "blur(6px)",
        }}
      >
        {run.date}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-body text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
      {children}
    </span>
  );
}
