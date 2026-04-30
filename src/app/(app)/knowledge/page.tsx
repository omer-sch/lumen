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
  // Hero pillar leads the bento. Brand pattern: feature card carries yellow.
  {
    icon: Brain,
    title: "Learned context",
    body: "Account naming conventions, campaign ownership, KPI targets, seasonal patterns. Improves with every question asked.",
    glow: "yellow",
    feature: true,
    shimmer: true,
  },
  {
    icon: Database,
    title: "Connected sources",
    body: "Meta, TikTok, Google, AppsFlyer, AppTweak, Search Console, Apple Console — all flowing into Lumen via Rivery.",
    glow: "ua",
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
  // Hero stat leads the bento (Patterns learned — yellow).
  { icon: TrendingUp, label: "Patterns learned", value: 138, accent: true },
  { icon: Layers, label: "Sources connected", value: 7 },
  { icon: Target, label: "KPI targets tracked", value: 24 },
];

export default function KnowledgePage() {
  const [heroPillar, ...sidePillars] = PILLARS;
  const [heroStat, ...sideStats] = STATS;
  const HeroIcon = heroPillar.icon;
  const HeroStatIcon = heroStat.icon;

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

      {/* Pillars — asymmetric bento. Hero spans 7 cols + the two side
          pillars stack in the remaining 5. */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        <GlassCard
          glow={heroPillar.glow}
          feature={heroPillar.feature}
          shimmer={heroPillar.shimmer}
          enterIndex={1}
          className="flex flex-col gap-5 p-6 sm:p-7 lg:col-span-7 lg:row-span-2"
        >
          <GlassIcon icon={HeroIcon} accentVar="--color-yellow" size="lg" />
          <h3 className="font-display text-xl font-extrabold leading-snug tracking-tight text-cloud-white sm:text-2xl">
            {heroPillar.title}
          </h3>
          <p className="max-w-lg font-body text-base leading-relaxed text-[color:var(--text-secondary)]">
            {heroPillar.body}
          </p>
        </GlassCard>

        {sidePillars.map((p, i) => {
          const Icon = p.icon;
          return (
            <GlassCard
              key={p.title}
              glow={p.glow}
              enterIndex={i + 2}
              className="flex flex-col gap-4 p-6 lg:col-span-5"
            >
              <GlassIcon icon={Icon} accentVar="--color-ua" size="md" />
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

      {/* Currently learned strip — asymmetric bento (hero stat + two compact). */}
      <section className="flex flex-col gap-5">
        <h3 className="font-display text-2xl font-bold leading-snug tracking-tight text-cloud-white">
          Currently learned
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <GlassCard
            glow="yellow"
            feature
            shimmer
            enterIndex={4}
            className="flex items-center gap-5 p-6 lg:col-span-6"
          >
            <GlassIcon icon={HeroStatIcon} accentVar="--color-yellow" size="md" />
            <div className="min-w-0">
              <p className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                {heroStat.label}
              </p>
              <p
                className="mt-1 font-display text-3xl font-extrabold leading-none tracking-tight tabular-nums sm:text-4xl"
                style={{
                  color: "var(--color-yellow)",
                  textShadow: "var(--shadow-yellow)",
                }}
              >
                <CountUpNumber value={heroStat.value} duration={1400} />
              </p>
              <p className="mt-2 font-body text-xs text-[color:var(--text-muted)]">
                Patterns Lumen distilled from your accounts so far.
              </p>
            </div>
          </GlassCard>
          {sideStats.map((s, i) => {
            const Icon = s.icon;
            return (
              <GlassCard
                key={s.label}
                glow="ua"
                enterIndex={i + 5}
                className="flex items-center gap-4 p-5 lg:col-span-3"
              >
                <GlassIcon icon={Icon} accentVar="--color-ua" size="sm" />
                <div className="min-w-0">
                  <p className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                    {s.label}
                  </p>
                  <p
                    className="font-display text-2xl font-extrabold leading-none tracking-tight tabular-nums"
                    style={{
                      color: "var(--color-ua)",
                      textShadow:
                        "0 0 14px color-mix(in oklab, var(--color-ua) 28%, transparent)",
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
