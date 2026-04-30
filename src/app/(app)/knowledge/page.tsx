import { BookOpen, Brain, Database, Sparkles, Target, TrendingUp, Layers } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { CountUpNumber } from "@/components/ui/CountUpNumber";

type Glow = "yellow" | "ua";

type Pillar = {
  icon: typeof Database;
  title: string;
  body: string;
  glow: Glow;
  feature?: boolean;
  shimmer?: boolean;
};

const PILLARS: Pillar[] = [
  {
    icon: Database,
    title: "Connected sources",
    body: "Meta, TikTok, Google, AppsFlyer, AppTweak, Search Console, Apple Console — all flowing into Lumen via Rivery.",
    glow: "ua",
  },
  {
    icon: Brain,
    title: "Learned context",
    body: "Account naming conventions, campaign ownership, KPI targets, seasonal patterns. Improves with every question asked.",
    glow: "yellow",
    feature: true,
    shimmer: true,
  },
  {
    icon: BookOpen,
    title: "Internal knowledge",
    body: "Playbooks, post-mortems, and team-specific guidance — all queryable through Ask.",
    glow: "ua",
  },
];

type Stat = {
  icon: typeof Layers;
  label: string;
  value: number;
  accent?: boolean;
};

const STATS: Stat[] = [
  { icon: Layers, label: "Sources connected", value: 7 },
  { icon: Target, label: "KPI targets tracked", value: 24 },
  { icon: TrendingUp, label: "Patterns learned", value: 138, accent: true },
];

export default function KnowledgePage() {
  return (
    <div className="flex flex-col gap-12">
      {/* Hero — compact inline header. The yellow + glass-bulb SectionBreak
          is reserved for real brand moments (loading, onboarding, success);
          it doesn't belong at every page top. */}
      <header className="flex flex-col gap-2">
        <p className="font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
          The brain
        </p>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          What Lumen <span className="text-gradient-brand">knows.</span>
        </h2>
        <p className="max-w-2xl font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          The foundation under everything else. Lumen learns your data,
          structures, and team patterns, then uses that context to answer
          questions and surface insight.
        </p>
      </header>

      {/* Pillars */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {PILLARS.map((p, i) => {
          const Icon = p.icon;
          const accentVar = p.glow === "yellow" ? "--color-yellow" : "--color-ua";
          return (
            <GlassCard
              key={p.title}
              glow={p.glow}
              feature={p.feature}
              shimmer={p.shimmer}
              enterIndex={i + 1}
              className="flex flex-col gap-4 p-6"
            >
              <GlassIcon icon={Icon} accentVar={accentVar} size="md" />
              <h3 className="font-display text-md font-bold leading-snug text-cloud-white">
                {p.title}
              </h3>
              <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
                {p.body}
              </p>
            </GlassCard>
          );
        })}
      </section>

      {/* Currently learned strip */}
      <section className="flex flex-col gap-5">
        <h3 className="font-display text-2xl font-bold leading-snug tracking-tight text-cloud-white">
          Currently learned
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATS.map((s, i) => {
            const Icon = s.icon;
            const accentVar = s.accent ? "--color-yellow" : "--color-ua";
            return (
              <GlassCard
                key={s.label}
                glow={s.accent ? "yellow" : "ua"}
                feature={s.accent}
                enterIndex={i + 4}
                className="flex items-center gap-4 p-5"
              >
                <GlassIcon icon={Icon} accentVar={accentVar} size="sm" />
                <div className="min-w-0">
                  <p className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                    {s.label}
                  </p>
                  <p
                    className="font-display text-2xl font-extrabold leading-none tracking-tight"
                    style={{
                      color: s.accent
                        ? "var(--color-yellow)"
                        : "var(--color-ua)",
                      textShadow: s.accent
                        ? "0 0 18px color-mix(in oklab, var(--color-yellow) 35%, transparent)"
                        : "0 0 14px color-mix(in oklab, var(--color-ua) 28%, transparent)",
                    }}
                  >
                    <CountUpNumber value={s.value} />
                  </p>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>

      {/* Closing invitation */}
      <section>
        <GlassCard
          glow="ua"
          enterIndex={7}
          className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <GlassIcon icon={Sparkles} accentVar="--color-ua" size="sm" />
            <div className="flex flex-col gap-1">
              <p className="font-display text-md font-bold leading-snug text-cloud-white">
                More patterns learned every day.
              </p>
              <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
                Keep asking — Lumen sharpens itself with every question.
              </p>
            </div>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
