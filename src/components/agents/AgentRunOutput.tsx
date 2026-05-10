"use client";

import Link from "next/link";
import { ArrowUpRight, FileText, Image as ImageIcon, Sparkles } from "lucide-react";
import { GlassBulb } from "@/components/ui/GlassBulb";
import type { RunOutput } from "@/lib/mock/agents";

type AgentRunOutputProps = {
  output: RunOutput;
};

/**
 * Per-agent run output preview. Each variant renders the actual artefact the
 * agent produced and offers a one-click jump into wherever that artefact
 * lives in the rest of the app (Feed, Reports, etc.).
 */
export function AgentRunOutput({ output }: AgentRunOutputProps) {
  if (output.kind === "image") return <ImageOutputPreview data={output.data} />;
  if (output.kind === "anomalies") return <AnomaliesOutput data={output.data} />;
  return <ReportOutputPreview data={output.data} />;
}

/* ──────────────────────────────────────────
   Image preview — Aria
   ────────────────────────────────────────── */
function ImageOutputPreview({
  data,
}: {
  data: Extract<RunOutput, { kind: "image" }>["data"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel icon={<ImageIcon className="h-3 w-3" strokeWidth={2.5} />}>
        Generated image
      </SectionLabel>

      <div
        className="relative grid h-44 w-full place-items-center overflow-hidden rounded-md"
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
        <GlassBulb size={84} accent="mint" float />
        <span className="absolute bottom-2 left-3 font-display text-xs font-bold uppercase tracking-[0.18em] text-cloud-white/85">
          {data.title}
        </span>
      </div>

      <p className="font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
        {data.composition}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────
   Anomalies — Max
   ────────────────────────────────────────── */
const CHANNEL_TINT: Record<
  Extract<RunOutput, { kind: "anomalies" }>["data"][number]["channel"],
  { bg: string; fg: string }
> = {
  Meta: { bg: "var(--tint-ua-soft)", fg: "var(--color-ua)" },
  TikTok: { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
  Google: { bg: "var(--tint-yellow-soft)", fg: "var(--color-yellow)" },
  AppsFlyer: { bg: "var(--tint-organic-soft)", fg: "var(--color-organic)" },
};

function AnomaliesOutput({
  data,
}: {
  data: Extract<RunOutput, { kind: "anomalies" }>["data"];
}) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SectionLabel icon={<Sparkles className="h-3 w-3" strokeWidth={2.5} />}>
          No anomalies
        </SectionLabel>
        <p
          className="rounded-md p-3 font-body text-sm text-[color:var(--text-secondary)]"
          style={{
            background: "var(--surface-glass)",
            border: "1px solid var(--border-glass)",
          }}
        >
          All channels were within expected ranges. Nothing was sent to Feed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionLabel icon={<Sparkles className="h-3 w-3" strokeWidth={2.5} />}>
        {data.length} anomaly{data.length > 1 ? " items" : ""} sent to Feed
      </SectionLabel>

      <ul className="flex flex-col gap-2">
        {data.map((a, i) => {
          const tint = CHANNEL_TINT[a.channel];
          const deltaColor =
            a.direction === "down" ? "var(--color-creative)" : "var(--color-ua)";
          return (
            <li
              key={`${a.channel}-${a.client}-${i}`}
              className="flex items-center justify-between gap-3 rounded-md p-2.5"
              style={{
                background: "var(--surface-glass)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={{ background: tint.bg, color: tint.fg }}
                >
                  {a.channel}
                </span>
                <span className="truncate font-body text-sm text-cloud-white">
                  {a.client}
                </span>
                <span className="font-body text-xs text-[color:var(--text-muted)]">
                  · {a.metric}
                </span>
              </div>
              <span
                className="font-display text-sm font-bold tabular-nums"
                style={{ color: deltaColor }}
              >
                {a.delta}
              </span>
            </li>
          );
        })}
      </ul>

      <OutputCta href="/feed" label="Open in Feed" />
    </div>
  );
}

/* ──────────────────────────────────────────
   Report — Nova
   ────────────────────────────────────────── */
function ReportOutputPreview({
  data,
}: {
  data: Extract<RunOutput, { kind: "report" }>["data"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel icon={<FileText className="h-3 w-3" strokeWidth={2.5} />}>
        Draft report
      </SectionLabel>

      <article
        className="flex flex-col gap-3 rounded-md p-4"
        style={{
          background: "var(--surface-glass)",
          border: "1px solid var(--border-glass)",
        }}
      >
        <h4 className="font-display text-md font-bold leading-tight text-cloud-white">
          {data.title}
        </h4>

        <div className="flex flex-wrap gap-3">
          {data.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-md px-3 py-1.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <p className="font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {m.label}
              </p>
              <p className="font-display text-md font-bold tabular-nums text-yellow">
                {m.value}
              </p>
            </div>
          ))}
        </div>

        <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          {data.excerpt}
        </p>
      </article>

      <OutputCta href="/reports" label="Open in Reports" />
    </div>
  );
}

/* ──────────────────────────────────────────
   Shared bits
   ────────────────────────────────────────── */
function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--color-ua)]">
      {icon}
      {children}
    </span>
  );
}

function OutputCta({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center gap-1.5 self-start rounded-md px-3 py-2 font-body text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-ua)] transition-[transform,background-color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      style={{
        background: "var(--tint-ua-soft)",
        border: "1px solid color-mix(in oklab, var(--color-ua) 30%, transparent)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {label}
      <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
    </Link>
  );
}
