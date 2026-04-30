import { cn } from "@/lib/utils";

type LivePulseProps = {
  /** Accent color of the pulse. Mint = UA live; yellow = brand highlight. */
  accent?: "mint" | "yellow";
  /** Diameter in px. Defaults to 8. */
  size?: number;
  className?: string;
};

const ACCENT: Record<NonNullable<LivePulseProps["accent"]>, { dot: string; pulse: string }> = {
  mint:   { dot: "var(--color-ua)",     pulse: "rgba(84,240,163,0.55)" },
  yellow: { dot: "var(--color-yellow)", pulse: "rgba(255,221,12,0.55)" },
};

/**
 * Live indicator dot with an outward radiating pulse. Default is mint —
 * the brand's "live" color for UA. Use yellow only for brand-highlight
 * indicators (e.g. notifications), not for data-feed liveness.
 */
export function LivePulse({ accent = "mint", size = 8, className }: LivePulseProps) {
  const { dot, pulse } = ACCENT[accent];
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: dot,
          animation: "mint-pulse 2s ease-in-out infinite",
          // Override pulse color via CSS variable substitution at runtime.
          // The keyframe uses a mint-colored shadow; we wrap it for yellow too.
          ...(accent === "yellow"
            ? { animation: "none", boxShadow: `0 0 0 0 ${pulse}` }
            : null),
        }}
      />
      {accent === "yellow" && (
        <span
          className="absolute inset-0 animate-pulse-dot rounded-full"
          style={{ background: dot }}
        />
      )}
    </span>
  );
}
