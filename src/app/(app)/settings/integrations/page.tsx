import { auth } from "@clerk/nextjs/server";
import { Mail } from "lucide-react";

import { isGmailConfigured, isSupabaseConfigured } from "@/lib/env.server";
import { listFiltersForUser } from "@/lib/email-filters";
import { loadGmailTokens } from "@/lib/gmail/tokens";
import { loadWatch } from "@/lib/gmail/watch";
import { GmailFiltersPanel } from "@/components/settings/GmailFiltersPanel";
import { GmailStatusBlock } from "@/components/settings/GmailStatusBlock";

export const metadata = { title: "Integrations · Lumen" };

const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

const PREVIEW_USER_ID = "preview-user";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { ok, err } = await searchParams;
  const { userId: clerkUserId } = await auth();
  const userId = clerkUserId ?? (PREVIEW ? PREVIEW_USER_ID : null);
  const gmailReady = isGmailConfigured();
  const supabaseOK = isSupabaseConfigured();

  const [tokens, watch, filters] = await Promise.all([
    gmailReady && supabaseOK && userId
      ? loadGmailTokens(userId).catch(() => null)
      : Promise.resolve(null),
    gmailReady && supabaseOK && userId
      ? loadWatch(userId).catch(() => null)
      : Promise.resolve(null),
    supabaseOK && userId
      ? listFiltersForUser(userId).catch(() => [])
      : Promise.resolve([]),
  ]);

  const connectedEmail = tokens?.email ?? null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
          Settings · Integrations
        </p>
        <h1 className="font-display text-3xl font-extrabold leading-none tracking-tight text-cloud-white">
          Inbox + automation
        </h1>
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          Connect Gmail so Hermes can draft reports the moment a recognised
          client emails you. Read-only on the inbox; Hermes never sends
          on your behalf.
        </p>
      </header>

      {(ok || err) && (
        <div
          role={err ? "alert" : "status"}
          className="rounded-md px-3 py-2 font-body text-sm"
          style={{
            background: err
              ? "color-mix(in oklab, var(--color-creative) 14%, transparent)"
              : "color-mix(in oklab, var(--color-ua) 14%, transparent)",
            color: err ? "var(--color-creative)" : "var(--color-ua)",
            border: `1px solid ${err ? "color-mix(in oklab, var(--color-creative) 35%, transparent)" : "color-mix(in oklab, var(--color-ua) 35%, transparent)"}`,
          }}
        >
          {err ? `Could not connect Gmail: ${err}` : `Gmail status: ${ok}`}
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
            style={{
              background: "var(--tint-ua-soft)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
            }}
          >
            <Mail className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Gmail
          </span>
          <h2 className="font-display text-xl font-bold tracking-tight text-cloud-white">
            Inbox listener
          </h2>
        </div>
        <GmailStatusBlock
          gmailReady={gmailReady}
          connectedEmail={connectedEmail}
          watchStatus={watch?.status ?? null}
          watchExpiresAt={watch?.expiresAt.toISOString() ?? null}
          watchFailureReason={watch?.failureReason ?? null}
        />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
            style={{
              background: "var(--tint-ua-soft)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
            }}
          >
            Filters
          </span>
          <h2 className="font-display text-xl font-bold tracking-tight text-cloud-white">
            Watch these senders
          </h2>
        </div>
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          Hermes only fires on inbound mail that matches one of these
          filters. Defaults are seeded from your client contacts when you
          connect Gmail; you can add, toggle, or remove rules below.
        </p>
        <GmailFiltersPanel
          initialFilters={filters.map((f) => ({
            id: f.id,
            type: f.filterType,
            value: f.filterValue,
            active: f.active,
          }))}
        />
      </section>
    </main>
  );
}
