import "server-only";

/**
 * In-process counter for cache events. Lightweight on purpose: a real
 * metrics pipeline (Datadog, Sentry insights, Grafana) is the right
 * long-term home for this, but until we wire one up we still want to
 * answer the basic operational question "are we even getting hits?"
 * without tailing logs.
 *
 * Survives the process lifetime of a single function instance; resets on
 * cold start. That's fine for now because Vercel's typical instance
 * lifetime in production runs minutes to hours and we mostly want
 * directionally-correct ratios, not historical accuracy.
 *
 * Stored on `globalThis` so dev-mode HMR doesn't re-init the counter
 * every time a route handler reloads.
 */

type EventKind = "hit" | "miss" | "error" | "bypass";

type Counters = Record<EventKind, Record<string, number>>;

type Store = {
  counters: Counters;
  lastUpdated: number;
};

const KEY = "__lumenCacheStats__";

function getStore(): Store {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      counters: { hit: {}, miss: {}, error: {}, bypass: {} },
      lastUpdated: Date.now(),
    };
  }
  return g[KEY] as Store;
}

export function recordCacheEvent(kind: EventKind, query: string): void {
  const store = getStore();
  const bucket = store.counters[kind];
  bucket[query] = (bucket[query] ?? 0) + 1;
  store.lastUpdated = Date.now();
}

export function readCacheStats(): {
  counters: Counters;
  lastUpdated: string;
  totals: Record<EventKind, number>;
} {
  const store = getStore();
  const totals: Record<EventKind, number> = {
    hit: 0,
    miss: 0,
    error: 0,
    bypass: 0,
  };
  for (const kind of Object.keys(store.counters) as EventKind[]) {
    for (const n of Object.values(store.counters[kind])) {
      totals[kind] += n;
    }
  }
  return {
    counters: store.counters,
    lastUpdated: new Date(store.lastUpdated).toISOString(),
    totals,
  };
}

/** Test-only. Lets vitest cases assert against a clean counter. */
export function resetCacheStatsForTests(): void {
  const g = globalThis as unknown as Record<string, Store | undefined>;
  g[KEY] = undefined;
}
