import { MOCK_FEED } from "@/lib/mock/feed";
import { FeedCard } from "@/components/feed/FeedCard";
import { LivePulse } from "@/components/ui/LivePulse";

export function FeedView() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span
          className="inline-flex items-center gap-2 self-start rounded-full border border-[color:var(--border-glass)] px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--color-ua)]"
          style={{
            background: "color-mix(in oklab, var(--color-ua) 10%, transparent)",
          }}
        >
          <LivePulse accent="mint" size={8} />
          Live · last 24h
        </span>

        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          What Lumen noticed{" "}
          <span
            className="block bg-clip-text text-transparent sm:inline"
            style={{
              backgroundImage:
                "linear-gradient(120deg, var(--color-yellow) 0%, var(--color-ua) 100%)",
            }}
          >
            today.
          </span>
        </h2>

        <p className="max-w-2xl font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Anomalies, trends, and recommendations the AI surfaced from your
          paid-media data. Triage in seconds — drill in only when something
          matters.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {MOCK_FEED.map((item, idx) => (
          <FeedCard key={item.id} item={item} enterIndex={idx + 1} />
        ))}
      </section>

      <p className="mx-auto pt-2 text-center font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
        Phase 0 preview · sample insights · real anomaly detection in Phase 2
      </p>
    </div>
  );
}
