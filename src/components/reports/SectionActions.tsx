"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Pencil, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  ReportSection,
} from "@/lib/reports/types";

import { proseBlockToPlainText } from "./sections/ProseBlock";

type SmartSection =
  | PlatformOverallSection
  | ChannelWeeklySection
  | ChannelCampaignSection;

type Props = {
  reportId: string;
  section: SmartSection;
  /** Unique identity for this section within the report. The
   *  regenerate-section route uses this to find the right section. */
  sectionId: string;
  editing: boolean;
  onEditingChange: (next: boolean) => void;
  /** Fired when the server returns a regenerated section. The caller
   *  swaps the section in place and persists the report. */
  onRegenerated: (next: SmartSection) => void;
  /** When true, Regenerate is disabled (e.g. the report has no
   *  regenerationContext). Falls back to a tooltip hint. */
  regenerateDisabled?: boolean;
};

// Icon-button row that lives in every Smart Reports section header:
// Copy, Edit toggle, Regenerate. Works for both manual and
// Hermes-drafted reports (the underlying regenerate route handles
// both via the report's regenerationContext snapshot).
export function SectionActions({
  reportId,
  section,
  sectionId,
  editing,
  onEditingChange,
  onRegenerated,
  regenerateDisabled,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = useCallback(async () => {
    const prose = (section as { prose?: ReportSection["id"] extends never
      ? never
      : SmartSection["prose"] })
      .prose ?? [];
    const text = prose.map(proseBlockToPlainText).join("\n\n");
    if (!text.length) {
      setError("Nothing to copy yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard unavailable.");
    }
  }, [section]);

  const handleRegenerate = useCallback(async () => {
    if (regenerating || regenerateDisabled) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/reports/${encodeURIComponent(reportId)}/regenerate-section`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sectionId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { section: SmartSection };
      onRegenerated(body.section);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, regenerateDisabled, reportId, sectionId, onRegenerated]);

  return (
    <div className="flex flex-col items-end gap-1" aria-live="polite">
      <div className="flex items-center gap-1">
        <IconButton
          label={copied ? "Copied" : "Copy section as text"}
          onClick={handleCopy}
          tone="ghost"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-ua" strokeWidth={2.5} />
          ) : (
            <Copy className="h-3.5 w-3.5" strokeWidth={2} />
          )}
        </IconButton>
        <IconButton
          label={editing ? "Done editing" : "Edit section"}
          onClick={() => onEditingChange(!editing)}
          tone={editing ? "ua" : "ghost"}
          pressed={editing}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </IconButton>
        <IconButton
          label={
            regenerateDisabled
              ? "Regenerate (older report, needs full regenerate)"
              : "Regenerate this section"
          }
          onClick={handleRegenerate}
          disabled={regenerateDisabled || regenerating}
          tone="ua"
          busy={regenerating}
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", regenerating && "animate-spin")}
            strokeWidth={2.25}
          />
        </IconButton>
      </div>
      {error && (
        <p
          role="alert"
          className="font-body text-[11px] text-[color:var(--color-creative)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  disabled,
  busy,
  tone,
  pressed,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  busy?: boolean;
  tone: "ghost" | "ua";
  pressed?: boolean;
}) {
  const isUa = tone === "ua";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      aria-pressed={pressed}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md transition-[transform,box-shadow,background-color,color] duration-200 ease-out-quart",
        "hover:-translate-y-px active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-light-card)]",
      )}
      style={
        isUa
          ? {
              background: "var(--color-ua)",
              color: "var(--color-navy)",
              boxShadow: "var(--shadow-mint)",
            }
          : {
              background: "var(--surface-light-base)",
              color: "var(--text-light-secondary)",
              border: "1px solid var(--surface-light-line)",
            }
      }
    >
      {children}
    </button>
  );
}

/** Build the stable section id used by the regenerate route. Mirror
 *  of the server-side sectionKey() helper. */
export function sectionKey(s: ReportSection): string {
  if (s.id === "platform_overall") return `${s.platform}--platform_overall`;
  if (s.id === "channel_weekly") {
    return `${s.platform}-${s.channel}--channel_weekly`;
  }
  if (s.id === "channel_campaign") {
    return `${s.platform}-${s.channel}--channel_campaign`;
  }
  return `legacy--${s.id}`;
}
