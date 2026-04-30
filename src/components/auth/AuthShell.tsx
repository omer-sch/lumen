import type { ReactNode } from "react";
import { GlassBulb } from "@/components/ui/GlassBulb";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-navy text-cloud-white">
      {/* Brand glow blobs — yellow upper-left, mint lower-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "var(--color-yellow)", opacity: 0.16 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{ background: "var(--color-ua)", opacity: 0.18 }}
      />

      {/* Floating glass bulb — large, behind the form, drifting slowly */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-60px] top-[10%] hidden opacity-70 lg:block"
      >
        <GlassBulb size={260} accent="mint" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 bottom-[8%] hidden opacity-50 lg:block"
      >
        <GlassBulb size={180} accent="warm" />
      </div>

      {/* Faint sand grain — fixed pseudo-layer is GPU-cheap */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-8 px-6 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="grid h-14 w-14 place-items-center rounded-xl font-display text-2xl font-extrabold text-navy"
            style={{
              background:
                "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
              boxShadow:
                "0 0 24px color-mix(in oklab, var(--color-yellow) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            L
          </span>
          <span className="font-display text-3xl font-extrabold leading-none tracking-tight text-cloud-white">
            Lumen
          </span>
          <h1 className="mt-1 font-display text-md font-bold text-cloud-white">
            {title}
          </h1>
          <p className="text-sm text-[color:var(--text-secondary)]">
            {subtitle}
          </p>
        </div>

        {/* Double-Bezel auth shell — outer machined-hardware tray cradling
            the glass core. Brand calls for the auth surface to feel like
            a physical artifact, not a form panel. */}
        <div
          className="relative w-full animate-card-enter rounded-xl p-1.5"
          style={{
            background:
              "linear-gradient(140deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 50%, rgba(0,0,0,0.10) 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(0,0,0,0.40)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="shimmer-overlay relative w-full overflow-hidden rounded-lg p-6 backdrop-blur-glass"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%), var(--surface-glass)",
              border: "1px solid var(--border-glass)",
              boxShadow: "var(--shadow-elevated), var(--shadow-mint)",
            }}
          >
            {children}
          </div>
        </div>

        <p className="text-xs text-[color:var(--text-muted)]">
          yellowHEAD · performance with intelligence
        </p>
      </div>
    </main>
  );
}
