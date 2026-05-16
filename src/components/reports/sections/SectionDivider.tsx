import { cn } from "@/lib/utils";
import type { Channel, Platform } from "@/lib/reports/types";
import type { ContinuationInfo } from "@/lib/reports/layout";
import { PlatformChannelIcon, iconBadgeStyle } from "./platformChannelIcons";

type SectionDividerProps = {
  platform: Platform;
  channel?: Channel;
  /** Big title in white, e.g. "Android" or "Meta". */
  title: string;
  /** Yellow subtitle, e.g. "Overall" or "Weekly Breakdown". */
  subtitle: string;
  /** When the underlying section was split into multiple slides, this
   *  drives the " (cont.)" suffix on continuation slides and the tiny
   *  "Part X of Y" annotation in the corner of the divider. */
  continuation?: ContinuationInfo;
  /** Slide-fit variant. The carousel and off-screen deck need a shorter
   *  divider so the section content fits the 16:9 frame; Document mode
   *  keeps the generous padding and big type. */
  compact?: boolean;
  /** When true, skips the top-right platform / channel pill. Manual
   *  reports set this because their intent.platforms + intent.channels
   *  are hardcoded defaults; rendering "ANDROID · META" on every cover
   *  would claim a scope the user did not pick. The icon-only avatars
   *  on the left + the section title still render. */
  suppressPill?: boolean;
};

const PLATFORM_LABEL: Record<Platform, string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  asa: "ASA",
  search: "Search",
};

/**
 * The dark navy divider that introduces every Platform or Platform x Channel
 * block. Rendered inside the otherwise light report document, so it carries
 * its own dark palette and breaks the white-on-white monotony the way the
 * yellowHEAD deck does.
 */
export function SectionDivider({
  platform,
  channel,
  title,
  subtitle,
  continuation,
  compact = false,
  suppressPill = false,
}: SectionDividerProps) {
  // Left-side avatars: icon-only badges (the brand glyph IS the label).
  // The full word still lives in the top-right pill so users learn the
  // mapping without having to memorize icons.
  type Slot = { key: Platform | Channel; label: string };
  const iconSlots: Slot[] = channel
    ? [
        { key: platform, label: PLATFORM_LABEL[platform] },
        { key: channel, label: CHANNEL_LABEL[channel] },
      ]
    : [{ key: platform, label: PLATFORM_LABEL[platform] }];

  const isContinuation =
    continuation !== undefined && continuation.partIndex > 0;
  const showPartAnnotation =
    continuation !== undefined && continuation.partTotal > 1;
  const renderedSubtitle = isContinuation ? `${subtitle} (cont.)` : subtitle;

  return (
    <div
      role="separator"
      aria-label={`${title} — ${renderedSubtitle}`}
      className={cn(
        "relative flex items-center gap-4 rounded-xl print:break-inside-avoid",
        compact ? "px-6 py-3 sm:px-6" : "gap-5 px-8 py-10 sm:px-10",
      )}
      style={{
        background:
          "linear-gradient(135deg, #16203A 0%, var(--color-navy) 100%)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className={cn(
          "flex flex-col",
          compact ? "gap-1" : "gap-1.5",
        )}
        aria-hidden
      >
        {iconSlots.map(({ key, label }) => (
          <span
            key={key}
            title={label}
            className={cn(
              "grid place-items-center rounded-full",
              compact ? "h-6 w-6" : "h-8 w-8",
            )}
            // White backdrop so brand colors (green Android, blue Meta,
            // etc.) pop against the navy section divider.
            style={iconBadgeStyle(key)}
          >
            <PlatformChannelIcon
              name={key}
              className={compact ? "h-3.5 w-3.5" : "h-[18px] w-[18px]"}
              title={label}
            />
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-col">
        <h2
          className={cn(
            "font-display font-extrabold leading-none tracking-tight text-cloud-white",
            compact ? "text-xl" : "text-3xl sm:text-4xl",
          )}
        >
          {title}
        </h2>
        <p
          className={cn(
            "font-body font-bold uppercase tracking-[0.14em]",
            compact ? "mt-1 text-[10px]" : "mt-2 text-sm",
          )}
          style={{ color: "var(--color-yellow)" }}
        >
          {renderedSubtitle}
        </p>
      </div>
      {/* Platform/channel anchor pill in the top-right. Icon + name pair
       *  for each platform / channel; the icon-only avatars on the left
       *  are the same glyphs without the text. This is the carousel half
       *  of the "don't create text-only slides" anti-pattern remedy.
       *  whitespace-nowrap on the label spans so a narrow surface (the
       *  carousel cover at compact sizes) cannot break "META" mid-word. */}
      {!suppressPill && (
        <span
          className={cn(
            "absolute inline-flex items-center whitespace-nowrap rounded-full font-body font-bold uppercase tracking-[0.14em]",
            compact ? "right-4 top-3 gap-1.5 py-0.5 pl-1 pr-2 text-[9px]" : "right-6 top-6 gap-2 py-1 pl-1.5 pr-3 text-[10px]",
          )}
          style={{
            background: "rgba(255,221,12,0.12)",
            color: "var(--color-yellow)",
            border: "1px solid rgba(255,221,12,0.30)",
          }}
        >
          <span
            className={cn(
              "grid place-items-center rounded-full",
              compact ? "h-4 w-4" : "h-5 w-5",
            )}
            style={iconBadgeStyle(platform)}
          >
            <PlatformChannelIcon
              name={platform}
              className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
            />
          </span>
          <span className="whitespace-nowrap">{PLATFORM_LABEL[platform]}</span>
          {channel && (
            <>
              <span aria-hidden className="opacity-50">·</span>
              <span
                className={cn(
                  "grid place-items-center rounded-full",
                  compact ? "h-4 w-4" : "h-5 w-5",
                )}
                style={iconBadgeStyle(channel)}
              >
                <PlatformChannelIcon
                  name={channel}
                  className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
                />
              </span>
              <span className="whitespace-nowrap">{CHANNEL_LABEL[channel]}</span>
            </>
          )}
        </span>
      )}
      {showPartAnnotation && continuation && (
        <span
          className={cn(
            "absolute font-mono uppercase tracking-[0.18em]",
            compact
              ? "right-4 bottom-2 text-[8px]"
              : "right-6 bottom-3 text-[9px]",
          )}
          style={{ color: "rgba(255,221,12,0.7)" }}
        >
          Part {continuation.partIndex + 1} of {continuation.partTotal}
        </span>
      )}
    </div>
  );
}
