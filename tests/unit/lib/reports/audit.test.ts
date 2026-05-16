// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/reports/audit.ts.
// Section-level diff for the edit audit log: stable equality means no
// entry, JSON diff means one entry per section, before/after truncated.

import { describe, expect, it } from "vitest";

import { diffReportForAudit, diffSectionsForAudit } from "@/lib/reports/audit";
import type { ReportSection } from "@/lib/reports/types";

function platformSection(over: Partial<ReportSection> = {}): ReportSection {
  return {
    id: "platform_overall",
    platform: "android",
    title: "Android | Overall | Weekly Breakdown",
    summary: {
      rows: [],
      total: {
        label: "Total",
        spend: { value: 0 },
        substart: { value: 0 },
        subD0: { value: 0 },
        subD7: { value: 0 },
        cpSubstart: { value: 0 },
        cpaD0: { value: 0 },
        cpaD7: { value: 0 },
      },
    },
    bullets: [],
    ...over,
  } as ReportSection;
}

describe("diffSectionsForAudit", () => {
  it("returns no entries when sections are byte-equal", () => {
    const s = platformSection();
    expect(diffSectionsForAudit([s], [s], "user-1")).toEqual([]);
  });

  it("returns one entry per changed section, keyed by section_id", () => {
    const prior = platformSection({ title: "Old title" });
    const next = platformSection({ title: "New title" });
    const entries = diffSectionsForAudit([prior], [next], "user-1");
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("edit");
    if (entries[0].kind !== "edit") throw new Error("kind narrow");
    expect(entries[0].section_id).toBe("platform_overall");
    expect(entries[0].by).toBe("user-1");
    expect(entries[0].before).toMatch(/Old title/);
    expect(entries[0].after).toMatch(/New title/);
  });

  it("treats an added section as an edit with (absent) before", () => {
    const next = platformSection();
    const entries = diffSectionsForAudit([], [next], "user-1");
    expect(entries).toHaveLength(1);
    if (entries[0].kind !== "edit") throw new Error("kind narrow");
    expect(entries[0].before).toBe("(absent)");
  });

  it("does not audit unchanged title via the full-report diff", () => {
    const s = platformSection();
    expect(
      diffReportForAudit(
        { title: "Same", sections: [s] },
        { title: "Same", sections: [s] },
        "user-1",
      ),
    ).toEqual([]);
  });

  it("emits an edit_title audit entry when only the title changed", () => {
    const s = platformSection();
    const entries = diffReportForAudit(
      { title: "Old title", sections: [s] },
      { title: "New title", sections: [s] },
      "user-1",
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("edit_title");
    if (entries[0].kind !== "edit_title") throw new Error("kind narrow");
    expect(entries[0].before).toBe("Old title");
    expect(entries[0].after).toBe("New title");
  });

  it("emits both edit_title and section edits when both changed", () => {
    const prior = platformSection({ title: "Section old" });
    const next = platformSection({ title: "Section new" });
    const entries = diffReportForAudit(
      { title: "Report old", sections: [prior] },
      { title: "Report new", sections: [next] },
      "user-1",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe("edit_title");
    expect(entries[1].kind).toBe("edit");
  });

  it("truncates long snippets so audit rows stay manageable", () => {
    const longBullet = "x".repeat(2000);
    const prior = platformSection();
    const next = platformSection({
      bullets: [{ text: longBullet }],
    });
    const entries = diffSectionsForAudit([prior], [next], "user-1");
    expect(entries).toHaveLength(1);
    if (entries[0].kind !== "edit") throw new Error("kind narrow");
    expect(entries[0].after.length).toBeLessThan(longBullet.length);
    expect(entries[0].after).toMatch(/truncated/);
  });
});
