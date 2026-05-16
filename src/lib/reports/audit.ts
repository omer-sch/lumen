import type { ReportAuditEntry, ReportSection } from "./types";

// Section-level diff for the edit audit log. The PUT /api/reports/[id]
// handler calls this before upserting so the row picks up an "edit"
// entry per section that changed since the last save.
//
// Section-level granularity (not per-bullet) is the simplest signal
// that "Lior touched X". Per-bullet diffs are queued for a follow-up;
// they need a stable bullet id and a debounce that survives undo/redo
// rounds without splitting one logical edit into several entries.

const MAX_SNIPPET = 500;

function truncate(s: string): string {
  if (s.length <= MAX_SNIPPET) return s;
  return `${s.slice(0, MAX_SNIPPET)}... (truncated, ${s.length - MAX_SNIPPET} more chars)`;
}

function stringifySection(s: ReportSection): string {
  try {
    return JSON.stringify(s);
  } catch {
    return "(unserialisable section)";
  }
}

export function diffSectionsForAudit(
  prior: ReportSection[],
  next: ReportSection[],
  by: string,
): ReportAuditEntry[] {
  const at = new Date().toISOString();
  const entries: ReportAuditEntry[] = [];

  // Build maps keyed by section.id so reordered sections still diff
  // correctly. Sections with the same id but different bodies appear
  // as edits; sections added or removed appear as edits too (with a
  // synthetic before/after).
  const priorById = new Map<string, ReportSection>();
  prior.forEach((s) => priorById.set(s.id, s));

  for (const nextSection of next) {
    const priorSection = priorById.get(nextSection.id);
    if (!priorSection) {
      entries.push({
        kind: "edit",
        section_id: nextSection.id,
        before: "(absent)",
        after: truncate(stringifySection(nextSection)),
        at,
        by,
      });
      continue;
    }
    const beforeStr = stringifySection(priorSection);
    const afterStr = stringifySection(nextSection);
    if (beforeStr !== afterStr) {
      entries.push({
        kind: "edit",
        section_id: nextSection.id,
        before: truncate(beforeStr),
        after: truncate(afterStr),
        at,
        by,
      });
    }
  }

  return entries;
}
