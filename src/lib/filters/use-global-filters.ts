"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DateRangePreset = "7d" | "14d" | "30d" | "90d" | "custom";

export interface GlobalFilters {
  range: DateRangePreset;
  /** Inclusive start of the active window (UTC midnight). */
  from: Date;
  /** Inclusive end of the active window (UTC midnight, the "today" anchor). */
  to: Date;
  /** Client slug, or "all" when no specific client is selected. */
  client: string;
}

export const RANGE_DAYS: Record<Exclude<DateRangePreset, "custom">, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

/** Pinned "today" so the mock data lines up with the seeded dataset. When
 *  Lumen ships against a live DB this becomes `new Date()`. */
const TODAY_ISO = "2026-04-30";

const todayUTC = () => new Date(`${TODAY_ISO}T00:00:00Z`);

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

  const filters: GlobalFilters = useMemo(() => {
    const range: DateRangePreset = isPreset(rangeParam) ? rangeParam : "30d";
    const client = clientParam ?? "all";
    const { from, to } = resolveRange(range, fromParam, toParam);
    return { range, from, to, client };
  }, [rangeParam, fromParam, toParam, clientParam]);

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
        if (!client || client === "all") sp.delete("client");
        else sp.set("client", client);
      });
    },
    [replaceWith],
  );

  return { ...filters, setRange, setCustomRange, setClient };
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
