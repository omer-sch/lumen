"use client";

import { useCallback, useState } from "react";
import { ExternalLink, ShieldCheck, ShieldOff } from "lucide-react";

type Props = {
  gmailReady: boolean;
  connectedEmail: string | null;
  watchStatus: "active" | "failed" | null;
  watchExpiresAt: string | null;
  watchFailureReason: string | null;
};

// Renders the Gmail connection status + connect / disconnect button.
// Server-loaded data is passed in as props so the page is SSR-ready;
// the disconnect action is the only interactive bit and lives in a
// client island.
export function GmailStatusBlock({
  gmailReady,
  connectedEmail,
  watchStatus,
  watchExpiresAt,
  watchFailureReason,
}: Props) {
  const [working, setWorking] = useState(false);
  const handleDisconnect = useCallback(async () => {
    if (!confirm("Disconnect Gmail? Hermes will stop watching your inbox.")) {
      return;
    }
    setWorking(true);
    try {
      await fetch("/api/auth/gmail/disconnect", { method: "POST" });
      window.location.reload();
    } finally {
      setWorking(false);
    }
  }, []);

  if (!gmailReady) {
    return (
      <div
        className="flex flex-col gap-2 rounded-lg p-4"
        style={{
          background: "var(--surface-glass)",
          border: "1px dashed var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2 font-body text-sm font-semibold text-cloud-white">
          <ShieldOff
            className="h-4 w-4 text-[color:var(--text-muted)]"
            strokeWidth={2.25}
            aria-hidden
          />
          Gmail integration not configured
        </div>
        <p className="font-body text-xs text-[color:var(--text-secondary)]">
          Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
          GOOGLE_PUBSUB_TOPIC, and GMAIL_TOKEN_ENCRYPTION_KEY in your env,
          then redeploy. See the v0.5 workstream C session note for the
          GCP setup checklist.
        </p>
      </div>
    );
  }

  if (!connectedEmail) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg p-4"
        style={{
          background: "var(--surface-glass)",
          border: "1px solid var(--border-glass)",
        }}
      >
        <div className="flex items-center gap-2 font-body text-sm font-semibold text-cloud-white">
          <ShieldOff
            className="h-4 w-4 text-[color:var(--text-muted)]"
            strokeWidth={2.25}
            aria-hidden
          />
          Gmail not connected
        </div>
        <p className="font-body text-xs text-[color:var(--text-secondary)]">
          When you connect, Hermes will watch new INBOX messages for senders
          on your filter list (below) and draft a report in {"/reports"} when
          a recognised email arrives. Read-only access; no sending.
        </p>
        <a
          href="/api/auth/gmail/start"
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-[color:var(--color-ua)] px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-navy shadow-mint transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          Connect Gmail
          <ExternalLink className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        </a>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
      }}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck
          className="h-4 w-4 text-[color:var(--color-ua)]"
          strokeWidth={2.25}
          aria-hidden
        />
        <span className="font-body text-sm font-semibold text-cloud-white">
          Connected as
        </span>
        <span className="font-mono text-xs text-[color:var(--text-secondary)]">
          {connectedEmail}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KeyValue label="Watch status" value={watchStatus ?? "not registered"} />
        <KeyValue
          label="Next refresh by"
          value={
            watchExpiresAt
              ? new Date(watchExpiresAt).toLocaleString()
              : "n/a"
          }
        />
      </div>
      {watchStatus === "failed" && watchFailureReason && (
        <p
          role="alert"
          className="rounded-md px-3 py-2 font-body text-xs"
          style={{
            background:
              "color-mix(in oklab, var(--color-creative) 14%, transparent)",
            color: "var(--color-creative)",
            border:
              "1px solid color-mix(in oklab, var(--color-creative) 35%, transparent)",
          }}
        >
          Watch failed: {watchFailureReason}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDisconnect}
          disabled={working}
          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--border-default)] px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:text-cloud-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          {working ? "Disconnecting..." : "Disconnect Gmail"}
        </button>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className="font-body text-sm text-cloud-white">{value}</span>
    </div>
  );
}
