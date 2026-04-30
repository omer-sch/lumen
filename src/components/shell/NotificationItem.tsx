"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Sparkles,
  Target,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NotificationType } from "@/lib/mock/notifications";
import type { DecoratedNotification } from "@/lib/notifications/store";

type IconStyle = {
  Icon: LucideIcon;
  accentVar: string;
  tintVar: string;
};

const STYLE_BY_TYPE: Record<NotificationType, IconStyle> = {
  anomaly:        { Icon: TrendingDown,  accentVar: "--color-creative", tintVar: "--tint-creative-soft" },
  opportunity:    { Icon: Sparkles,      accentVar: "--color-yellow",   tintVar: "--tint-yellow-soft"   },
  target_hit:     { Icon: Target,        accentVar: "--color-ua",       tintVar: "--tint-ua-soft"       },
  recommendation: { Icon: CheckCircle2,  accentVar: "--color-ua",       tintVar: "--tint-ua-soft"       },
  risk:           { Icon: AlertTriangle, accentVar: "--color-creative", tintVar: "--tint-creative-soft" },
  system:         { Icon: Database,      accentVar: "--color-ua",       tintVar: "--tint-ua-soft"       },
};

const TYPE_LABEL: Record<NotificationType, string> = {
  anomaly:        "Anomaly",
  opportunity:    "Opportunity",
  target_hit:     "Target hit",
  recommendation: "Recommendation",
  risk:           "Risk",
  system:         "System",
};

type NotificationItemProps = {
  item: DecoratedNotification;
  onActivate: (id: string) => void;
  onDismiss?: () => void;
};

export function NotificationItem({
  item,
  onActivate,
  onDismiss,
}: NotificationItemProps) {
  const { Icon, accentVar, tintVar } = STYLE_BY_TYPE[item.type];
  const accent = `var(${accentVar})`;
  const tint = `var(${tintVar})`;
  const unread = !item.read;

  // The whole row is keyboard-activatable and marks the item read.
  // If the action has an href, the trailing chip is the link target.
  const handleActivate = () => onActivate(item.id);

  return (
    <li
      className={cn(
        "group relative flex flex-col gap-2 rounded-md p-3 transition-[background-color,transform] duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]",
        unread && "bg-[color:var(--surface-hover)]/40",
      )}
    >
      {/* Unread accent — mint left rail */}
      {unread && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full"
          style={{
            background: "var(--color-ua)",
            boxShadow:
              "0 0 8px color-mix(in oklab, var(--color-ua) 60%, transparent)",
          }}
        />
      )}

      <button
        type="button"
        onClick={handleActivate}
        className="flex items-start gap-3 text-left focus:outline-none"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
          style={{
            background: tint,
            color: accent,
            boxShadow: `0 0 12px color-mix(in oklab, ${accent} 30%, transparent)`,
          }}
        >
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: accent }}
            >
              {TYPE_LABEL[item.type]}
            </span>
            {item.team && (
              <span className="rounded-full bg-[color:var(--surface-hover)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                {item.team}
              </span>
            )}
            {item.metricChip && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                style={{
                  background: tint,
                  color: accent,
                }}
              >
                {item.metricChip}
              </span>
            )}
            <span className="ml-auto text-[10px] text-[color:var(--text-muted)]">
              {item.timeAgo}
            </span>
          </div>
          <p
            className={cn(
              "mt-1 font-display leading-snug",
              unread
                ? "text-sm font-bold text-cloud-white"
                : "text-sm font-semibold text-[color:var(--text-secondary)]",
            )}
          >
            {item.title}
          </p>
          <p className="mt-1 line-clamp-2 font-body text-xs leading-relaxed text-[color:var(--text-muted)]">
            {item.body}
          </p>
        </div>
      </button>

      {item.actionLabel && (
        <div className="flex items-center justify-end pt-1">
          {item.actionHref ? (
            <Link
              href={item.actionHref}
              onClick={() => {
                onActivate(item.id);
                onDismiss?.();
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] focus-mint focus-visible:outline-none"
              style={{ color: accent }}
            >
              {item.actionLabel}
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleActivate}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] focus-mint focus-visible:outline-none"
              style={{ color: accent }}
            >
              {item.actionLabel}
              <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export { STYLE_BY_TYPE, TYPE_LABEL };
