"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { cn } from "@/lib/utils";

/**
 * Admin-only "Sync now" affordance, rendered next to the freshness
 * stamp in the dashboard header.
 *
 * Why a client component and not a server-rendered one: the admin
 * check is asynchronous (a fetch to `/api/me/admin`) and the dashboard
 * header is already a "use client" subtree because of the freshness
 * polling. Doing the admin probe here keeps everything in one place;
 * the round-trip is one tiny JSON fetch and runs in parallel with the
 * freshness fetch already on the page.
 *
 * Non-admins see nothing — the gate is server-authoritative (the
 * refresh route enforces it again on the request), the hidden-button
 * behavior is a UX nicety, not a security boundary.
 */
type Status = "idle" | "loading" | "success" | "error";

export function SyncNowButton() {
  const router = useRouter();
  const { client } = useGlobalFilters();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Probe the admin gate once. The result rarely changes mid-session
  // and the freshness bar re-fetches on every client change anyway —
  // the admin status is global, not per-client, so we don't re-run.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/admin", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { isAdmin?: boolean }) => {
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = useCallback(async () => {
    if (status === "loading") return;
    setStatus("loading");
    setMessage(null);
    try {
      const qs = new URLSearchParams({ client });
      const res = await fetch(`/api/cache/refresh?${qs.toString()}`, {
        method: "POST",
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Refresh failed (${res.status})`);
      }
      const data = (await res.json()) as {
        dataAsOf: string | null;
        warmedQueries: number;
      };
      const stamp = data.dataAsOf
        ? formatDataAsOf(data.dataAsOf)
        : "freshly synced";
      setStatus("success");
      setMessage(`Synced. Data current as of ${stamp}.`);
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  }, [client, router, status]);

  if (!isAdmin) return null;

  const isLoading = status === "loading";
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        data-testid="sync-now-button"
        aria-label="Sync data now"
        onClick={onClick}
        disabled={isLoading}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-body text-[11px] font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          isLoading
            ? "cursor-wait text-[color:var(--text-muted)]"
            : "text-ua hover:text-[color:var(--color-ua)]",
        )}
        style={{
          background: "color-mix(in oklab, var(--color-ua) 8%, transparent)",
          border:
            "1px solid color-mix(in oklab, var(--color-ua) 30%, transparent)",
        }}
      >
        <RefreshCw
          className={cn("h-3 w-3", isLoading && "animate-spin")}
          strokeWidth={2}
        />
        {isLoading ? "Syncing…" : "Sync now"}
      </button>
      {message && status !== "idle" ? (
        <span
          data-testid={
            status === "success"
              ? "sync-now-success"
              : status === "error"
                ? "sync-now-error"
                : "sync-now-status"
          }
          className="font-body text-[10px] font-medium normal-case tracking-normal"
          style={{
            color:
              status === "error"
                ? "var(--color-creative)"
                : "var(--text-muted)",
          }}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}

/** Match the formatter used by DashboardHeader so the surfaces agree. */
function formatDataAsOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
