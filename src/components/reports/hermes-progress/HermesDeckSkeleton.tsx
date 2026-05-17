"use client";

import { useMemo } from "react";

import type { Intent } from "@/lib/analyst/types";
import type { ReportSection } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

// Low-fidelity outline of the deck that paints as soon as
// parse_intent finishes, then swaps each card from shimmer to
// populated as section_ready events arrive. The expected list is
// derived deterministically from the intent + the template's
// hardcoded channel ordering.
//
// Reuses the @keyframes shimmer keyframe defined in globals.css so
// we share the dashboard's loading visual language without adding a
// dep or a new keyframe.

type Props = {
  intent: Intent | null;
  sectionsReady: Record<string, ReportSection>;
};

type Slot = {
  sectionId: string;
  kind: "platform_overall" | "channel_weekly" | "channel_campaign";
  platformLabel: string;
  channelLabel: string | null;
};

const PLATFORM_LABEL: Record<"android" | "ios" | "web", string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
};

const CHANNEL_LABEL: Record<
  "meta" | "google" | "tiktok" | "apple_search_ads" | "applovin",
  string
> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  apple_search_ads: "ASA",
  applovin: "AppLovin",
};

// Mirrors the template's per-platform channel order so the skeleton
// matches the eventual deck layout.
const PLATFORM_CHANNELS: Record<
  "android" | "ios" | "web",
  readonly ("meta" | "google" | "tiktok" | "apple_search_ads")[]
> = {
  android: ["meta", "google", "tiktok"],
  ios: ["meta", "google", "tiktok", "apple_search_ads"],
  web: ["google"],
};

const RENDER_CHANNEL: Record<
  "meta" | "google" | "tiktok" | "apple_search_ads",
  "meta" | "google" | "tiktok" | "asa"
> = {
  meta: "meta",
  google: "google",
  tiktok: "tiktok",
  apple_search_ads: "asa",
};

export function HermesDeckSkeleton({ intent, sectionsReady }: Props) {
  const slots = useMemo<Slot[]>(() => {
    if (!intent) return [];
    const out: Slot[] = [];
    for (const platform of intent.platforms) {
      const requested = new Set(intent.channels);
      const channels = PLATFORM_CHANNELS[platform].filter((c) =>
        requested.has(c),
      );
      if (channels.length === 0) continue;
      out.push({
        sectionId: `${platform}--platform_overall`,
        kind: "platform_overall",
        platformLabel: PLATFORM_LABEL[platform],
        channelLabel: null,
      });
      for (const channel of channels) {
        const renderChannel = RENDER_CHANNEL[channel];
        out.push({
          sectionId: `${platform}-${renderChannel}--channel_weekly`,
          kind: "channel_weekly",
          platformLabel: PLATFORM_LABEL[platform],
          channelLabel: CHANNEL_LABEL[channel],
        });
        out.push({
          sectionId: `${platform}-${renderChannel}--channel_campaign`,
          kind: "channel_campaign",
          platformLabel: PLATFORM_LABEL[platform],
          channelLabel: CHANNEL_LABEL[channel],
        });
      }
    }
    return out;
  }, [intent]);

  if (!intent) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--border-glass)] bg-[color:var(--surface-base)] p-3">
      <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
        Deck outline · {slots.filter((s) => sectionsReady[s.sectionId]).length} /
        {slots.length} ready
      </p>
      <ol className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
        {slots.map((slot) => {
          const ready = sectionsReady[slot.sectionId];
          return (
            <li
              key={slot.sectionId}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 transition-colors duration-280",
                ready
                  ? "border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)]"
                  : "skeleton-shimmer",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  ready
                    ? "bg-[color:var(--color-ua)]"
                    : "bg-[color:var(--text-muted)] opacity-50",
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-body text-xs font-semibold text-cloud-white">
                  {labelForSlot(slot)}
                </p>
                {ready ? (
                  <p className="truncate font-body text-[11px] text-[color:var(--text-secondary)]">
                    {ready.id === "platform_overall" ||
                    ready.id === "channel_weekly" ||
                    ready.id === "channel_campaign"
                      ? ready.title
                      : "Ready"}
                  </p>
                ) : (
                  <p className="font-body text-[11px] text-[color:var(--text-secondary)]">
                    Waiting…
                  </p>
                )}
              </div>
              {ready && (
                <span
                  className="rounded-full px-1.5 py-0.5 font-body text-[9px] font-semibold uppercase tracking-[0.14em]"
                  style={{
                    background:
                      "color-mix(in oklab, var(--color-ua) 18%, transparent)",
                    color: "var(--color-ua)",
                  }}
                >
                  Ready
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function labelForSlot(slot: Slot): string {
  switch (slot.kind) {
    case "platform_overall":
      return `${slot.platformLabel} overview`;
    case "channel_weekly":
      return `${slot.platformLabel} ${slot.channelLabel} weekly`;
    case "channel_campaign":
      return `${slot.platformLabel} ${slot.channelLabel} campaigns`;
  }
}
