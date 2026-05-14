"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatKpi } from "@/lib/format";
import { getClientApiBase } from "@/lib/mock/clients";
import type {
  BQTrendPoint,
  BQTrendPointByNetwork,
  DashboardData,
  DataBounds,
  KPIData,
  NetworkRow,
  PaybackPoint,
  TrendPoint,
} from "@/types/dashboard";

type Args = {
  /** Inclusive UTC start of the active window. */
  from: Date;
  to: Date;
  /** Client slug from `useGlobalFilters`. */
  client: string;
};

/**
 * Per-section error label. `null` when that section's fetch is in flight
 * or succeeded, a short string when it failed. The UI renders one
 * `SectionError` per non-null entry instead of breaking the whole page.
 */
export type SectionErrors = {
  kpis: string | null;
  trend: string | null;
  channelMix: string | null;
};

type State = {
  /** Composed dashboard view. `null` until at least the KPI fetch
   *  resolves — the page can't render meaningfully without KPI numbers.
   *  When KPIs succeed but trend / channelMix fail, those fields are
   *  empty arrays and the corresponding SectionError mounts in place. */
  data: DashboardData | null;
  loading: boolean;
  errors: SectionErrors;
  bounds: DataBounds | null;
  windowEmpty: boolean;
  /** Bump to force a refetch (used by SectionError retry buttons). */
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const NO_ERRORS: SectionErrors = { kpis: null, trend: null, channelMix: null };

/**
 * Whether the active client uses the multi-source query strategy. The
 * strategy itself is a server-only concept (see `bq-security.ts`); the
 * hook only needs to know enough to decide whether to issue the
 * standalone channel-mix request. A slug-based check is fine for now
 * because GlobalComix is the only multi-source client — a future
 * addition should fold this into `clients.ts` so the truth lives in
 * one place.
 */
function isMultiSourceClient(slug: string): boolean {
  return slug === "globalcomix";
}

/**
 * Drives the `/dashboard` data layer. Fires the four BQ-backed requests
 * in parallel and reports them with `Promise.allSettled` so a partial
 * failure surfaces section-by-section instead of nuking the whole page.
 *
 * `data` is only `null` while the first KPI fetch is in flight or the
 * KPI fetch itself failed. Trend / channel mix failures show as empty
 * arrays — the page renders the other tiles plus a `SectionError`
 * placeholder for the failed slot.
 */
export function useDashboardData({ from, to, client }: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    errors: NO_ERRORS,
    bounds: null,
    windowEmpty: false,
    // Filled in below — placeholder for the initial state shape.
    refetch: () => undefined,
  });

  // Avoid setState after unmount when the user navigates fast.
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    abortRef.current?.abort();

    setState((cur) => ({
      ...cur,
      data: null,
      loading: true,
      errors: NO_ERRORS,
      windowEmpty: false,
      refetch,
    }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
    const boundsQs = new URLSearchParams({ client });
    // Agent-strategy clients hit `/api/bq/*`; lumen-union clients (100play,
    // …) route through `/api/bq/<slug>/*` so the per-client query module is
    // reached. The hook stays branchless — `apiBase` carries the choice.
    const apiBase = getClientApiBase(client);
    // Whether to issue the standalone /channel-mix request. Multi-source
    // clients (GlobalComix) derive channel mix from `networkBreakdown`
    // client-side, so they skip the fetch entirely (one fewer BQ
    // request per page load). Agent-strategy clients still need it
    // because their network-breakdown comes back empty.
    const skipChannelMix = isMultiSourceClient(client);

    Promise.allSettled([
      fetchJson<KPIData>(`${apiBase}/dashboard-kpis?${qs}`, ctrl.signal),
      // Multi-source clients (GlobalComix) return one row per (date,
      // network); agent-strategy clients return the legacy aggregate.
      // We type the response permissively here — `groupTrendByNetwork`
      // disambiguates on the way through.
      fetchJson<Array<BQTrendPoint | BQTrendPointByNetwork>>(
        `${apiBase}/trend?${qs}`,
        ctrl.signal,
      ),
      skipChannelMix
        ? Promise.resolve(
            [] as { network: string; spend: number; share: number }[],
          )
        : fetchJson<{ network: string; spend: number; share: number }[]>(
            `${apiBase}/channel-mix?${qs}`,
            ctrl.signal,
          ),
      fetchJson<DataBounds>(`${apiBase}/data-bounds?${boundsQs}`, ctrl.signal),
      fetchJson<NetworkRow[]>(`${apiBase}/network-breakdown?${qs}`, ctrl.signal),
      fetchJson<PaybackPoint[]>(`${apiBase}/payback?${qs}`, ctrl.signal),
    ]).then((results) => {
      if (ctrl.signal.aborted) return;
      const [kpisR, trendR, channelMixR, boundsR, networkR, paybackR] = results;

      const errors: SectionErrors = {
        kpis: kpisR.status === "rejected" ? errMsg(kpisR.reason) : null,
        trend: trendR.status === "rejected" ? errMsg(trendR.reason) : null,
        // Channel-mix errors only surface for agent-strategy clients —
        // the multi-source path resolves to an empty array (never
        // rejects) and derives the mix from networkBreakdown below.
        channelMix:
          channelMixR.status === "rejected" ? errMsg(channelMixR.reason) : null,
      };

      // KPI failure is structural — without those numbers the dashboard
      // has no story to tell, so `data` stays null and `MyDashboard`
      // mounts a KPI-section error in place of the strip + the partials.
      if (kpisR.status === "rejected") {
        setState({
          data: null,
          loading: false,
          errors,
          bounds: boundsR.status === "fulfilled" ? boundsR.value : null,
          windowEmpty: false,
          refetch,
        });
        return;
      }

      const kpis = kpisR.value;
      const trendRaw = trendR.status === "fulfilled" ? trendR.value : [];
      const channelMixWire =
        channelMixR.status === "fulfilled" ? channelMixR.value : [];
      const networkBreakdown =
        networkR.status === "fulfilled" ? networkR.value : [];
      const payback = paybackR.status === "fulfilled" ? paybackR.value : [];

      setState({
        data: mergeBqIntoDashboard({
          kpis,
          trendRaw,
          channelMixWire,
          networkBreakdown,
          payback,
          from,
          to,
        }),
        loading: false,
        errors,
        bounds: boundsR.status === "fulfilled" ? boundsR.value : null,
        windowEmpty: !(kpis.spend > 0),
        refetch,
      });
    });

    return () => ctrl.abort();
    // We don't include `from`/`to` Date objects directly — their ISO strings
    // are the stable identity that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromIso, toIso, nonce, refetch]);

  return state;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

// ── BQ → UI DashboardData translation ──────────────────────────────────────

/**
 * Detects whether the trend payload is per-(date, network) (multi-source
 * clients) or aggregate (agent-strategy). The per-network rows carry a
 * `network` field; we use the presence of that field as the
 * discriminator instead of inspecting the active client config, which
 * keeps this function self-contained for tests.
 */
function isByNetworkTrend(
  trend: Array<BQTrendPoint | BQTrendPointByNetwork>,
): trend is BQTrendPointByNetwork[] {
  if (trend.length === 0) return false;
  return typeof (trend[0] as BQTrendPointByNetwork).network === "string";
}

/** Pre-shape a single BQ trend row for the TrendChart consumer. */
function toTrendPoint(p: BQTrendPoint): TrendPoint {
  return {
    date: p.date.slice(5, 10),
    spend: Math.round(p.spend),
    installs: Math.round(p.installs),
    clicks: p.clicks != null ? Math.round(p.clicks) : 0,
    impressions: p.impressions != null ? Math.round(p.impressions) : 0,
    ftdD7: p.ftdD7 != null ? Math.round(p.ftdD7) : 0,
    subStart: p.subStart != null ? Math.round(p.subStart) : 0,
    subD0: p.subD0 != null ? Math.round(p.subD0) : 0,
    subD7: p.subD7 != null ? Math.round(p.subD7) : 0,
    cpi: +p.cpi.toFixed(2),
    cpSubStart: p.cpSubStart != null ? +p.cpSubStart.toFixed(2) : 0,
    cpaD0: p.cpaD0 != null ? +p.cpaD0.toFixed(2) : 0,
    cpaD7: p.cpaD7 != null ? +p.cpaD7.toFixed(2) : 0,
    roas: +p.roas.toFixed(2),
    ctr: p.ctr != null ? +p.ctr.toFixed(4) : 0,
    cpm: p.cpm != null ? +p.cpm.toFixed(2) : 0,
    cpc: p.cpc != null ? +p.cpc.toFixed(2) : 0,
    revD7: p.revD7 != null ? Math.round(p.revD7) : 0,
    revD30: p.revD30 != null ? Math.round(p.revD30) : 0,
    roasD14: p.roasD14 != null ? +p.roasD14.toFixed(3) : 0,
    roasD30: p.roasD30 != null ? +p.roasD30.toFixed(3) : 0,
    roasD90: p.roasD90 != null ? +p.roasD90.toFixed(3) : 0,
    retD7: p.retD7 != null ? +p.retD7.toFixed(4) : 0,
    payersD7: p.payersD7 != null ? Math.round(p.payersD7) : 0,
  };
}

/**
 * Bucket per-(date, network) rows into one `{network, points}` group
 * per network. The order of `points` is preserved (BQ ORDER BY date,
 * network), which means each group ends up sorted by date even without
 * an explicit sort here. Exported for unit testing.
 */
export function groupTrendByNetwork(
  rows: BQTrendPointByNetwork[],
): { network: string; points: TrendPoint[] }[] {
  const byNetwork = new Map<string, TrendPoint[]>();
  for (const row of rows) {
    const arr = byNetwork.get(row.network);
    const point = toTrendPoint(row);
    if (arr) arr.push(point);
    else byNetwork.set(row.network, [point]);
  }
  return Array.from(byNetwork, ([network, points]) => ({ network, points }));
}

/**
 * Sum per-(date, network) rows into a single aggregate series per date.
 * Used so the legacy `trend` field on DashboardData still carries a
 * usable series for consumers that don't yet know about the per-network
 * shape (sparklines in KpiCard, for example).
 */
function aggregateTrendByDate(rows: BQTrendPointByNetwork[]): TrendPoint[] {
  const byDate = new Map<string, BQTrendPointByNetwork[]>();
  for (const row of rows) {
    const arr = byDate.get(row.date);
    if (arr) arr.push(row);
    else byDate.set(row.date, [row]);
  }
  // Sums for additive metrics, weighted-by-spend recomputation for rate
  // metrics. The rate recompute matters: averaging four networks' CPIs
  // unweighted would let a $1 spend on Apple drag the average around.
  return Array.from(byDate, ([date, group]) => {
    const sum = (k: keyof BQTrendPointByNetwork) =>
      group.reduce((acc, r) => acc + ((r[k] as number) ?? 0), 0);
    const spend = sum("spend");
    const installs = sum("installs");
    const clicks = sum("clicks");
    const impressions = sum("impressions");
    const subStart = sum("subStart");
    const subD0 = sum("subD0");
    const subD7 = sum("subD7");
    const revD7 = sum("revD7");
    const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);
    const point: BQTrendPoint = {
      date,
      spend,
      installs,
      cpi: safeDiv(spend, installs),
      roas: safeDiv(revD7, spend),
      clicks,
      impressions,
      ftdD7: sum("ftdD7"),
      subStart,
      subD0,
      subD7,
      cpSubStart: safeDiv(spend, subStart),
      cpaD0: safeDiv(spend, subD0),
      cpaD7: safeDiv(spend, subD7),
      ctr: safeDiv(clicks, impressions),
      cpm: safeDiv(spend * 1000, impressions),
      cpc: safeDiv(spend, clicks),
      revD7,
      revD30: sum("revD30"),
      roasD14: 0,
      roasD30: 0,
      roasD90: 0,
      retD7: 0,
      payersD7: sum("payersD7"),
    };
    return toTrendPoint(point);
  });
}

function mergeBqIntoDashboard(args: {
  kpis: KPIData;
  trendRaw: Array<BQTrendPoint | BQTrendPointByNetwork>;
  /** Agent-strategy clients return rows here; multi-source clients pass
   *  an empty array because the channel-mix fetch is skipped for them. */
  channelMixWire: { network: string; spend: number; share: number }[];
  networkBreakdown: NetworkRow[];
  payback: PaybackPoint[];
  from: Date;
  to: Date;
}): DashboardData {
  const {
    kpis,
    trendRaw,
    channelMixWire,
    networkBreakdown,
    payback,
    from,
    to,
  } = args;
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
  const periodLabel = `vs prev ${days}d`;
  // Preserve `null` so a missing prior period renders as "—" in KpiCard
  // instead of a misleading "+0.0%".
  const toPct = (frac: number | null | undefined): number | null =>
    frac == null ? null : +(frac * 100).toFixed(1);

  // Trend shape:
  //  - multi-source (GlobalComix) → per-network series for the chart,
  //    plus an aggregate series for legacy consumers (KpiCard
  //    sparklines, future reports).
  //  - agent-strategy → just the aggregate, no per-network split.
  let trendOut: TrendPoint[];
  let trendByNetwork: { network: string; points: TrendPoint[] }[];
  if (isByNetworkTrend(trendRaw)) {
    trendByNetwork = groupTrendByNetwork(trendRaw);
    trendOut = aggregateTrendByDate(trendRaw);
  } else {
    trendByNetwork = [];
    trendOut = (trendRaw as BQTrendPoint[]).map(toTrendPoint);
  }

  // Channel mix:
  //  - multi-source → derived from networkBreakdown rows. One fewer
  //    BQ query per page load; same numbers because networkBreakdown's
  //    `share` is computed against the same total.
  //  - agent-strategy → comes from the dedicated /channel-mix wire
  //    payload (`channelMixWire`); networkBreakdown is empty here.
  const cm = networkBreakdown.length > 0
    ? networkBreakdown
        .filter((r) => r.spend > 0)
        .map((r) => ({
          channel: r.network,
          spend: Math.round(r.spend),
          pct: +(r.share * 100).toFixed(1),
        }))
    : channelMixWire
        .filter((c) => c.spend > 0)
        .map((c) => ({
          channel: c.network,
          spend: Math.round(c.spend),
          pct: +(c.share * 100).toFixed(1),
        }));

  // Helper that returns 0 for nullish values — multi-source clients
  // populate every field, agent-strategy clients leave most undefined.
  const v = (x: number | undefined): number => x ?? 0;

  return {
    kpis: [
      {
        id: "cpaD7",
        label: "Cost per subscriber at 1 week",
        value: formatKpi.cpi(v(kpis.cpaD7)),
        delta: toPct(kpis.cpaD7Delta),
        direction: "lower-better",
        hint: "lower is better · CPA at D7",
      },
      {
        id: "spend",
        label: "Total spend",
        value: formatKpi.money(Math.round(kpis.spend)),
        delta: toPct(kpis.spendDelta),
        direction: "higher-better",
        hint: "what we paid for ads in this period",
      },
      {
        id: "installs",
        label: "New installs",
        value: formatKpi.count(Math.round(kpis.installs)),
        delta: toPct(kpis.installsDelta),
        direction: "higher-better",
        hint: "people who downloaded the app",
      },
      {
        id: "subD7",
        label: "Subscribers at 1 week",
        value: formatKpi.count(Math.round(v(kpis.subD7))),
        delta: toPct(kpis.subD7Delta),
        direction: "higher-better",
        hint: "people paying within their first week",
      },
      {
        id: "subStart",
        label: "Sub starts",
        value: formatKpi.count(Math.round(v(kpis.subStart))),
        delta: toPct(kpis.subStartDelta),
        direction: "higher-better",
        hint: "first-payment events in period",
      },
      {
        id: "subD0",
        label: "Subscribers at 1 day",
        value: formatKpi.count(Math.round(v(kpis.subD0))),
        delta: toPct(kpis.subD0Delta),
        direction: "higher-better",
        hint: "people paying within day 0",
      },
      {
        id: "cpSubStart",
        label: "Cost per sub start",
        value: formatKpi.cpi(v(kpis.cpSubStart)),
        delta: toPct(kpis.cpSubStartDelta),
        direction: "lower-better",
        hint: "spend ÷ sub starts",
      },
      {
        id: "cpaD0",
        label: "Cost per subscriber at 1 day",
        value: formatKpi.cpi(v(kpis.cpaD0)),
        delta: toPct(kpis.cpaD0Delta),
        direction: "lower-better",
        hint: "spend ÷ subscribers at D0",
      },
      {
        id: "clicks",
        label: "Clicks",
        value: formatKpi.count(Math.round(v(kpis.clicks))),
        delta: toPct(kpis.clicksDelta),
        direction: "higher-better",
        hint: "raw click volume",
      },
      {
        id: "impressions",
        label: "Impressions",
        value: formatKpi.count(Math.round(v(kpis.impressions))),
        delta: toPct(kpis.impressionsDelta),
        direction: "higher-better",
        hint: "raw impression volume",
      },
      {
        id: "cpi",
        label: "CPI",
        value: formatKpi.cpi(kpis.cpi),
        delta: toPct(kpis.cpiDelta),
        direction: "lower-better",
        hint: "lower is better",
      },
      {
        id: "ctr",
        label: "CTR",
        value: formatKpi.percent(v(kpis.ctr)),
        delta: toPct(kpis.ctrDelta),
        direction: "higher-better",
        hint: "clicks per impression",
      },
      {
        id: "cpm",
        label: "CPM",
        value: formatKpi.moneyCents(v(kpis.cpm)),
        delta: toPct(kpis.cpmDelta),
        direction: "lower-better",
        hint: "cost per 1k impressions",
      },
      {
        id: "cpc",
        label: "CPC",
        value: formatKpi.moneyCents(v(kpis.cpc)),
        delta: toPct(kpis.cpcDelta),
        direction: "lower-better",
        hint: "cost per click",
      },
      {
        id: "revD7",
        label: "Revenue D7",
        value: formatKpi.money(Math.round(v(kpis.revD7))),
        delta: toPct(kpis.revD7Delta),
        direction: "higher-better",
        hint: "cohort revenue, D7",
      },
      {
        id: "revD30",
        label: "Revenue D30",
        value: formatKpi.money(Math.round(v(kpis.revD30))),
        delta: toPct(kpis.revD30Delta),
        direction: "higher-better",
        hint: "cohort revenue, D30",
      },
      {
        id: "roas",
        label: "ROAS D7",
        value: formatKpi.ratio(kpis.roas),
        delta: toPct(kpis.roasDelta),
        direction: "higher-better",
        hint: "cohort D7",
      },
      {
        id: "roasD14",
        label: "ROAS D14",
        value: formatKpi.ratio(v(kpis.roasD14)),
        delta: toPct(kpis.roasD14Delta),
        direction: "higher-better",
        hint: "cohort D14",
      },
      {
        id: "roasD30",
        label: "ROAS D30",
        value: formatKpi.ratio(v(kpis.roasD30)),
        delta: toPct(kpis.roasD30Delta),
        direction: "higher-better",
        hint: "cohort D30",
      },
      {
        id: "roasD90",
        label: "ROAS D90",
        value: formatKpi.ratio(v(kpis.roasD90)),
        delta: toPct(kpis.roasD90Delta),
        direction: "higher-better",
        hint: "cohort D90 (matures slowly)",
      },
      {
        id: "retD7",
        label: "Retention D7",
        value: formatKpi.percent(v(kpis.retD7)),
        delta: toPct(kpis.retD7Delta),
        direction: "higher-better",
        hint: "users returning by D7",
      },
      {
        id: "payersD7",
        label: "Payers D7",
        value: formatKpi.count(v(kpis.payersD7)),
        delta: toPct(kpis.payersD7Delta),
        direction: "higher-better",
        hint: "first-week payers",
      },
      {
        id: "ftdD7",
        label: "FTD D7",
        value: formatKpi.count(v(kpis.ftdD7)),
        delta: toPct(kpis.ftdD7Delta),
        direction: "higher-better",
        hint: "first-time deposits, D7",
      },
    ],
    trend: trendOut,
    trendByNetwork,
    channelMix: cm,
    networkBreakdown,
    payback,
  };
  // `periodLabel` retained for downstream report consumers — kept as a
  // local so adding it back to a hint is a one-line change.
  void periodLabel;
}
