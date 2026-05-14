import { cn } from "@/lib/utils";

type SampleDataBannerProps = {
  /** "light" sits inside the document cover (light card surface);
   *  "dark" sits inside the carousel cover (navy gradient surface). */
  tone?: "light" | "dark";
  className?: string;
};

/**
 * Phase-1 disclosure: the Reports generator runs against mock data, not
 * BigQuery. The banner ships on every report cover so a shared link or
 * exported PDF carries the disclosure even when a recipient lands cold.
 *
 * Removed once src/lib/reports/generate.ts is wired to BQ.
 */
export function SampleDataBanner({ tone = "light", className }: SampleDataBannerProps) {
  const styles =
    tone === "dark"
      ? {
          background: "rgba(255,221,12,0.16)",
          color: "var(--color-yellow)",
          border: "1px solid rgba(255,221,12,0.45)",
        }
      : {
          background: "color-mix(in oklab, var(--color-yellow) 18%, transparent)",
          color: "var(--text-light-primary)",
          border:
            "1px solid color-mix(in oklab, var(--color-yellow) 45%, transparent)",
        };

  return (
    <p
      role="note"
      className={cn(
        "rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider",
        className,
      )}
      style={styles}
    >
      Sample report: figures shown are illustrative, not live BigQuery data.
    </p>
  );
}
