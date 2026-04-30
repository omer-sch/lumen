import { Sparkles } from "lucide-react";
import { getDashboardData } from "@/lib/mock/dashboard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ChannelMix } from "@/components/dashboard/ChannelMix";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";

export function DashboardView() {
  const data = getDashboardData();
  // Yellow is intentional — promote one KPI as the hero. Everything else mint.
  const highlightId = "roas";

  // Reorder so the hero KPI leads the bento. Asymmetric grid: hero spans 6
  // of 12 cols on lg+, the three companions split the rest 2/2/2.
  const heroKpi = data.kpis.find((k) => k.id === highlightId);
  const otherKpis = data.kpis.filter((k) => k.id !== highlightId);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      {/* Hero */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "color-mix(in oklab, var(--color-ua) 12%, transparent)",
              color: "var(--color-ua)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
              boxShadow:
                "0 0 24px color-mix(in oklab, var(--color-ua) 18%, transparent)",
            }}
          >
            <LivePulse accent="mint" size={8} />
            UA · last 30 days
          </span>
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
            Paid performance{" "}
            <span
              className="block bg-clip-text text-transparent sm:inline"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, var(--color-ua) 0%, var(--color-ua-glow) 55%, var(--color-yellow) 100%)",
              }}
            >
              looking sharp.
            </span>
          </h2>
          <p className="max-w-xl font-body text-sm text-[color:var(--text-secondary)]">
            ROAS crossed your weekly target. CPI is trending down. Lumen flagged
            two opportunities to scale and one creative to retire.
          </p>
        </div>

        <GlassCard glow="ua" feature className="flex max-w-xs items-start gap-3 p-4">
          <GlassIcon icon={Sparkles} accentVar="--color-ua" size="sm" />
          <div className="min-w-0">
            <p className="font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
              Today&rsquo;s hint
            </p>
            <p className="mt-1 font-body text-sm leading-snug text-cloud-white">
              TikTok HC creatives are{" "}
              <span className="font-semibold text-ua">+34%</span>. Worth
              promoting to its own ad set.
            </p>
          </div>
        </GlassCard>
      </header>

      {/* KPIs — asymmetric bento. Hero (ROAS) spans wide, three compact tiles
          fill the rest. On md the layout is 2x2; on mobile it stacks. */}
      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-12 lg:gap-6">
        {heroKpi && (
          <div className="lg:col-span-6 lg:row-span-2">
            <KpiCard
              label={heroKpi.label}
              value={heroKpi.value}
              delta={heroKpi.delta}
              direction={heroKpi.direction}
              hint={heroKpi.hint}
              highlight
              size="hero"
              enterIndex={1}
            />
          </div>
        )}
        {otherKpis.map((kpi, i) => (
          <div key={kpi.id} className="lg:col-span-2">
            <KpiCard
              label={kpi.label}
              value={kpi.value}
              delta={kpi.delta}
              direction={kpi.direction}
              hint={kpi.hint}
              size="compact"
              enterIndex={i + 2}
            />
          </div>
        ))}
      </section>

      {/* Trend + mix — already asymmetric (2:1). */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <TrendChart trend={data.trend} enterIndex={5} />
        </div>
        <ChannelMix data={data.channelMix} enterIndex={6} />
      </section>
    </div>
  );
}
