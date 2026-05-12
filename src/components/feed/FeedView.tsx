"use client";

// TODO(db): cut Feed over to Postgres once the schema can carry the
// rich shape FeedItem needs — title/body/chart-series/action are
// hand-authored and don't live on agent_anomalies today. Either extend
// agent_anomalies, add a feed_items table, or generate the rich fields
// from the raw anomaly data via templating. Tracked outside this PR.
import { useState } from "react";
import { MOCK_FEED, type FeedItem } from "@/lib/mock/feed";
import { FeedCard } from "@/components/feed/FeedCard";
import { FeedDetailPanel } from "@/components/feed/FeedDetailPanel";
import { LivePulse } from "@/components/ui/LivePulse";

export function FeedView() {
  const [selected, setSelected] = useState<FeedItem | null>(null);

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
          paid-media data. Triage in seconds — open a card to see the chart,
          the campaigns it affected, and what to do next.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:gap-6">
        {MOCK_FEED.map((item, idx) => (
          <FeedCard
            key={item.id}
            item={item}
            enterIndex={idx + 1}
            onSelect={setSelected}
          />
        ))}
      </section>

      <FeedDetailPanel item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
