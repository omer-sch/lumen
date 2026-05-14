import type { Channel, Platform } from "@/lib/reports/types";

type SectionDividerProps = {
  platform: Platform;
  channel?: Channel;
  /** Big title in white, e.g. "Android" or "Meta". */
  title: string;
  /** Yellow subtitle, e.g. "Overall" or "Weekly Breakdown". */
  subtitle: string;
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
}: SectionDividerProps) {
  const icons = channel
    ? [PLATFORM_LABEL[platform], CHANNEL_LABEL[channel]]
    : [PLATFORM_LABEL[platform]];

  return (
    <div
      role="separator"
      aria-label={`${title} — ${subtitle}`}
      className="flex items-center gap-5 rounded-xl px-8 py-10 sm:px-10 print:break-inside-avoid"
      style={{
        background:
          "linear-gradient(135deg, #16203A 0%, var(--color-navy) 100%)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex flex-col gap-1.5" aria-hidden>
        {icons.map((label) => (
          <span
            key={label}
            title={label}
            className="grid h-7 w-7 place-items-center rounded-full text-[9px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(255,255,255,0.10)",
              color: "var(--text-primary)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            {label.slice(0, 2)}
          </span>
        ))}
      </div>
      <div className="flex min-w-0 flex-col">
        <h2 className="font-display text-3xl font-extrabold leading-none tracking-tight text-cloud-white sm:text-4xl">
          {title}
        </h2>
        <p
          className="mt-2 font-body text-sm font-bold uppercase tracking-[0.14em]"
          style={{ color: "var(--color-yellow)" }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
