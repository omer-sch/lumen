import { GlassCard } from "@/components/ui/GlassCard";

type ChannelMixProps = {
  data: { channel: string; spend: number; pct: number }[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
};

export function ChannelMix({ data, enterIndex }: ChannelMixProps) {
  const showSpend = data.some((d) => d.spend > 0);

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className="flex flex-col gap-5 p-6"
    >
      <div>
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Channel mix
        </h2>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Share of {showSpend ? "spend" : "activity"} across sources.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {data.map((row, i) => {
          const isTop = i === 0;
          return (
            <li key={row.channel} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-body text-sm">
                <span className="font-medium text-cloud-white">{row.channel}</span>
                <span className="tabular-nums text-[color:var(--text-muted)]">
                  {showSpend && `$${(row.spend / 1000).toFixed(1)}k · `}
                  {row.pct.toFixed(1)}%
                </span>
              </div>
              <div
                className="relative h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-track)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(Math.max(row.pct, 0), 100)}%`,
                    background: isTop
                      ? "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))"
                      : "var(--color-ua)",
                    boxShadow: isTop
                      ? "0 0 14px color-mix(in oklab, var(--color-ua-glow) 65%, transparent)"
                      : "0 0 8px color-mix(in oklab, var(--color-ua) 40%, transparent)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
