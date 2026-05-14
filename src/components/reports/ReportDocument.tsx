"use client";

import { useCallback, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { EditableText } from "./EditableText";
import { AgentByline } from "@/components/agents/AgentByline";
import { SectionDivider } from "./sections/SectionDivider";
import { WeeklyBreakdown } from "./sections/WeeklyBreakdown";
import { CampaignBreakdown } from "./sections/CampaignBreakdown";
import { formatWeekRange, isoWeek } from "@/lib/reports/week";
import type { Report, ReportSection } from "@/lib/reports/types";

type ReportDocumentProps = {
  report: Report;
  /** Controlled mutation — the parent persists the result. */
  onChange: (next: Report) => void;
  /** Read-only mode for the share view + PDF export. */
  readOnly?: boolean;
};

/** Yellowhead deck convention: the first divider for each platform/channel
 *  pair carries a "Weekly Breakdown" subtitle the first time it appears,
 *  and "Campaign Breakdown" the second time. We do the same split here so
 *  the new sections each get their own divider. */
const SUBTITLE_FOR: Record<
  "platform_overall" | "channel_weekly" | "channel_campaign",
  string
> = {
  platform_overall: "Overall",
  channel_weekly: "Weekly Breakdown",
  channel_campaign: "Campaign Breakdown",
};

const PLATFORM_TITLE = {
  android: "Android",
  ios: "iOS",
  web: "Web",
} as const;

const CHANNEL_TITLE = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  asa: "ASA",
  search: "Search",
} as const;

