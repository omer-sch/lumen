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
 *   1. Translucent navy surface with backdrop blur
 *   2. ::before — top-left light reflection (always on)
 *   3. Optional shimmer overlay (animated diagonal sheen)
 *   4. Children
 */
export function GlassCard({
  className,
  glow = "ua",
  feature,
  shimmer,
  enterIndex,
  ...props
}: GlassCardProps) {
  const accent = GLOW_VAR[glow];
  const hasAccent = glow !== "none";
  const animateIn = typeof enterIndex === "number" && enterIndex > 0;
  const staggerClass = animateIn
    ? STAGGER_CLASS[Math.min(enterIndex, STAGGER_CLASS.length - 1)]
    : "";

  return (
    <div
      data-glass
      className={cn(
        "group relative isolate overflow-hidden rounded-lg backdrop-blur-glass transition-all duration-300",
        // Base top-left reflection — always present per design-tokens spec
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit]",
        "before:bg-[linear-gradient(135deg,rgba(255,255,255,0.08)_0%,transparent_50%)]",
        // Hover: soft lift
        "hover:-translate-y-0.5",
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
}
