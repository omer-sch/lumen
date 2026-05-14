"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Check,
  Copy,
  FileText,
  FileImage,
  Layers,
  ListChecks,
  Plus,
  Presentation,
  ScrollText,
  Send,
  Sparkles,
  Table,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { generateReport } from "@/lib/reports/generate";
import { useReports } from "@/lib/reports/store";
import type { Report } from "@/lib/reports/types";
import { ReportDocument } from "./ReportDocument";
import { ReportCarousel } from "./carousel/ReportCarousel";
import { ReportDeckOffscreen } from "./ReportDeckOffscreen";
import { exportReportAsPdf } from "@/lib/reports/export-pdf";
import { exportReportAsPptx } from "@/lib/reports/export-pptx";

const PROMPT_PRESETS = [
  "Weekly UA performance summary for the team review",
  "Top 5 campaigns this period and what to do next",
  "Channel-level read with creative recommendations",
];

type ViewMode = "carousel" | "document";
const VIEW_STORAGE_KEY = "lumen.reports.viewMode";

export function ReportsView() {
  return (
    <Suspense fallback={null}>
      <ReportsInner />
    </Suspense>
  );
}

function ReportsInner() {
  const { from, to, client } = useGlobalFilters();
  const { items, save, remove, get, hydrated } = useReports();
  const searchParams = useSearchParams();
  const sharedId = searchParams.get("id");

  const [draft, setDraft] = useState<Report | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("document");
  const [activeSlide, setActiveSlide] = useState(0);
  const [exporting, setExporting] = useState<null | "pdf" | "pptx">(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deckMounted, setDeckMounted] = useState(false);

  // Restore view mode for the session only. Document is the default
  // for a fresh load — Carousel clips the campaign commentary and the
  // CPA-D7 column in its 16:9 frame, so it's an opt-in via the toggle.
  // A user who picks Carousel and reloads still gets Carousel.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "carousel" || stored === "document") setViewMode(stored);
  }, []);
  const setViewModePersisted = useCallback((m: ViewMode) => {
    setViewMode(m);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(VIEW_STORAGE_KEY, m);
    }
  }, []);

  // If the URL carries ?id=…, open that report once the store hydrates.
  useEffect(() => {
    if (!hydrated || !sharedId || draft) return;
    const found = get(sharedId);
    if (found) setDraft(found);
  }, [hydrated, sharedId, draft, get]);

  const activeReport = draft;

  // Reset the active slide whenever the active report changes so we
  // always land on the cover for a new report.
  useEffect(() => {
    setActiveSlide(0);
  }, [activeReport?.id]);

  const handleGenerate = async (input: string) => {
    const q = (input ?? prompt).trim();
    if (!q || generating) return;
    setGenerating(true);
    setPrompt("");
    await new Promise((r) => setTimeout(r, 900));
    const r = generateReport({ prompt: q, from, to, client });
    setDraft(r);
    save(r);
    setGenerating(false);
  };

  const handleSelect = (r: Report) => setDraft(r);

  const handleDocChange = (next: Report) => {
    setDraft(next);
    save(next);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (draft?.id === id) setDraft(null);
  };

  const handleCopyShare = async () => {
    if (!activeReport) return;
    const url = `${window.location.origin}/reports?id=${activeReport.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const deckRef = useRef<HTMLDivElement>(null);
  const handleExportPdf = async () => {
    if (!activeReport) return;
    setExportError(null);
    setExporting("pdf");
    setDeckMounted(true);
    // Wait for the off-screen tree to mount + layout. Two RAFs is the
    // safest cross-browser way to land after a paint.
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      if (!deckRef.current) throw new Error("Deck render target missing");
      await exportReportAsPdf(activeReport, deckRef.current);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF export failed";
      setExportError(msg);
    } finally {
      setExporting(null);
      setDeckMounted(false);
    }
  };

  const handleExportPptx = async () => {
    if (!activeReport) return;
    setExportError(null);
    setExporting("pptx");
    try {
      await exportReportAsPptx(activeReport);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PPTX export failed";
      setExportError(msg);
    } finally {
      setExporting(null);
    }
  };

  const filteredCount = useMemo(
    () => items.filter((r) => r.userId === "mock-user-1").length,
    [items],
  );

  return (
    <div className="grid grid-cols-1 gap-6 py-2 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8 lg:print:block">
      {/* Sidebar — saved reports + new */}
      <aside
        aria-label="Saved reports"
        className="flex flex-col gap-3 print:hidden"
      >
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            setPrompt("");
          }}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-yellow px-3 py-2 font-body text-sm font-semibold text-navy shadow-yellow transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          New report
        </button>

        {hydrated && filteredCount > 0 && (
          <p className="px-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Saved · {filteredCount}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {items.map((r) => {
            const active = activeReport?.id === r.id;
            return (
              <li key={r.id}>
                <div
                  className={cn(
                    "group relative flex items-start gap-2 rounded-md p-3 transition-colors duration-280 ease-out-quart",
                    active
                      ? "text-cloud-white"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]",
                  )}
                  style={
                    active
                      ? {
                          background: "var(--color-ua-dim)",
                          border:
                            "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
                        }
                      : { border: "1px solid var(--border-subtle)" }
                  }
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="flex min-w-0 flex-1 flex-col gap-1 text-left focus-visible:outline-none"
                  >
                    <FileText
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        active ? "text-ua" : "text-[color:var(--text-muted)]",
                      )}
                      strokeWidth={2}
                    />
                    <span className="font-body text-sm font-semibold leading-tight">
                      {r.title}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                      {r.clientLabel} · {new Date(r.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(r.id)}
                    aria-label="Delete report"
                    className="invisible inline-flex h-6 w-6 items-center justify-center rounded text-[color:var(--text-muted)] transition-colors duration-280 hover:bg-[color:var(--surface-hover)] hover:text-creative group-hover:visible"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Main column */}
      <main className="flex flex-col gap-6">
        {!activeReport ? (
          <BuilderInput
            prompt={prompt}
            setPrompt={setPrompt}
            generating={generating}
            onGenerate={handleGenerate}
          />
        ) : (
          <>
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg p-3 print:hidden"
              style={{
                background: "var(--surface-glass)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <div className="flex min-w-0 flex-col">
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                  Editing
                </p>
                <p className="truncate font-body text-sm font-semibold text-cloud-white">
                  {activeReport.title}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ViewToggle mode={viewMode} onChange={setViewModePersisted} />
                <button
                  type="button"
                  onClick={handleCopyShare}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-ua" strokeWidth={2.5} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} />
                      Share link
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-secondary)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                  style={{ border: "1px solid var(--border-default)" }}
                >
                  <FileImage className="h-3.5 w-3.5" strokeWidth={2} />
                  {exporting === "pdf" ? "Generating..." : "PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleExportPptx}
                  disabled={exporting !== null}
                  className="inline-flex items-center gap-1.5 rounded-md bg-yellow px-3 py-2 font-body text-xs font-semibold uppercase tracking-wider text-navy shadow-yellow transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                >
                  <Presentation className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {exporting === "pptx" ? "Generating..." : "PPTX"}
                </button>
              </div>
            </div>

            {exportError && (
              <p
                role="alert"
                className="rounded-md px-3 py-2 font-body text-xs"
                style={{
                  background: "color-mix(in oklab, var(--color-creative) 18%, transparent)",
                  color: "var(--color-creative)",
                  border: "1px solid color-mix(in oklab, var(--color-creative) 45%, transparent)",
                }}
              >
                Export failed: {exportError}
              </p>
            )}

            {viewMode === "carousel" ? (
              <ReportCarousel
                report={activeReport}
                onChange={handleDocChange}
                activeIndex={activeSlide}
                onActiveIndexChange={setActiveSlide}
              />
            ) : (
              <ReportDocument
                report={activeReport}
                onChange={handleDocChange}
              />
            )}

            {/* Off-screen deck used by the PDF exporter. Mounted only
                while a PDF export is in progress so we don't pay the
                render cost otherwise. */}
            {deckMounted && (
              <ReportDeckOffscreen ref={deckRef} report={activeReport} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const segments: { value: ViewMode; label: string; Icon: typeof Layers }[] = [
    { value: "carousel", label: "Carousel", Icon: Layers },
    { value: "document", label: "Document", Icon: ScrollText },
  ];
  return (
    <div
      role="tablist"
      aria-label="Report view"
      className="inline-flex items-center rounded-md p-0.5"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-default)",
      }}
    >
      {segments.map(({ value, label, Icon }) => {
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 font-body text-[11px] font-semibold uppercase tracking-wider transition-[background-color,color,box-shadow] duration-200",
              active
                ? "text-navy"
                : "text-[color:var(--text-secondary)] hover:text-cloud-white",
            )}
            style={
              active
                ? {
                    background: "var(--color-yellow)",
                    boxShadow: "var(--shadow-yellow)",
                  }
                : undefined
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={active ? 2.5 : 2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function BuilderInput({
  prompt,
  setPrompt,
  generating,
  onGenerate,
}: {
  prompt: string;
  setPrompt: (s: string) => void;
  generating: boolean;
  onGenerate: (s: string) => void;
}) {
  const sections: { Icon: typeof BarChart3; label: string; body: string }[] = [
    {
      Icon: FileText,
      label: "Executive summary",
      body: "Two paragraphs that frame the period and the headline movement.",
    },
    {
      Icon: BarChart3,
      label: "Key metrics",
      body: "Spend, Installs, CPI, ROAS, with delta vs the prior comparable window.",
    },
    {
      Icon: Table,
      label: "Channel breakdown",
      body: "Spend share and ROAS per channel. Top campaigns called out below.",
    },
    {
      Icon: ListChecks,
      label: "Recommendations",
      body: "Three plays Lumen suggests, each a hypothesis the team can test.",
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-2">
      <header className="flex flex-col items-start gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-yellow"
          style={{
            background: "var(--tint-yellow-soft)",
            boxShadow: "0 0 24px rgba(255,221,12,0.18)",
          }}
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.25} />
          Build & share
        </span>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          Reports{" "}
          <span className="text-gradient-brand">that write themselves.</span>
        </h2>
        <p className="max-w-2xl font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
          Describe what you need. Lumen pulls the data, builds a structured
          document with the right sections, and gives you something to send to
          CSM or to a client. Every section is editable; share via link or
          export to PDF.
        </p>
      </header>

      <GlassCard glow="ua" feature shimmer bezel className="w-full p-4">
        <form
          aria-label="Generate report"
          onSubmit={(e) => {
            e.preventDefault();
            onGenerate(prompt);
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="report-prompt" className="sr-only">
            What should this report cover?
          </label>
          <textarea
            id="report-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should this report cover? e.g. 'Weekly UA performance summary for Lumi Runner with top campaigns and recommendations.'"
            rows={4}
            className="w-full resize-none rounded-md px-4 py-3 font-body text-base text-cloud-white outline-none transition-[border-color,box-shadow] duration-280 ease-out-quart placeholder:text-[color:var(--text-muted)] focus:border-ua focus:shadow-mint disabled:cursor-not-allowed"
            style={{
              background: "var(--surface-input)",
              border: "1px solid var(--border-default)",
            }}
            disabled={generating}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-body text-xs text-[color:var(--text-muted)]">
              Your global filter feeds in as the period and client. ⌘ + Enter
              to generate.
            </p>
            <button
              type="submit"
              disabled={generating || !prompt.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-yellow px-4 py-2 font-body text-sm font-semibold text-navy shadow-yellow transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
              {generating ? "Generating…" : "Generate report"}
            </button>
          </div>
        </form>
      </GlassCard>

      <div className="flex flex-col gap-2">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          Or start from a preset
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PROMPT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={generating}
              onClick={() => onGenerate(p)}
              className="group rounded-md border px-3 py-2.5 text-left font-body text-xs font-medium leading-snug text-[color:var(--text-secondary)] transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px hover:border-ua hover:bg-[color:var(--surface-hover)] hover:text-cloud-white disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
              style={{
                background: "var(--surface-glass)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-2">
        <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          What you&rsquo;ll get back
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sections.map(({ Icon, label, body }) => (
            <div
              key={label}
              className="flex items-start gap-3 rounded-lg p-4"
              style={{
                background: "var(--surface-glass)",
                border: "1px solid var(--border-glass)",
              }}
            >
              <span
                aria-hidden
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md"
                style={{
                  background: "var(--tint-ua-soft)",
                  color: "var(--color-ua)",
                  boxShadow:
                    "0 0 12px color-mix(in oklab, var(--color-ua) 30%, transparent)",
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-tight text-cloud-white">
                  {label}
                </p>
                <p className="mt-1 font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
