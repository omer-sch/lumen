import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  /** Inner accent color — drives the border tint, glow, and inset edge. */
  glow?: "yellow" | "ua" | "none";
  /** Slightly more elevated variant for hero / feature cards. */
  feature?: boolean;
  /** Adds a slow specular shimmer that travels across the card surface. */
  shimmer?: boolean;
  /**
   * Wrap the glass surface in a Double-Bezel outer shell — hairline ring,
   * machined-hardware feel. Reserved for hero containers (auth, the Ask
   * input). Don't apply to every card; the brand calls for restraint.
   */
  bezel?: boolean;
  /**
   * Marks the card as a clickable surface. Adds tactile press, mint focus
   * ring, and pointer cursor. The card stays a div — caller wires onClick
   * + role/tabIndex if not using it as a Link wrapper.
   */
  interactive?: boolean;
  /**
   * Stagger index for the card-enter animation. Pass the card's position in
   * its grid (1-based). 0 disables entry animation.
   */
  enterIndex?: number;
};

const GLOW_VAR: Record<NonNullable<GlassCardProps["glow"]>, string> = {
  yellow: "var(--color-yellow)",
  ua:     "var(--color-ua)",
  none:   "transparent",
};

const STAGGER_CLASS = [
  "",
  "stagger-1",
  "stagger-2",
  "stagger-3",
  "stagger-4",
  "stagger-5",
  "stagger-6",
  "stagger-7",
  "stagger-8",
];

/**
 * Glassmorphism card per yellowHEAD brand spec — translucent navy fill,
 * 16px backdrop blur with saturation boost, soft white edge highlight,
 * optional accent glow + shimmer.
 *
 * Layered effects (z-stack, bottom → top):
 *   1. Optional Double-Bezel outer shell (machined hardware feel)
 *   2. Translucent navy surface with backdrop blur
 *   3. ::before — top-left light reflection (always on)
 *   4. Optional shimmer overlay (animated diagonal sheen)
 *   5. Children
 *
 * Motion is GPU-only: transform + opacity, brand easing.
 */
export function GlassCard({
  className,
  glow = "ua",
  feature,
  shimmer,
  bezel,
  interactive,
  enterIndex,
  ...props
}: GlassCardProps) {
  const accent = GLOW_VAR[glow];
  const hasAccent = glow !== "none";
  const animateIn = typeof enterIndex === "number" && enterIndex > 0;
  const staggerClass = animateIn
    ? STAGGER_CLASS[Math.min(enterIndex, STAGGER_CLASS.length - 1)]
    : "";

  const cardEl = (
    <div
      data-glass
      className={cn(
        "group relative isolate overflow-hidden rounded-lg backdrop-blur-glass",
        // Brand easing — every transition uses cubic-bezier(0.16,1,0.3,1)
        "transition-[transform,box-shadow,border-color] duration-450 ease-out-quart",
        // Base top-left reflection — always present per design-tokens spec
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
        "before:bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_50%)]",
        // Hover: soft lift (transform-only, GPU-safe)
        "hover:-translate-y-0.5",
        // Interactive: tactile press + focus ring
        interactive && "cursor-pointer focus-mint focus-visible:outline-none active:scale-[0.985]",
        // Optional shimmer overlay
        shimmer && "shimmer-overlay",
        // Optional entry animation
        animateIn && "animate-card-enter",
        animateIn && staggerClass,
        feature ? "shadow-elevated" : "shadow-glass",
        className,
      )}
      style={{
        background: "var(--surface-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        border: hasAccent
          ? `1px solid color-mix(in oklab, ${accent} 22%, var(--border-glass))`
          : "1px solid var(--border-glass)",
        boxShadow: hasAccent
          ? feature
            ? `var(--shadow-elevated), 0 0 24px color-mix(in oklab, ${accent} 18%, transparent), inset 1px 1px 0 0 color-mix(in oklab, ${accent} 30%, transparent)`
            : `var(--shadow-glass), 0 0 18px color-mix(in oklab, ${accent} 12%, transparent), inset 1px 1px 0 0 color-mix(in oklab, ${accent} 22%, transparent)`
          : undefined,
      }}
      {...props}
    />
  );

  if (!bezel) return cardEl;

  // Double-Bezel: outer machined-hardware shell wrapping the glass core.
  // Concentric radii with a small gap between outer and inner radii.
  return (
    <div
      className={cn(
        "relative rounded-xl p-1.5",
        animateIn && "animate-card-enter",
        animateIn && staggerClass,
      )}
      style={{
        background:
          "linear-gradient(140deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.10) 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(0,0,0,0.40)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {/* The inner card no longer animates in (parent owns the entry) */}
      <div
        data-glass
        className={cn(
          "group relative isolate overflow-hidden rounded-lg backdrop-blur-glass",
          "transition-[transform,box-shadow,border-color] duration-450 ease-out-quart",
          "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
          "before:bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_50%)]",
          "hover:-translate-y-0.5",
          interactive && "cursor-pointer focus-mint focus-visible:outline-none active:scale-[0.985]",
          shimmer && "shimmer-overlay",
          feature ? "shadow-elevated" : "shadow-glass",
          className,
        )}
        style={{
          background: "var(--surface-glass)",
          WebkitBackdropFilter: "var(--blur-glass)",
          backdropFilter: "var(--blur-glass)",
          border: hasAccent
            ? `1px solid color-mix(in oklab, ${accent} 22%, var(--border-glass))`
            : "1px solid var(--border-glass)",
          boxShadow: hasAccent
            ? feature
              ? `var(--shadow-elevated), 0 0 24px color-mix(in oklab, ${accent} 18%, transparent), inset 1px 1px 0 0 color-mix(in oklab, ${accent} 30%, transparent)`
              : `var(--shadow-glass), 0 0 18px color-mix(in oklab, ${accent} 12%, transparent), inset 1px 1px 0 0 color-mix(in oklab, ${accent} 22%, transparent)`
            : undefined,
        }}
        {...props}
      />
    </div>
  );
}
