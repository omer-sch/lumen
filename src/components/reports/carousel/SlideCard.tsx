"use client";

import { useCallback } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { EditableText } from "../EditableText";
import { ReportCoverHeader } from "../ReportCoverHeader";
import { SectionDivider } from "../sections/SectionDivider";
import { WeeklyBreakdown } from "../sections/WeeklyBreakdown";
import { CampaignBreakdown } from "../sections/CampaignBreakdown";
import { REPORT_BRAND } from "@/lib/reports/brand";
import type {
  Report,
  ReportSection,
  ChannelCampaignSection,
} from "@/lib/reports/types";
import type { Slide } from "./slides";

type SlideCardProps = {
  slide: Slide;
  report: Report;
  /** Read-only when displayed as a peek, in the off-screen capture, or in
   *  the share view. */
  readOnly?: boolean;
  /** When false, EditableText fields are disabled even on the active card.
   *  Used during PDF capture to avoid focus-ring + contenteditable
   *  artifacts. */
  capture?: boolean;
  onChange?: (next: Report) => void;
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

/**
 * Renders a single carousel slide. The card frame is provided by the
 * caller (so this component works at both on-screen and off-screen 16:9
 * dimensions); we only render the content.
 */
export function SlideCard({ slide, report, readOnly, capture, onChange }: SlideCardProps) {
  if (slide.kind === "cover") {
    return (
      <CoverCard
        report={report}
        readOnly={readOnly || capture}
        onChange={onChange}
      />
    );
  }
  return (
    <SectionCard
      slide={slide}
      report={report}
      readOnly={readOnly || capture}
      onChange={onChange}
    />
  );
}

function CoverCard({
  report,
  readOnly,
  onChange,
}: {
  report: Report;
  readOnly?: boolean;
  onChange?: (next: Report) => void;
}) {
  const onTitleChange =
    onChange && !readOnly
      ? (title: string) => onChange({ ...report, title })
      : undefined;
  return (
    <div
      className="flex h-full w-full flex-col justify-between p-12"
      style={{
        background: `linear-gradient(135deg, ${REPORT_BRAND.navyCard} 0%, ${REPORT_BRAND.navy} 100%)`,
        color: REPORT_BRAND.white,
      }}
    >
      <ReportCoverHeader
        report={report}
        viewMode="carousel"
        readOnly={readOnly}
        onTitleChange={onTitleChange}
      />

      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-white/55">
        <span>Lumen Reports</span>
        <span>{new Date(report.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

function SectionCard({
  slide,
  report,
  readOnly,
  onChange,
}: {
  slide: Extract<Slide, { kind: "section" }>;
  report: Report;
  readOnly?: boolean;
  onChange?: (next: Report) => void;
}) {
  const { section } = slide;

  const updateSection = useCallback(
    (patch: Partial<ReportSection>) => {
      if (!onChange) return;
      onChange({
        ...report,
        sections: report.sections.map((s) =>
          s.id === section.id ? ({ ...s, ...patch } as ReportSection) : s,
        ),
      });
    },
    [onChange, report, section.id],
  );

  // yellowHEAD section types come with their own dark divider + a light
  // content area. We render them edge-to-edge inside the slide so the
  // divider's navy reads as a colored header band.
  if (section.id === "platform_overall") {
    return (
      <div className="flex h-full w-full flex-col bg-[color:var(--surface-light-base)]">
        <div className="px-10 pt-8">
          <SectionDivider
            platform={section.platform}
            title={PLATFORM_TITLE[section.platform]}
            subtitle="Overall · Weekly Breakdown"
          />
        </div>
        <div className="flex-1 overflow-hidden px-10 pb-8 pt-6">
          <WeeklyBreakdown summary={section.summary} bullets={section.bullets} />
        </div>
      </div>
    );
  }

  if (section.id === "channel_weekly") {
    return (
      <div className="flex h-full w-full flex-col bg-[color:var(--surface-light-base)]">
        <div className="px-10 pt-8">
          <SectionDivider
            platform={section.platform}
            channel={section.channel}
            title={CHANNEL_TITLE[section.channel]}
            subtitle="Weekly Breakdown"
          />
        </div>
        <div className="flex-1 overflow-hidden px-10 pb-8 pt-6">
          <WeeklyBreakdown
            currentWeek={section.currentWeek}
            history={section.history}
            bullets={section.bullets}
          />
        </div>
      </div>
    );
  }

  if (section.id === "channel_campaign") {
    return (
      <div className="flex h-full w-full flex-col bg-[color:var(--surface-light-base)]">
        <div className="px-10 pt-8">
          <SectionDivider
            platform={section.platform}
            channel={section.channel}
            title={CHANNEL_TITLE[section.channel]}
            subtitle="Campaign Breakdown"
          />
        </div>
        <div className="flex-1 overflow-hidden px-10 pb-8 pt-6">
          <CampaignBreakdown
            rows={section.rows}
            commentary={(section as ChannelCampaignSection).commentary}
            readOnly={readOnly}
            onCommentaryChange={(next) =>
              updateSection({ commentary: next } as Partial<ReportSection>)
            }
          />
        </div>
      </div>
    );
  }

  // Legacy section types — keep the inline renderers so old saved reports
  // still display correctly.
  return (
    <div
      className="flex h-full w-full flex-col gap-5 p-12"
      style={{
        background: REPORT_BRAND.lightSurfaceCard,
        color: REPORT_BRAND.textPrimary,
      }}
    >
      {readOnly ? (
        <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight">
          {section.title}
        </h2>
      ) : (
        <EditableText
          value={section.title}
          onChange={(t) => updateSection({ title: t } as Partial<ReportSection>)}
          ariaLabel={`${section.id} title`}
          className="font-display text-3xl font-extrabold leading-tight tracking-tight"
        />
      )}

      {readOnly ? (
        <p className="font-body text-base leading-relaxed text-[color:var(--text-light-secondary)]">
          {section.body}
        </p>
      ) : (
        <EditableText
          value={section.body}
          onChange={(b) => updateSection({ body: b } as Partial<ReportSection>)}
          ariaLabel={`${section.id} body`}
          multiline
          className="font-body text-base leading-relaxed text-[color:var(--text-light-secondary)] min-h-[1.5rem]"
        />
      )}

      {section.id === "kpis" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {section.kpis.map((k) => {
            const tone =
              k.tone === "good"
                ? REPORT_BRAND.ua
                : k.tone === "bad"
                  ? REPORT_BRAND.creative
                  : REPORT_BRAND.textMuted;
            const Arrow = k.delta.startsWith("-") ? ArrowDownRight : ArrowUpRight;
            return (
              <div
                key={k.label}
                className="flex flex-col gap-1.5 rounded-lg p-4"
                style={{
                  background: REPORT_BRAND.lightSurface,
                  border: `1px solid ${REPORT_BRAND.lightLine}`,
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
                  {k.label}
                </span>
                <span className="font-display text-3xl font-extrabold tabular-nums leading-none">
                  {k.value}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums"
                  style={{ color: tone }}
                >
                  <Arrow className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {k.delta}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {section.id === "channel_breakdown" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
              <th className="border-b py-2 text-left" style={{ borderColor: REPORT_BRAND.lightLine }}>Channel</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>Spend</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>Share</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.channel} className="border-b" style={{ borderColor: REPORT_BRAND.lightLine }}>
                <td className="py-2.5 font-semibold">{r.channel}</td>
                <td className="py-2.5 text-right tabular-nums">{r.spend}</td>
                <td className="py-2.5 text-right tabular-nums">{r.share}</td>
                <td className="py-2.5 text-right tabular-nums">{r.roas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.id === "top_campaigns" && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-light-muted)]">
              <th className="border-b py-2 text-left" style={{ borderColor: REPORT_BRAND.lightLine }}>Campaign</th>
              <th className="border-b py-2 text-left" style={{ borderColor: REPORT_BRAND.lightLine }}>Channel</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>Spend</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>Installs</th>
              <th className="border-b py-2 text-right" style={{ borderColor: REPORT_BRAND.lightLine }}>ROAS</th>
            </tr>
          </thead>
          <tbody>
            {section.rows.map((r) => (
              <tr key={r.name} className="border-b" style={{ borderColor: REPORT_BRAND.lightLine }}>
                <td className="py-2.5 font-semibold">{r.name}</td>
                <td className="py-2.5">{r.channel}</td>
                <td className="py-2.5 text-right tabular-nums">{r.spend}</td>
                <td className="py-2.5 text-right tabular-nums">{r.installs}</td>
                <td className="py-2.5 text-right tabular-nums">{r.roas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {section.id === "recommendations" && (
        <ul className="flex flex-col gap-3">
          {section.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg p-4"
              style={{
                background: REPORT_BRAND.lightSurface,
                border: `1px solid ${REPORT_BRAND.lightLine}`,
              }}
            >
              <span
                aria-hidden
                className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: REPORT_BRAND.ua }}
              />
              {readOnly ? (
                <p className="flex-1 font-body text-sm leading-relaxed">{b}</p>
              ) : (
                <EditableText
                  value={b}
                  onChange={(next) =>
                    updateSection({
                      bullets: section.bullets.map((x, j) => (j === i ? next : x)),
                    } as Partial<ReportSection>)
                  }
                  multiline
                  ariaLabel={`Recommendation ${i + 1}`}
                  className="flex-1 font-body text-sm leading-relaxed min-h-[1.5rem]"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
