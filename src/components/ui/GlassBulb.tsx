import type { CSSProperties } from "react";

type GlassBulbProps = {
  /** Pixel size of the bulb glass (the socket is ~25% extra). */
  size?: number;
  /** Accent color for the inner glow / filament. Defaults to UA mint. */
  accent?: "mint" | "yellow" | "warm";
  /** Float animation on the bulb itself. Defaults to true. */
  float?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Token-driven accent palette for the bulb's filament + colored bloom. */
const ACCENT: Record<NonNullable<GlassBulbProps["accent"]>, { stop: string; glow: string }> = {
  mint:   { stop: "var(--color-ua-glow)",      glow: "var(--color-ua)" },
  yellow: { stop: "var(--color-yellow-light)", glow: "var(--color-yellow)" },
  warm:   { stop: "var(--color-warm-mid)",     glow: "var(--color-warm-flare)" },
};

/**
 * Physically-suggestive 3D glass light bulb sculpture, rendered with SVG +
 * stacked radial gradients. It is the signature yellowHEAD brand element —
 * use it on section breaks, hero moments, and loading screens.
 *
 * Colors flow through CSS variables — accent stops via the ACCENT map,
 * socket metal via --bulb-socket-* tokens. The bulb is intentionally
 * oversized in its container so the soft outer glow can bleed beyond
 * the visible glass.
 */
export function GlassBulb({
  size = 220,
  accent = "mint",
  float = true,
  className,
  style,
}: GlassBulbProps) {
  const { stop, glow } = ACCENT[accent];
  const w = size;
  const h = Math.round(size * 1.32); // glass + socket
  const uid = `bulb-${accent}`;

  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-block",
        width: w,
        height: h,
        animation: float ? "bulb-float 5s ease-in-out infinite" : undefined,
        filter: `drop-shadow(0 18px 32px rgba(0,0,0,0.35)) drop-shadow(0 0 60px color-mix(in oklab, ${glow} 35%, transparent))`,
        ...style,
      }}
    >
      <svg
        viewBox="0 0 220 290"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Glass body — soft white/transparent with cool tint at the bottom */}
          <radialGradient id={`${uid}-body`} cx="38%" cy="32%" r="80%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.85)" />
            <stop offset="35%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="75%" stopColor="rgba(180,210,230,0.10)" />
            <stop offset="100%" stopColor="rgba(20,40,80,0.40)" />
          </radialGradient>

          {/* Inner accent bloom — colored core that simulates the filament glow */}
          <radialGradient id={`${uid}-core`} cx="50%" cy="60%" r="55%">
            <stop offset="0%"  style={{ stopColor: stop, stopOpacity: 0.85 }} />
            <stop offset="55%" style={{ stopColor: glow, stopOpacity: 0.35 }} />
            <stop offset="100%" style={{ stopColor: glow, stopOpacity: 0 }} />
          </radialGradient>

          {/* Top-left specular highlight (the "lens flare" on glass) */}
          <radialGradient id={`${uid}-spec`} cx="32%" cy="28%" r="22%">
            <stop offset="0%"  stopColor="rgba(255,255,255,0.95)" />
            <stop offset="60%" stopColor="rgba(255,255,255,0.20)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Bottom rim shadow — subtle dark crescent under the glass */}
          <radialGradient id={`${uid}-rim`} cx="50%" cy="92%" r="50%">
            <stop offset="0%"  stopColor="rgba(0,0,0,0.45)" />
            <stop offset="80%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>

          {/* Metal socket — brushed dark gradient (token-driven) */}
          <linearGradient id={`${uid}-socket`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   style={{ stopColor: "var(--bulb-socket-light)" }} />
            <stop offset="50%"  style={{ stopColor: "var(--bulb-socket-mid)" }} />
            <stop offset="100%" style={{ stopColor: "var(--bulb-socket-deepest)" }} />
          </linearGradient>
        </defs>

        {/* Outer ambient glow halo */}
        <circle cx="110" cy="105" r="98" style={{ fill: glow }} opacity="0.18" />

        {/* Bulb — gourd-like silhouette */}
        <path
          d="M110 18
             C 162 18 198 56 198 105
             C 198 138 178 158 168 178
             C 162 192 160 202 160 212
             L 60 212
             C 60 202 58 192 52 178
             C 42 158 22 138 22 105
             C 22 56 58 18 110 18 Z"
          fill={`url(#${uid}-body)`}
          stroke="rgba(255,255,255,0.20)"
          strokeWidth="1.2"
        />

        {/* Inner colored bloom (filament glow) */}
        <ellipse cx="110" cy="120" rx="62" ry="74" fill={`url(#${uid}-core)`} />

        {/* Filament — two looped curves */}
        <g
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
          style={{
            stroke: stop,
            filter: `drop-shadow(0 0 6px ${glow}) drop-shadow(0 0 12px ${glow})`,
          }}
        >
          <path d="M88 158 Q 92 110 110 110 Q 128 110 132 158" />
          <path d="M96 158 Q 100 130 110 130 Q 120 130 124 158" opacity="0.7" />
        </g>

        {/* Filament posts */}
        <g style={{ fill: stop }} opacity="0.9">
          <rect x="86" y="156" width="4" height="14" rx="1" />
          <rect x="130" y="156" width="4" height="14" rx="1" />
        </g>

        {/* Bottom rim shadow */}
        <ellipse cx="110" cy="200" rx="70" ry="22" fill={`url(#${uid}-rim)`} />

        {/* Glass top-left lens flare */}
        <ellipse cx="78" cy="62" rx="34" ry="22" fill={`url(#${uid}-spec)`} />
        {/* Smaller secondary highlight */}
        <ellipse cx="68" cy="48" rx="9" ry="5" fill="rgba(255,255,255,0.85)" opacity="0.6" />

        {/* Glass right-edge soft highlight */}
        <path
          d="M186 90 Q 196 110 192 138"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />

        {/* Socket — threaded metal base */}
        <rect x="62" y="212" width="96" height="14" rx="2" fill={`url(#${uid}-socket)`} />
        <rect x="66" y="226" width="88" height="10" rx="1.5" fill={`url(#${uid}-socket)`} opacity="0.92" />
        <rect x="70" y="236" width="80" height="10" rx="1.5" fill={`url(#${uid}-socket)`} opacity="0.85" />
        <rect x="74" y="246" width="72" height="10" rx="1.5" fill={`url(#${uid}-socket)`} opacity="0.78" />
        {/* Tip / contact */}
        <ellipse cx="110" cy="262" rx="22" ry="8" style={{ fill: "var(--bulb-socket-deepest)" }} />
        <ellipse cx="110" cy="260" rx="14" ry="4" style={{ fill: "var(--bulb-socket-dark)" }} />

        {/* Socket thread highlights */}
        <line x1="64" y1="220" x2="156" y2="220" stroke="rgba(255,255,255,0.22)" strokeWidth="0.8" />
        <line x1="68" y1="232" x2="152" y2="232" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" />
        <line x1="72" y1="244" x2="148" y2="244" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8" />
      </svg>
    </span>
  );
}
