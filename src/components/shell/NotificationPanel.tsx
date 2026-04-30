"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecoratedNotification } from "@/lib/notifications/store";
import { NotificationItem } from "./NotificationItem";

type Filter = "all" | "unread";

type NotificationPanelProps = {
  open: boolean;
  onClose: () => void;
  items: DecoratedNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
};

export function NotificationPanel({
  open,
  onClose,
  items,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NotificationPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape + click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        // Ignore clicks on the trigger itself — the bell handles its own toggle
        const trigger = (target as HTMLElement)?.closest?.(
          "[data-notification-trigger]",
        );
        if (trigger) return;
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose]);

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((i) => !i.read) : items),
    [items, filter],
  );

  return (
    <>
      {/* Backdrop — visible on mobile to dim the page behind the sheet */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/65 backdrop-blur-md transition-opacity duration-280 ease-out-quart md:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Notifications"
        aria-modal={open ? "true" : undefined}
        className={cn(
          // Mobile: full-width sheet from the top, under the TopBar
          "fixed inset-x-3 top-[68px] z-50 max-h-[min(78dvh,640px)] origin-top-right overflow-hidden rounded-xl backdrop-blur-glass transition-[opacity,transform] duration-280 ease-out-quart",
          // Desktop: pin to top-right
          "md:left-auto md:right-6 md:w-[420px]",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
        style={{
          // Dense surface so the popover occludes the dashboard cleanly —
          // a translucent glass card on top of glass cards reads as soup.
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%), color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
          border: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-elevated), var(--shadow-mint)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h2 className="font-display text-md font-bold leading-none text-cloud-white">
              Notifications
            </h2>
          </div>
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-[color:var(--text-secondary)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white disabled:cursor-not-allowed disabled:opacity-40 focus-mint focus-visible:outline-none"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
            Mark all read
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notifications"
            className="grid h-7 w-7 place-items-center rounded-md text-[color:var(--text-muted)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.96] focus-mint focus-visible:outline-none"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2">
          {(
            [
              { key: "all" as const, label: "All" },
              { key: "unread" as const, label: "Unread" },
            ] satisfies { key: Filter; label: string }[]
          ).map(({ key, label }) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-[background-color,color,box-shadow,transform] duration-280 ease-out-quart hover:-translate-y-px focus-mint focus-visible:outline-none",
                  active
                    ? "text-ua"
                    : "text-[color:var(--text-muted)] hover:text-cloud-white",
                )}
                style={
                  active
                    ? {
                        background: "var(--color-ua-dim)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 35%, transparent)",
                      }
                    : { background: "transparent" }
                }
              >
                {label}
                {key === "unread" && unreadCount > 0 && (
                  <span className="ml-1 tabular-nums">· {unreadCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        <div
          className="overflow-y-auto px-2 pb-2"
          style={{ maxHeight: "min(64dvh, 520px)" }}
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span
                aria-hidden
                className="grid h-12 w-12 place-items-center rounded-full"
                style={{
                  background: "var(--tint-ua-soft)",
                  boxShadow: "var(--shadow-mint)",
                  color: "var(--color-ua)",
                }}
              >
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </span>
              <p className="font-display text-sm font-bold text-cloud-white">
                You&rsquo;re all caught up
              </p>
              <p className="font-body text-xs text-[color:var(--text-muted)]">
                {filter === "unread"
                  ? "No unread items. Switch to All to revisit anything."
                  : "Lumen will surface new signals here as they happen."}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  item={n}
                  onActivate={onMarkRead}
                  onDismiss={onClose}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
