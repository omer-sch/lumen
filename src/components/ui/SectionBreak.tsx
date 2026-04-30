import { GlassBulb } from "./GlassBulb";

type SectionBreakProps = {
  /** Headline shown below the bulb in Bricolage ExtraBold over yellow. */
  title: string;
  /** Optional supporting line. Keep it short and sharp. */
  tagline?: string;
  /** Bulb size in px. Defaults to 200, drops to 160 on mobile via responsive style. */
  bulbSize?: number;
  /** Accent color for the bulb's filament. Defaults to mint (UA workspace). */
  accent?: "mint" | "yellow" | "warm";
};

/**
 * The signature yellowHEAD section break: yellow background, oversized 3D
 * glass bulb, navy ExtraBold tagline. Use as a divider between major page
 * sections, splash screens, or celebration states. The bulb floats; the
 * background carries a subtle grain to add depth.
 */
export function SectionBreak({
  title,
  tagline,
  bulbSize = 200,
  accent = "mint",
}: SectionBreakProps) {
  return (
    <section
      className="relative w-full overflow-hidden rounded-xl"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, var(--color-yellow-light) 0%, var(--color-yellow) 60%, var(--color-yellow-deep) 100%)",
      }}
    >
      {/* Sand-grain texture for depth (matches brand "soft grain" guidance) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Soft warm flare bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--color-warm-flare)" }}
      />

      <div className="relative flex flex-col items-center gap-5 px-6 py-12 text-center sm:py-16">
        <GlassBulb size={bulbSize} accent={accent} />
        <div className="flex flex-col items-center gap-2">
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-navy sm:text-3xl">
            {title}
          </h2>
          {tagline && (
            <p className="max-w-md font-body text-sm font-semibold leading-snug text-navy/80">
              {tagline}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