export function ReportDocument({ report, onChange, readOnly }: ReportDocumentProps) {
  const updateSection = useCallback(
    (id: ReportSection["id"], patch: Partial<ReportSection>) => {
      onChange({
        ...report,
        sections: report.sections.map((s) =>
          s.id === id ? ({ ...s, ...patch } as ReportSection) : s,
        ),
      });
    },
    [onChange, report],
  );

  const setTitle = (title: string) => onChange({ ...report, title });

  /** Best-effort week + date range for the cover. We parse the persisted
   *  period back out so a saved report still renders sensibly even if the
   *  raw Date values aren't on the report anymore. */
  const cover = useMemo(() => {
    const created = new Date(report.createdAt);
    const week = isoWeek(created);
    // Derive a week-style title prefix unless the user has already edited
    // the title to something custom.
    const subtitleRange = report.period.includes(" – ")
      ? report.period
      : formatWeekRange(new Date(report.createdAt - 6 * 86400000), created);
    return { week, subtitleRange };
  }, [report.createdAt, report.period]);

  return (
    <article
      data-report-doc
      className="lumen-report mx-auto flex max-w-3xl flex-col gap-8 rounded-xl px-8 py-10 sm:px-12 sm:py-14"
      style={{
        background: "var(--surface-light-card)",
        color: "var(--text-light-primary)",
        border: "1px solid var(--surface-light-line)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Cover */}
      <header className="flex flex-col gap-3 border-b pb-6" style={{ borderColor: "var(--surface-light-line)" }}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-md font-display text-lg font-extrabold text-navy"
            style={{
              background:
                "linear-gradient(135deg, var(--color-yellow) 0%, var(--color-yellow-light) 100%)",
              boxShadow:
                "0 0 18px color-mix(in oklab, var(--color-yellow) 40%, transparent)",
            }}
          >
            L
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-display text-sm font-bold tracking-tight text-[color:var(--text-light-primary)]">
              Lumen
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
              yellowHEAD AI
            </span>
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
            {report.clientLabel} · Week {cover.week}
          </span>
        </div>
        {readOnly ? (
          <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-[color:var(--text-light-primary)] sm:text-4xl">
            {report.title}
          </h1>
        ) : (
          <EditableText
            value={report.title}
            onChange={setTitle}
            ariaLabel="Report title"
            className="font-display text-3xl font-extrabold leading-tight tracking-tight text-[color:var(--text-light-primary)] sm:text-4xl"
          />
        )}
        <p className="font-body text-sm text-[color:var(--text-light-secondary)]">
          {cover.subtitleRange}
        </p>
        <AgentByline
          agentId={report.authoredBy ?? "nova"}
          prefix="Drafted by"
          size="md"
          tone="light"
          className="pt-1"
        />
        {/* Phase-1 disclosure: the Reports generator runs against mock
            campaign data, not BigQuery. Banner sits inside the document
            so a print-to-PDF export still carries it — see M5 in
            security-scan-2026-05-12-v2.md. Remove once
            src/lib/reports/generate.ts is wired to BQ. */}
        <p
          role="note"
          className="mt-2 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider"
          style={{
            background: "color-mix(in oklab, var(--color-yellow) 18%, transparent)",
            color: "var(--text-light-primary)",
            border:
              "1px solid color-mix(in oklab, var(--color-yellow) 45%, transparent)",
          }}
        >
          Sample report — figures shown are illustrative, not live BigQuery data.
        </p>
      </header>

      {report.sections.map((section, idx) => (
        <SectionRenderer
          key={`${section.id}-${idx}`}
          section={section}
          readOnly={readOnly}
          updateSection={updateSection}
        />
      ))}

      <footer className="border-t pt-4 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]" style={{ borderColor: "var(--surface-light-line)" }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>Generated by Lumen · {new Date(report.createdAt).toLocaleDateString()}</span>
          <span className="normal-case tracking-normal text-[11px] text-[color:var(--text-light-secondary)]">
            Contact: <span className="font-semibold">{report.clientLabel}</span> client team · Lumen, the yellowHEAD AI dashboard
          </span>
        </div>
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Dispatch on section.id. New yellowHEAD sections mount the divider + the
// matching template. Legacy ids keep their original renderers so a saved
// report from before this change still hydrates cleanly.
// ---------------------------------------------------------------------------

function SectionRenderer({
  section,
  readOnly,
  updateSection,
}: {
  section: ReportSection;
  readOnly?: boolean;
  updateSection: (
    id: ReportSection["id"],
    patch: Partial<ReportSection>,
  ) => void;
}) {
  // yellowHEAD format
  if (section.id === "platform_overall") {
    return (
      <div className="flex flex-col gap-5">
        <SectionDivider
          platform={section.platform}
          title={PLATFORM_TITLE[section.platform]}
          subtitle={SUBTITLE_FOR.platform_overall}
        />
        <WeeklyBreakdown summary={section.summary} bullets={section.bullets} />
      </div>
    );
  }

  if (section.id === "channel_weekly") {
    return (
      <div className="flex flex-col gap-5">
        <SectionDivider
          platform={section.platform}
          channel={section.channel}
          title={CHANNEL_TITLE[section.channel]}
          subtitle={SUBTITLE_FOR.channel_weekly}
        />
        <WeeklyBreakdown
          currentWeek={section.currentWeek}
          history={section.history}
          bullets={section.bullets}
        />
      </div>
    );
  }

  if (section.id === "channel_campaign") {
    return (
      <div className="flex flex-col gap-5">
        <SectionDivider
          platform={section.platform}
          channel={section.channel}
          title={CHANNEL_TITLE[section.channel]}
          subtitle={SUBTITLE_FOR.channel_campaign}
        />
        <CampaignBreakdown
          rows={section.rows}
          commentary={section.commentary}
          readOnly={readOnly}
          onCommentaryChange={(next) =>
            updateSection("channel_campaign", { commentary: next })
          }
        />
      </div>
    );
  }

  // Legacy fallback paths
  return <LegacySection section={section} readOnly={readOnly} updateSection={updateSection} />;
}

function LegacySection({
  section,
  readOnly,
  updateSection,
}: {
  section: ReportSection;
  readOnly?: boolean;
  updateSection: (
    id: ReportSection["id"],
    patch: Partial<ReportSection>,
  ) => void;
}) {
  // The new section ids are handled above; this branch only sees legacy
  // ones, but the TS compiler doesn't narrow that, so we guard.
  if (
    section.id === "platform_overall" ||
    section.id === "channel_weekly" ||
    section.id === "channel_campaign"
  ) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      {readOnly ? (
        <h2 className="font-display text-xl font-bold leading-snug tracking-tight text-[color:var(--text-light-primary)]">
          {section.title}
        </h2>
      ) : (
        <EditableText
          value={section.title}
          onChange={(t) => updateSection(section.id, { title: t })}
          ariaLabel={`${section.id} title`}
          className="font-display text-xl font-bold leading-snug tracking-tight text-[color:var(--text-light-primary)]"
        />
      )}

      {readOnly ? (
        <p className="font-body text-sm leading-relaxed text-[color:var(--text-light-secondary)]">
          {section.body}
        </p>
      ) : (
        <EditableText
          value={section.body}
          onChange={(b) => updateSection(section.id, { body: b })}
          ariaLabel={`${section.id} body`}
          multiline
          className="font-body text-sm leading-relaxed text-[color:var(--text-light-secondary)] min-h-[1.5rem]"
        />
      )}

      {section.id === "kpis" && (
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {section.kpis.map((k) => {
            const tone =
              k.tone === "good"
                ? "var(--color-ua)"
                : k.tone === "bad"
                  ? "var(--color-creative)"
                  : "var(--text-light-muted)";
            const Arrow = k.delta.startsWith("-") ? ArrowDownRight : ArrowUpRight;
            return (
              <div
                key={k.label}
                className="flex flex-col gap-1 rounded-md p-3"
                style={{
                  background: "var(--surface-light-base)",
                  border: "1px solid var(--surface-light-line)",
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
                  {k.label}
                </span>
                <span className="font-display text-2xl font-extrabold tabular-nums leading-none text-[color:var(--text-light-primary)]">
                  {k.value}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
                  style={{ color: tone }}
                >
                  <Arrow className="h-3 w-3" strokeWidth={2.5} />
                  {k.delta}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {section.id === "channel_breakdown" && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
              <th className="border-b py-2 text-left" style={{ borderColor: "var(--surface-light-line)" }}>Channel</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>Spend</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>Share</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.channel} className="border-b" style={{ borderColor: "var(--surface-light-line)" }}>
                <td className="py-2 font-semibold text-[color:var(--text-light-primary)]">{r.channel}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.spend}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.share}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.roas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.id === "top_campaigns" && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
              <th className="border-b py-2 text-left" style={{ borderColor: "var(--surface-light-line)" }}>Campaign</th>
              <th className="border-b py-2 text-left" style={{ borderColor: "var(--surface-light-line)" }}>Channel</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>Spend</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>Installs</th>
              <th className="border-b py-2 text-right" style={{ borderColor: "var(--surface-light-line)" }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.name} className="border-b" style={{ borderColor: "var(--surface-light-line)" }}>
                <td className="py-2 font-semibold text-[color:var(--text-light-primary)]">{r.name}</td>
                <td className="py-2 text-[color:var(--text-light-secondary)]">{r.channel}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.spend}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.installs}</td>
                <td className="py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">{r.roas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.id === "recommendations" && (
        <ul className="mt-2 flex flex-col gap-2">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-md p-3"
              style={{
                background: "var(--surface-light-base)",
                border: "1px solid var(--surface-light-line)",
              }}
            >
              <span
                aria-hidden
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--color-ua)" }}
              />
              {readOnly ? (
                <p className="font-body text-sm leading-relaxed text-[color:var(--text-light-primary)]">
                  {b}
                </p>
              ) : (
                <EditableText
                  value={b}
                  onChange={(next) =>
                    updateSection("recommendations", {
                      bullets: section.bullets.map((x, j) => (j === i ? next : x)),
                    })
                  }
                  multiline
                  ariaLabel={`Recommendation ${i + 1}`}
                  className="flex-1 font-body text-sm leading-relaxed text-[color:var(--text-light-primary)] min-h-[1.5rem]"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
