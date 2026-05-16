import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import {
  ArrowRight,
  ExternalLink,
  FileText,
  Mail,
  Mailbox,
  PenTool,
  Search,
  Sparkles,
  Star,
  Users,
  Wrench,
} from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { HermesDraftCTA } from "@/components/agents/hermes/HermesDraftCTA";
import { listRecentHermesRunsForUser } from "@/lib/agents/hermes/recent-runs";
import { loadHermesSkills } from "@/lib/agents/hermes/skills";
import { AGENT_IDENTITIES } from "@/lib/agents/identity";
import { getContactsForClient } from "@/lib/contacts";
import { isSupabaseConfigured } from "@/lib/env.server";

export const metadata = { title: "Hermes · Lumen" };

const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

const PREVIEW_USER_ID = "preview-user";

const NODE_CARDS = [
  {
    name: "parse_intent",
    model: "Haiku",
    description:
      "I read your client's email and figure out what they're actually asking for: which client, which platforms, which channels, which week.",
    Icon: Mail,
  },
  {
    name: "Analyze",
    model: "Sonnet",
    description:
      "I pull the right numbers from BigQuery, run Anomstack over them, and rank the findings worth telling a story about.",
    Icon: Search,
  },
  {
    name: "Quill",
    model: "Sonnet",
    description:
      "I write the deck content in yellowHEAD's voice. Every claim cites its source; a validator fails the run if any number ships without one.",
    Icon: PenTool,
  },
  {
    name: "Atelier",
    model: "Supabase",
    description:
      "I assemble the structured Report and insert it as a draft. You review it in /reports, edit anything, regenerate any section.",
    Icon: FileText,
  },
] as const;

function formatRunTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusStyles(status: string): { color: string; bg: string } {
  switch (status) {
    case "completed":
      return {
        color: "var(--color-ua)",
        bg: "color-mix(in oklab, var(--color-ua) 16%, transparent)",
      };
    case "running":
      return {
        color: "var(--color-yellow)",
        bg: "color-mix(in oklab, var(--color-yellow) 16%, transparent)",
      };
    case "failed":
      return {
        color: "var(--color-creative)",
        bg: "color-mix(in oklab, var(--color-creative) 16%, transparent)",
      };
    default:
      return {
        color: "var(--text-secondary)",
        bg: "var(--surface-glass)",
      };
  }
}

