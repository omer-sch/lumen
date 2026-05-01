"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  MessagesSquare,
  Sparkles,
} from "lucide-react";
import { GlassBulb } from "@/components/ui/GlassBulb";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";
import { cn } from "@/lib/utils";

type Scene = 0 | 1 | 2 | 3 | 4 | 5;
type Mode = "first" | "returning";

// Two cinematics: a full one for the first sign-in (the brand moment),
// and a tight 2-second greeting for the first session of each new day.
// Same-day reloads bypass the page entirely.
const TIMINGS_BY_MODE: Record<Mode, Array<[Scene, number]>> = {
  first: [
    [1, 220],
    [2, 780],
    [3, 1700],
    [4, 2700],
    [5, 4100],
  ],
  returning: [
    [1, 60],
    [2, 220],
    [3, 500],
    [4, 850],
    [5, 1200],
  ],
};

// Auto-advance for returning users — they're here to work, not to watch
// a cinematic. Long enough to register the bulb + signal, short enough to
// feel like a flash of brand presence rather than a tax.
const RETURNING_AUTO_ADVANCE_MS = 2400;

const DESTINATIONS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description:
      "Your live performance pulse — KPIs, channel mix, and signals.",
    icon: LayoutDashboard,
    accent: "ua" as const,
  },
  {
    href: "/queries",
    label: "Ask",
    description:
      "Question your data in plain language. Get answers and charts.",
    icon: MessagesSquare,
    accent: "yellow" as const,
    badge: "new",
  },
  {
    href: "/feed",
    label: "Feed",
    description:
      "Anomalies, trend shifts, and recommendations as they emerge.",
    icon: Sparkles,
    accent: "ua" as const,
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    description:
      "The brain behind Lumen — what it has learned from your data.",
    icon: BookOpen,
    accent: "ua" as const,
  },
];

const COOKIE = "lumen.welcomed.last";
const todayISO = () => new Date().toISOString().slice(0, 10);

const readCookieDate = (): string | null => {
  if (typeof document === "undefined") return null;
  const part = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE}=`));
  return part ? part.split("=")[1] ?? null : null;
};

const setCookieDate = (date: string) => {
  if (typeof document === "undefined") return;
  document.cookie =
    `${COOKIE}=${date}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
};

const fmtToday = () =>
  new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

