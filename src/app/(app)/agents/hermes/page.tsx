import { HermesPlayground } from "@/components/agents/hermes/HermesPlayground";

export const metadata = { title: "Hermes — Lumen" };

// Phase 2 playground for Hermes. Dedicated page (not via the [id] dynamic
// route) because Hermes' UX is materially different from Aria / Max / Nova:
// pasted-email input, run-trace breadcrumb, slide-manifest preview.
//
// Server-rendered shell + client-rendered interactive body. Once the
// streaming variant lands in phase 8 the client component swaps in an
// SSE-backed progress overlay; for now we keep the synchronous flow.

export default function HermesPlaygroundRoute(): React.ReactElement {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="font-body text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          Agents · Hermes
        </p>
        <h1 className="font-display text-4xl font-extrabold leading-none tracking-tight text-cloud-white">
          Hermes
        </h1>
        <p className="font-body text-sm text-[color:var(--text-secondary)]">
          Reports analyst. Paste a client email below and Hermes will parse the
          intent, then run Analyze, Quill, Atelier, and review_gate. Phase 2:
          parse_intent is real; the rest are shape-correct stubs. Phases 4 to 7
          fill them in one at a time.
        </p>
      </header>
      <HermesPlayground />
    </main>
  );
}
