import type { ComponentType, SVGProps } from "react";

type GlassIconProps = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** CSS var name (without `var(--…)`) for the accent color. */
  accentVar: string;
  size?: "sm" | "md" | "lg";
};

const SIZE: Record<NonNullable<GlassIconProps["size"]>, { box: string; icon: string }> = {
  sm: { box: "h-9 w-9", icon: "h-4 w-4" },
  md: { box: "h-12 w-12", icon: "h-5 w-5" },
  lg: { box: "h-16 w-16", icon: "h-6 w-6" },
};

/**
 * Glass-3D icon container per yellowHEAD brand spec — physically-accurate
 * glass: layered radial highlights, chromatic edge, deep inset shadow,
 * accent inner glow.
 */
export function GlassIcon({ icon: Icon, accentVar, size = "md" }: GlassIconProps) {
  const sz = SIZE[size];
  const accent = `var(${accentVar})`;
  return (
    <span
      aria-hidden
      className={`relative grid ${sz.box} place-items-center overflow-hidden rounded-lg`}
      style={{
        // Deep navy base so the glass has something to refract against.
        background:
          "linear-gradient(140deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 35%, rgba(0,0,0,0.20) 100%), var(--surface-icon-bg)",
        // Thick "glass" contour — slight chromatic split between top + bottom edges.
        boxShadow: [
          // outer accent glow
          `0 0 24px color-mix(in oklab, ${accent} 35%, transparent)`,
          // inner top-left specular highlight
          "inset 1.5px 1.5px 0 0 rgba(255,255,255,0.30)",
          // inner bottom-right shadow for depth
          "inset -1.5px -1.5px 2px 0 rgba(0,0,0,0.45)",
          // chromatic accent ring
          `inset 0 0 0 1px color-mix(in oklab, ${accent} 22%, transparent)`,
        ].join(", "),
      }}
    >
      {/* Top-left lens flare */}
      <span
        aria-hidden
        className="pointer-events-none absolute -left-1 -top-1 h-1/2 w-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)",
          filter: "blur(2px)",
        }}
      />
      {/* Bottom-right colored bloom */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-2 -right-2 h-2/3 w-2/3 rounded-full opacity-60"
        style={{
          background: `radial-gradient(closest-side, ${accent}, transparent 70%)`,
          filter: "blur(6px)",
        }}
      />
      <Icon
        className={`relative ${sz.icon}`}
        strokeWidth={1.75}
        style={{
          color: accent,
          filter: `drop-shadow(0 1px 0 rgba(0,0,0,0.6)) drop-shadow(0 0 6px color-mix(in oklab, ${accent} 50%, transparent))`,
        }}
      />
    </span>
  );
}