export default async function HermesProfilePage() {
  const identity = AGENT_IDENTITIES.hermes;
  const supabaseOK = isSupabaseConfigured();
  const { userId: clerkUserId } = await auth();
  const userId = clerkUserId ?? (PREVIEW ? PREVIEW_USER_ID : null);

  const [skills, contacts, recentRuns] = await Promise.all([
    loadHermesSkills(),
    supabaseOK
      ? getContactsForClient("globalcomix").catch(() => [])
      : Promise.resolve([]),
    supabaseOK && userId
      ? listRecentHermesRunsForUser(userId, 8).catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
      {/* Section 1 · Identity */}
      <header className="flex flex-col gap-4">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
          Agents · Hermes
        </p>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-5">
            <div
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl"
              style={{
                border:
                  "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
                boxShadow: "var(--shadow-mint)",
              }}
            >
              <Image
                src={identity.avatarUrl}
                alt={`${identity.name} avatar`}
                width={256}
                height={256}
                priority
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-cloud-white">
                {identity.name}
              </h1>
              <p className="font-body text-sm text-[color:var(--text-secondary)]">
                Drafts weekly client reviews from email. UA team.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
                  style={{
                    background: "var(--tint-ua-soft)",
                    border:
                      "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
                  }}
                >
                  UA team
                </span>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-secondary)]"
                  style={{
                    background: "var(--surface-glass)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <Mailbox className="h-3 w-3" aria-hidden strokeWidth={2.25} />
                  Gmail not connected
                </span>
              </div>
            </div>
          </div>
          <HermesDraftCTA />
        </div>
        <p className="max-w-3xl font-body text-base leading-relaxed text-[color:var(--text-secondary)]">
          Hi, I&rsquo;m Hermes. I read your inbox for client emails that look
          like report requests, then I draft a yellowHEAD weekly review with
          the right numbers. You review, edit if needed, and send.
        </p>
      </header>

      {/* Section 2 · What I do */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          eyebrow="What I do"
          title="Four nodes, one pipeline"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NODE_CARDS.map(({ name, model, description, Icon }) => (
            <div
              key={name}
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
                }}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-sm font-bold leading-tight text-cloud-white">
                    {name}
                  </p>
                  <span
                    className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={{
                      background: "var(--surface-input)",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    {model}
                  </span>
                </div>
                <p className="mt-1 font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 3 · My skills */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<Wrench className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          eyebrow="My skills"
          title="Capabilities I lean on"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {skills.map((s) => (
            <div
              key={s.slug}
              className="flex flex-col gap-2 rounded-lg p-4"
              style={{
                background: "var(--surface-glass)",
                border: s.found
                  ? "1px solid var(--border-glass)"
                  : "1px dashed var(--border-subtle)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-sm font-bold leading-tight text-cloud-white">
                  {s.name}
                </p>
                {s.found && (
                  <span
                    aria-label="In use"
                    className="inline-flex h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--color-ua)" }}
                  />
                )}
              </div>
              <p className="font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
                {s.description}
              </p>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                {s.slug}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Section 4 · GlobalComix contacts (v0.5 single-client demo;
          when multi-client filtering lands the heading + getContactsForClient
          arg become driven by the global filter). */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<Users className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          eyebrow="GlobalComix contacts"
          title="People I recognise"
        />
        {contacts.length === 0 ? (
          <EmptyState
            text={
              supabaseOK
                ? "No contacts seeded yet for GlobalComix."
                : "Supabase not configured; contact lookup unavailable."
            }
          />
        ) : (
          <GlassCard className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
                  style={{
                    background: "var(--surface-glass)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Client</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <td className="px-4 py-2 font-semibold text-cloud-white">
                      <span className="inline-flex items-center gap-2">
                        {c.name}
                        {c.isPrimary && (
                          <Star
                            className="h-3 w-3 text-[color:var(--color-yellow)]"
                            aria-label="Primary contact"
                            strokeWidth={2.25}
                          />
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-[color:var(--text-secondary)]">
                      {c.email}
                    </td>
                    <td className="px-4 py-2 text-[color:var(--text-secondary)]">
                      {c.role ?? (
                        <>
                          <span className="sr-only">Role not set</span>
                          <span aria-hidden>...</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[color:var(--text-secondary)]">
                      {c.clientId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </section>

      {/* Section 5 · Recent runs */}
      <section className="flex flex-col gap-4">
        <SectionHeading
          icon={<ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
          eyebrow="Recent runs"
          title="What I drafted for you"
        />
        {recentRuns.length === 0 ? (
          <EmptyState
            text={
              !supabaseOK
                ? "Supabase not configured; recent runs unavailable."
                : !userId
                  ? "Sign in to see your Hermes runs."
                  : "No Hermes runs yet. Paste an email above to draft one."
            }
          />
        ) : (
          <GlassCard className="overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
                  style={{
                    background: "var(--surface-glass)",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <th className="px-4 py-2 text-left">Started</th>
                  <th className="px-4 py-2 text-left">Client</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => {
                  const s = statusStyles(r.status);
                  return (
                    <tr
                      key={r.id}
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-[color:var(--text-secondary)]">
                        {formatRunTimestamp(r.startedAt)}
                      </td>
                      <td className="px-4 py-2 text-[color:var(--text-secondary)]">
                        {r.client ?? (
                          <>
                            <span className="sr-only">Client not set</span>
                            <span aria-hidden>...</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em]"
                          style={{ background: s.bg, color: s.color }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.reportId ? (
                          <Link
                            href={`/reports/${r.reportId}?source=hermes`}
                            className="inline-flex items-center gap-1 font-body text-xs font-semibold text-[color:var(--color-ua)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
                          >
                            Open
                            <ExternalLink
                              className="h-3 w-3"
                              strokeWidth={2.25}
                              aria-hidden
                            />
                          </Link>
                        ) : (
                          <span className="font-body text-xs text-[color:var(--text-muted)]">
                            <span className="sr-only">No report</span>
                            <span aria-hidden>...</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassCard>
        )}
      </section>
    </main>
  );
}

function SectionHeading({
  icon,
  eyebrow,
  title,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--color-ua)]"
        style={{
          background: "var(--tint-ua-soft)",
          border:
            "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
        }}
      >
        {icon}
        {eyebrow}
      </span>
      <h2 className="font-display text-xl font-bold tracking-tight text-cloud-white">
        {title}
      </h2>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-lg p-6 text-center font-body text-sm text-[color:var(--text-secondary)]"
      style={{
        background: "var(--surface-glass)",
        border: "1px dashed var(--border-subtle)",
      }}
    >
      {text}
    </div>
  );
}
