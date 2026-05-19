"use client";

import { HelpCircle } from "lucide-react";

import { KpiCard } from "@/components/dashboard/KpiCard";

type Props = {
  /** Current-period BCAC. `null` when either side of the ratio is zero —
   *  KpiCard renders the muted "—" placeholder. */
  bcac: number | null;
  /** Period-over-period percent delta. `null` when the prior window can't
   *  produce a meaningful baseline (zero spend or zero subs). */
  delta: number | null;
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const BCAC_TOOLTIP =
  "BCAC = total paid spend ÷ all subscribers in the window (paid + organic). " +
  "Lower is better. Compares against the same-length prior window.";

/**
 * Attribution tab hero — BCAC (Blended Customer Acquisition Cost) as a
 * full-width KpiCard, hero size, mint highlight. The page's "at what
 * cost" headline that anchors the trust narrative.
 *
 * The `?` info button is rendered as an absolute-positioned overlay on
 * a relative wrapper rather than threaded into KpiCard's hint slot.
 * Two reasons: (1) KpiCard renders the hint twice for responsive
 * desktop / mobile layouts, which would duplicate the button in the
 * DOM, and (2) the icon reads more naturally as a top-right helper
 * than as a button embedded mid-sentence in the subtitle.
 */
export function BcacHero({ bcac, delta }: Props) {
  return (
    <div className="relative" data-testid="attribution-bcac-hero">
      <KpiCard
        id="attribution-bcac"
        label="Blended CAC"
        value={bcac == null ? "—" : fmtMoney(bcac)}
        delta={delta}
        direction="lower-better"
        size="hero"
        enterIndex={1}
        highlight
        hint="Blended Customer Acquisition Cost — paid spend ÷ all subs (paid + organic) in the active window."
      />
      <button
        type="button"
        aria-label="How BCAC is computed"
        title={BCAC_TOOLTIP}
        data-testid="attribution-bcac-info"
        className="absolute right-5 top-5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy sm:right-6 sm:top-6"
        style={{
          background: "color-mix(in oklab, var(--surface-input) 70%, transparent)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
