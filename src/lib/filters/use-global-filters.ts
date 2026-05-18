"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  isDashboardTab,
  isOsFilter,
  isPlatformFilter,
  type DashboardTab,
  type OsFilter,
  type PlatformFilter,
} from "@/lib/filters/types";

export type DateRangePreset = "7d" | "14d" | "30d" | "90d" | "custom";

export interface GlobalFilters {
  range: DateRangePreset;
  /** Inclusive start of the active window (UTC midnight). */
  from: Date;
  /** Inclusive end of the active window (UTC midnight, the "today" anchor). */
  to: Date;
  /** Client slug — always a specific live BQ client. */
  client: string;
  /** OS filter (WS6). Default "total" — no OS predicate applied. */
  os: OsFilter;
  /** Platform filter (WS6). Empty array means "all platforms" — no filter. */
  platforms: PlatformFilter[];
  /** Dashboard sub-page tab. Default "performance". Persists as `?tab=`
   *  on the URL when non-default. */
  tab: DashboardTab;
}

const DEFAULT_CLIENT = "globalcomix";

export const RANGE_DAYS: Record<Exclude<DateRangePreset, "custom">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

const todayUTC = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const subDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() - n);
  return out;
};

const parseISODate = (s: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const isPreset = (s: string | null): s is DateRangePreset =>
  s === "7d" || s === "14d" || s === "30d" || s === "90d" || s === "custom";

export function resolveRange(
  range: DateRangePreset,
  fromParam: string | null,
  toParam: string | null,
): { from: Date; to: Date } {
  if (range === "custom") {
    const to = parseISODate(toParam) ?? todayUTC();
    const from = parseISODate(fromParam) ?? subDays(to, 30);
    return { from, to };
  }
  const today = todayUTC();
  const days = RANGE_DAYS[range];
  return { from: subDays(today, days - 1), to: today };
}

/**
 * Single source of truth for the global filter. Reads + writes URL search
 * params so filter state survives navigation, refresh, and link sharing.
 *
 *   ?range=7d                   → preset, derived from/to
 *   ?range=custom&from=...&to=… → custom window
 *   ?client=acme                → narrow to a single client
 *
 * The hook intentionally does NOT live in React context — every page reads
 * the URL directly. That keeps the contract auditable in the address bar
 * and makes a deep link trivially shareable.
 */
export function useGlobalFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rangeParam = params.get("range");
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const clientParam = params.get("client");
  const osParam = params.get("os");
  const platformsParam = params.get("platforms");
  const tabParam = params.get("tab");

  const filters: GlobalFilters = useMemo(() => {
    const range: DateRangePreset = isPreset(rangeParam) ? rangeParam : "30d";
    const client = clientParam ?? DEFAULT_CLIENT;
    const { from, to } = resolveRange(range, fromParam, toParam);
    const osCandidate = osParam?.trim().toLowerCase() ?? "";
    const os: OsFilter = isOsFilter(osCandidate) ? osCandidate : "total";
    const platforms = parsePlatforms(platformsParam);
    const tabCandidate = tabParam?.trim().toLowerCase() ?? "";
    const tab: DashboardTab = isDashboardTab(tabCandidate)
      ? tabCandidate
      : "performance";
    return { range, from, to, client, os, platforms, tab };
  }, [rangeParam, fromParam, toParam, clientParam, osParam, platformsParam, tabParam]);

  const replaceWith = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(params.toString());
      mutate(sp);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const setRange = useCallback(
    (range: DateRangePreset) => {
      replaceWith((sp) => {
        if (range === "custom") {
          sp.set("range", "custom");
          // keep current from/to if present, otherwise default to last 30d
          if (!sp.get("from")) sp.set("from", toISODate(subDays(todayUTC(), 30)));
          if (!sp.get("to")) sp.set("to", toISODate(todayUTC()));
        } else {
          sp.set("range", range);
          sp.delete("from");
          sp.delete("to");
        }
      });
    },
    [replaceWith],
  );

  const setCustomRange = useCallback(
    (from: Date, to: Date) => {
      replaceWith((sp) => {
        sp.set("range", "custom");
        sp.set("from", toISODate(from));
        sp.set("to", toISODate(to));
      });
    },
    [replaceWith],
  );

  const setClient = useCallback(
    (client: string) => {
      replaceWith((sp) => {
        if (!client || client === DEFAULT_CLIENT) sp.delete("client");
        else sp.set("client", client);
      });
    },
    [replaceWith],
  );

  const setOs = useCallback(
    (os: OsFilter) => {
      replaceWith((sp) => {
        // "total" is the default — omit it from the URL so deep links stay clean.
        if (os === "total") sp.delete("os");
        else sp.set("os", os);
      });
    },
    [replaceWith],
  );

  const setPlatforms = useCallback(
    (platforms: PlatformFilter[]) => {
      replaceWith((sp) => {
        // Empty array means "all platforms" — omit from URL.
        if (platforms.length === 0) sp.delete("platforms");
        // Deduplicate + sort so the URL is canonical regardless of click order.
        else sp.set("platforms", [...new Set(platforms)].sort().join(","));
      });
    },
    [replaceWith],
  );

  const setTab = useCallback(
    (tab: DashboardTab) => {
      replaceWith((sp) => {
        // "performance" is the default; omit it from the URL so the
        // shipped /dashboard link stays clean.
        if (tab === "performance") sp.delete("tab");
        else sp.set("tab", tab);
      });
    },
    [replaceWith],
  );

  return {
    ...filters,
    setRange,
    setCustomRange,
    setClient,
    setOs,
    setPlatforms,
    setTab,
  };
}

/**
 * Parse the comma-separated platforms query param. Unknown tokens are
 * dropped silently — keeps a garbage URL from breaking the dashboard.
 */
function parsePlatforms(raw: string | null): PlatformFilter[] {
  if (!raw) return [];
  const out: PlatformFilter[] = [];
  for (const token of raw.split(",")) {
    const t = token.trim().toLowerCase();
    if (isPlatformFilter(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Returns the inclusive day count of the active window. */
export const windowDays = (f: Pick<GlobalFilters, "from" | "to">) =>
  Math.max(
    1,
    Math.round((f.to.getTime() - f.from.getTime()) / 86_400_000) + 1,
  );

/** Same window, shifted backwards — useful for "vs prev period" deltas. */
export const previousWindow = (f: Pick<GlobalFilters, "from" | "to">) => {
  const days = windowDays(f);
  return {
    from: subDays(f.from, days),
    to: subDays(f.to, days),
  };
};

export const TODAY = todayUTC;