export default function WelcomePage() {
  const router = useRouter();
  const [scene, setScene] = useState<Scene>(0);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const last = readCookieDate();
    const today = todayISO();

    // Same-day reload — never re-play.
    if (last === today) {
      router.replace("/dashboard");
      return;
    }

    const next: Mode = last ? "returning" : "first";
    setMode(next);
    setCookieDate(today);

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setScene(5);
      // Reduced-motion returners still auto-advance.
      if (next === "returning") {
        const t = window.setTimeout(() => router.replace("/dashboard"), 800);
        return () => window.clearTimeout(t);
      }
      return;
    }

    const timers = TIMINGS_BY_MODE[next].map(([s, ms]) =>
      window.setTimeout(
        () => setScene((cur) => (s > cur ? s : cur)),
        ms,
      ),
    );

    let autoAdvance: number | undefined;
    if (next === "returning") {
      autoAdvance = window.setTimeout(
        () => router.replace("/dashboard"),
        RETURNING_AUTO_ADVANCE_MS,
      );
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (autoAdvance) window.clearTimeout(autoAdvance);
    };
  }, [router]);

  // Returning users can dismiss the greeting instantly with click / Enter / Esc.
  // First-time users keep the deliberate cards-pick flow.
  useEffect(() => {
    if (mode !== "returning") return;
    const skip = () => router.replace("/dashboard");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        skip();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, router]);

  // Hold a bare navy frame until we know which mode to render — avoids a
  // flash of the wrong copy during the cookie read.
  if (mode === null) {
    return <main className="min-h-[100dvh] bg-navy" aria-hidden />;
  }

  const isFinale = scene >= 5;
  const isReturning = mode === "returning";
  const skip = () => router.replace("/dashboard");

  return (
    <main
      onClick={isReturning ? skip : undefined}
      role={isReturning ? "button" : undefined}
      aria-label={isReturning ? "Continue to dashboard" : undefined}
      className={cn(
        "relative min-h-[100dvh] overflow-hidden bg-navy",
        isReturning && "cursor-pointer",
      )}
    >
      {/* Ambient brand glows + grain */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-40 right-[-15%] h-[640px] w-[640px] rounded-full blur-3xl transition-opacity duration-[1500ms] ease-out-quart",
          scene >= 1 ? "opacity-[0.14]" : "opacity-0",
        )}
        style={{ background: "var(--color-yellow)" }}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-[-25%] left-[-15%] h-[720px] w-[720px] rounded-full blur-3xl transition-opacity duration-[1500ms] ease-out-quart",
          scene >= 1 ? "opacity-[0.18]" : "opacity-0",
        )}
        style={{ background: "var(--color-ua)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Top bar — brand mark + manual skip (first-time only) */}
      <header className="relative z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-md font-display text-lg font-extrabold text-navy"
            style={{
              background:
                "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
              boxShadow:
                "0 0 18px color-mix(in oklab, var(--color-yellow) 50%, transparent), inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            L
          </span>
          <span className="font-display text-base font-extrabold tracking-tight text-cloud-white">
            Lumen
          </span>
        </div>

        {!isReturning && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setScene(5);
            }}
            aria-hidden={isFinale}
            tabIndex={isFinale ? -1 : 0}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-[opacity,color,background-color] duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] hover:text-cloud-white focus-mint focus-visible:outline-none",
              isFinale ? "pointer-events-none opacity-0" : "opacity-100",
            )}
          >
            Skip intro
          </button>
        )}
      </header>

      <div
        className={cn(
          "relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 transition-[gap,padding,min-height] duration-[700ms] ease-out-quart sm:px-10",
          isReturning
            ? "min-h-[calc(100dvh-160px)] justify-center gap-6 pb-12"
            : isFinale
              ? "gap-8 pb-16 pt-2 sm:gap-10"
              : "min-h-[calc(100dvh-160px)] justify-center gap-8 pb-12",
        )}
      >
        {/* Bulb — smaller for returning users, the cinematic hero size for first-timers */}
        <div
          className={cn(
            "transition-[opacity,transform] duration-[800ms] ease-out-quart",
            scene >= 2
              ? "translate-y-0 opacity-100"
              : "translate-y-3 opacity-0",
          )}
        >
          <GlassBulb
            size={isReturning ? 160 : isFinale ? 168 : 260}
            accent="mint"
          />
        </div>

        {/* Greeting block */}
        <div className="flex flex-col items-center gap-4 text-center">
          <span
            className={cn(
              "inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--text-muted)] transition-[opacity,transform] duration-[600ms] ease-out-quart",
              scene >= 3
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
          >
            <LivePulse accent="mint" size={6} />
            {isReturning ? fmtToday() : "Lumen is awake"}
          </span>

          <h1
            className={cn(
              "font-display font-extrabold leading-[1.04] tracking-tight text-cloud-white transition-[opacity,transform,font-size] duration-[800ms] ease-out-quart",
              isReturning
                ? "text-3xl sm:text-4xl"
                : isFinale
                  ? "text-3xl sm:text-4xl"
                  : "text-4xl sm:text-[72px] lg:text-[84px]",
              scene >= 3
                ? "translate-y-0 opacity-100"
                : "translate-y-4 opacity-0",
            )}
          >
            {isReturning ? (
              <>
                Welcome <span className="text-gradient-brand">back.</span>
              </>
            ) : (
              <>
                Hi, I&rsquo;m{" "}
                <span className="text-gradient-brand">Lumen.</span>
              </>
            )}
          </h1>

          {isReturning ? (
            <div
              className={cn(
                "flex max-w-xl flex-col gap-1 transition-[opacity,transform] duration-[700ms] ease-out-quart",
                scene >= 4
                  ? "translate-y-0 opacity-100"
                  : "translate-y-3 opacity-0",
              )}
            >
              <p className="font-display text-lg font-bold leading-snug text-cloud-white sm:text-xl">
                ROAS is up{" "}
                <span className="text-ua">5.7%</span> week-over-week.
              </p>
              <p className="font-body text-sm leading-relaxed text-[color:var(--text-muted)]">
                Three signals worth a look on your dashboard.
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "flex max-w-2xl flex-col gap-2 transition-[opacity,transform] duration-[700ms] ease-out-quart",
                scene >= 4
                  ? "translate-y-0 opacity-100"
                  : "translate-y-3 opacity-0",
              )}
            >
              <p className="font-display text-lg font-bold leading-snug text-cloud-white sm:text-xl">
                Your AI lens on yellowHEAD performance.
              </p>
              <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)] sm:text-base">
                I read every signal across Meta, TikTok, Google and AppsFlyer
                &mdash; so you can spend the day on the decisions, not the
                dashboards.
              </p>
            </div>
          )}

          {isReturning && (
            <p
              className={cn(
                "font-body text-[10px] uppercase tracking-[0.28em] text-[color:var(--text-muted)] transition-opacity duration-[600ms] ease-out-quart",
                scene >= 5 ? "opacity-100" : "opacity-0",
              )}
            >
              Click anywhere to continue
            </p>
          )}
        </div>

        {/* Destination grid — first-time users only */}
        {!isReturning && (
          <section
            aria-label="Where to start"
            className={cn(
              "w-full transition-opacity duration-[500ms] ease-out-quart",
              isFinale ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <p
              className={cn(
                "mb-4 text-center text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--text-muted)] transition-opacity duration-[600ms] ease-out-quart",
                isFinale ? "opacity-100" : "opacity-0",
              )}
            >
              Pick a starting point
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {DESTINATIONS.map((d, i) => {
                const Icon = d.icon;
                const isYellow = d.accent === "yellow";
                return (
                  <Link
                    key={d.href}
                    href={d.href}
                    aria-label={`Open ${d.label}`}
                    className="group block rounded-lg focus-mint focus-visible:outline-none"
                  >
                    <GlassCard
                      glow={d.accent}
                      feature={isYellow}
                      shimmer={isYellow}
                      interactive
                      enterIndex={isFinale ? i + 1 : 0}
                      className="flex h-full flex-col gap-4 p-5"
                    >
                      <div className="flex items-start justify-between">
                        <GlassIcon
                          icon={Icon}
                          accentVar={isYellow ? "--color-yellow" : "--color-ua"}
                        />
                        {d.badge && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-yellow"
                            style={{ background: "var(--tint-yellow-soft)" }}
                          >
                            {d.badge}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <h3 className="font-display text-lg font-bold leading-tight text-cloud-white">
                          {d.label}
                        </h3>
                        <p className="text-sm leading-relaxed text-[color:var(--text-secondary)]">
                          {d.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "mt-auto inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition-transform duration-280 ease-out-quart group-hover:translate-x-1",
                          isYellow ? "text-yellow" : "text-ua",
                        )}
                      >
                        Open
                        <ArrowUpRight
                          className="h-3.5 w-3.5"
                          strokeWidth={2.25}
                        />
                      </span>
                    </GlassCard>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
