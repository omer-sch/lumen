import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// Skills Hermes uses. The slugs map to .claude/skills/<slug>/SKILL.md
// directories; the profile page reads the YAML frontmatter from each
// at request time. New skills land here as Hermes picks up more
// capabilities; the loader degrades gracefully when a slug points at
// a missing or malformed file.

export const HERMES_SKILLS = [
  "agentdb-vector-search",
  "agentdb-memory-patterns",
  "verification-quality",
] as const;

export type HermesSkillSlug = (typeof HERMES_SKILLS)[number];

export type SkillCard = {
  slug: string;
  name: string;
  description: string;
  found: boolean;
};

// Parses the YAML frontmatter at the top of a SKILL.md. Intentionally
// minimal: a quoted name + description, nothing more. Avoids pulling
// a YAML dep for two keys.
function parseFrontmatter(source: string): {
  name: string | null;
  description: string | null;
} {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) return { name: null, description: null };
  const block = match[1];
  const lineFor = (key: string) => {
    const re = new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m");
    const m = block.match(re);
    return m ? m[1].trim() : null;
  };
  return { name: lineFor("name"), description: lineFor("description") };
}

export async function loadSkillCard(slug: string): Promise<SkillCard> {
  const file = path.join(
    process.cwd(),
    ".claude",
    "skills",
    slug,
    "SKILL.md",
  );
  try {
    const raw = await readFile(file, "utf8");
    const fm = parseFrontmatter(raw);
    return {
      slug,
      name: fm.name ?? slug,
      description:
        fm.description ?? "Skill description unavailable in SKILL.md.",
      found: true,
    };
  } catch {
    return {
      slug,
      name: slug,
      description: "Skill file not present (placeholder).",
      found: false,
    };
  }
}

export async function loadHermesSkills(): Promise<SkillCard[]> {
  return Promise.all(HERMES_SKILLS.map((slug) => loadSkillCard(slug)));
}
