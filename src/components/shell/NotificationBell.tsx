"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import { NotificationPanel } from "./NotificationPanel";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { items, unreadCount, hydrated, markRead, markAllRead } =
    useNotifications();

  return (
    <>
      <button
        type="button"
        data-notification-trigger
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-9 w-9 place-items-center rounded-md border border-subtle text-[color:var(--text-secondary)] transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <Bell className="h-4 w-4" strokeWidth={1.75} />
        {hydrated && unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 font-display text-[10px] font-extrabold leading-none text-navy"
            style={{
              height: 18,
              background:
                "linear-gradient(135deg, var(--color-ua) 0%, var(--color-ua-glow) 100%)",
              boxShadow:
                "0 0 10px color-mix(in oklab, var(--color-ua) 60%, transparent), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <NotificationPanel
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        unreadCount={unreadCount}
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
      />
    </>
  );
}
