# Prompt: Agent Playground -- Per-Agent Full-Page Workspace

Paste this into a fresh Claude Code instance from the Lumen repo root.

---

## Your role

You are the lead frontend engineer on Lumen (yellowHEAD's AI dashboard). Your job in this task is to build a new full-page workspace for each of Lumen's three agents (Aria, Max, Nova), replacing the current modal-style `AgentDetailPanel` as the primary way users interact with an agent.

The product partner has already locked the design direction. This is an implementation task. You are not designing from scratch -- you are implementing the spec below faithfully and making it feel beautiful and on-brand.

---

## Context you must read first, in this order

1. `/Users/omer/Desktop/Lumen/CLAUDE.md` -- product vision, brand stance, IA, conventions.
2. `.claude/skills/yellowhead-brand/SKILL.md` -- the brand system. **Do not start writing UI before reading this.** Every color, font, radius, and spacing decision must come from this skill or from `src/app/globals.css`. No raw hex values in components.
3. `/Users/omer/Documents/Claude/Projects/yellow head/Lumen Vault/Product/Pages/Agents.md` -- product spec for the Agents page. The new detail-page section is appended below in this prompt; treat it as canonical.
4. `src/lib/mock/agents.ts` -- the existing `AGENTS` mock array. The detail page reads from this. Extend the types where the spec calls for new fields; do not break existing consumers.
5. `src/components/agents/AgentsView.tsx`, `AgentCard.tsx`, `AgentDetailPanel.tsx`, `AgentRunOutput.tsx` -- the existing agents surface. You will modify the listing to route to the new page, and you will retire `AgentDetailPanel` once the new page covers its use cases.

---

## The product decision in one paragraph

Today the Agents page is a listing of three cards (Aria, Max, Nova). Clicking a card opens an inline panel. We are replacing that with a per-agent full-page workspace at `/agents/[id]`. The workspace is designed for non-technical users (CSMs, marketers) to feel like they are stepping into the agent's studio: avatar at the top, the agent greeting them in their own voice, a large chat input with suggestion chips, the agent's recent work as the main body, a friendly toolkit panel, and two clear action buttons at the bottom. The page reads top to bottom as a single story, not a dashboard with quadrants.

---

## Page specification

### Route

`src/app/(app)/agents/[id]/page.tsx`

Behavior:

- Reads the agent id from the URL.
- Looks up the agent in `AGENTS` (from `src/lib/mock/agents.ts`).
- 404s cleanly if the id is unknown.
- The existing `/agents` listing page links into this route. Each `AgentCard` becomes a link wrapper; the card itself stays visually unchanged.

### Layout (shared shell, three variations in the middle)

All three agents share the same shell. The only meaningful difference is the **main output region** between the chat input and the toolkit panel, because Max produces text alerts, Aria produces images, and Nova produces document drafts.

Top to bottom, the shell is:

1. **Breadcrumb** -- "Back to agents" with a left-arrow icon, links to `/agents`.
2. **Identity header** -- large avatar (96px) with mint ring (`--color-ua`) when running, grayscale + dimmed when paused. Name on top in display font, role one line below, then a single thin stats line: `This week: 7 runs · 18 things found · $0.28 spent` -- exact stat labels depend on agent (see below).
3. **Greeting bubble** -- a speech-bubble card with a small tail pointing up-left toward the avatar. Contains a one-to-two-sentence message in the agent's voice, generated from the most recent run. The yellow `--color-yellow` accents the key number in the greeting and nothing else. The bubble is `--surface-elevated` background, 14px border-radius.
4. **Chat input + suggestion chips** -- a full-width card wrapping (a) a chat input with placeholder text "Ask Max anything…" (or "Tell Aria what to make…", or "Talk to Nova…") and a mint Send button, and (b) a wrapping row of 3-5 suggestion chips. The chips are pill-shaped, outlined in mint, transparent background. Clicking a chip pre-fills the input but does not auto-send.
5. **Main output region** -- agent-specific (see below).
6. **Toolkit panel** -- a single paragraph in the agent's voice describing what the agent does and when. A row of "connected tool" pills with Tabler icons. A small footer line linking to "See what she/he's learned" (memory).
7. **Two action buttons** -- equal-width grid: a mint "Run [agent] now" button and an outlined "Pause [agent]" button. Disabled state when the agent is currently running.

The whole thing scrolls vertically. Do not use tabs. Do not use a sidebar. Do not split the page into columns above mobile. On desktop the content sits in a max-width container that matches the other pages in `src/app/(app)/`.

### Main output region per agent

**Max (Anomaly Scanner)** -- a vertical stack of "what Max has been up to" cards, one per recent run from `agent.history`. The most recent run gets a mint left-border accent and the full action row underneath (Show me / Helpful / Not useful / Tell Max why). Older runs are compact: timestamp, count chip, one-line quote of what Max found. Each anomaly card carries a yellow pill with the anomaly count when count > 0. Click "Show me" expands the related anomalies inline (use `AnomalyOutput[]` from the existing mock). Clicking a single anomaly should link to its corresponding Feed item -- for v1 the link target is `/feed#anomaly-${runId}-${index}`; the Feed page does not need to handle that anchor yet, that is a future ticket.

**Aria (Image Agent)** -- a **today's hero card** at the top: a 1.3:1 grid where the left tile is the generated image (use `ImageOutput.imageUrl` when present, otherwise render a CSS gradient using `ImageOutput.palette` exactly as `AgentRunOutput` already does). The image carries two overlay chips: bottom-left timestamp, top-right yellow star score (`<i class="ti ti-star">` icon if you use Tabler, or `lucide-react` `Star` -- match whichever the codebase uses; default to lucide as the rest of the app does). The right tile shows the agent's one-line quote about the composition, a row of mood tags, and two stacked buttons: a mint "Ship this one" and an outlined "Try a different vibe". Below the today's hero card, render a 4-up thumbnail gallery of previous runs (smaller square tiles, each with score badge). **Ship this one** writes a `published: true` flag back to the run; do not actually publish anything externally. For v1, every generated image is queued for approval; nothing goes live without an explicit Ship click.

**Nova (Report Writer)** -- a "draft preview" card at the top showing the most recent report: title, the executive-summary excerpt from `ReportOutput.excerpt`, the three metric chips, and two buttons: mint "Open in Reports" (links to `/reports`) and outlined "Suggest edits". Below that, a stack of previous draft cards (compact: date, title, rating in yellow stars).

### Voice and copy

Every agent speaks in first person, casual but professional. The greeting message is the only place where the agent is verbose. Tone reference:

- Max: "Hey Omer. I scanned BigQuery at 08:00. Found 3 things worth your attention this morning -- the biggest one is iOS CPI on Meta. Want me to walk you through it?"
- Aria: "Today's hero is ready. Virality predictor scored it 87 -- that's people-will-love-this territory. Want to ship it, or should I try another angle?"
- Nova: "Your weekly UA summary is 80% drafted. I led with ROAS this week since that was the big mover. Want to review or have me try a different angle?"

The suggestion chips are agent-specific:

- Max: "What did you find this morning?" / "Why is iOS CPI down?" / "Scan again now" / "Be more sensitive"
- Aria: "Make it moodier" / "More minimal" / "Why this style?" / "Generate a new one"
- Nova: "Make it shorter" / "Lead with creative" / "Draft as email" / "Why this order?"

Hardcode the chip strings into the page component for now. We will move them to the agent data shape in a later ticket.

### Stats line per agent

- Max: `7 runs · 18 things found · $0.28 spent`
- Aria: `7 images · avg score 82 · $1.40 spent`
- Nova: `4 drafts · avg rating 4.7 · $0.62 spent`

These values are placeholders. Compute `runs` from `agent.history.length` (or the totalRuns field). For `things found` / `avg score` / `avg rating`, derive from `agent.history`. Cost numbers are static placeholders for now -- add a `costThisWeek: string` field to the `Agent` type with these defaults.

---

## Data shape changes

Extend `src/lib/mock/agents.ts`:

```ts
export type Agent = {
  // ...existing fields...
  costThisWeek: string;       // e.g. "$0.28"
  toolkit: {
    sentence: string;         // one-paragraph plain-English description
    tools: { name: string; icon: string }[];  // icon = lucide icon name
  };
  greeting: string;           // the agent's voice for the bubble
};
```

Populate `greeting`, `costThisWeek`, and `toolkit` for each of the three agents using the voice samples above. Keep the existing fields untouched.

---

## Components to create

All under `src/components/agents/playground/`:

- `AgentPlaygroundPage.tsx` -- top-level orchestrator (used by the route).
- `AgentIdentityHeader.tsx` -- avatar, name, role, stats line.
- `AgentGreeting.tsx` -- speech-bubble card.
- `AgentChatInput.tsx` -- input + Send + suggestion chips. State is internal for v1 (no submission backend yet -- log to console on Send).
- `AgentTimelineMax.tsx` -- Max's recent-work stack.
- `AgentGalleryAria.tsx` -- Aria's today's-hero card + thumbnail row.
- `AgentDraftNova.tsx` -- Nova's draft preview + previous drafts.
- `AgentToolkit.tsx` -- toolkit panel.
- `AgentActions.tsx` -- the two big bottom buttons.

The orchestrator picks which middle component to render based on `agent.id`. Do not branch with `switch` statements inside the leaf components -- keep them agent-aware via props, not via id checks.

---

## Out of scope for this ticket

- Real chat backend. The Send button logs to console.
- Chat history persistence. We will add a `chat_messages` table in Supabase in a separate ticket.
- Real "Run now" execution. Wire the button to the existing handler that fakes a status change on `AgentsView`; if that handler does not exist, add a no-op that toggles `agent.status` to "running" in local state.
- Edit-the-agent settings (prompt, schedule, thresholds). Not in v1.
- The `Show me` inline expansion for older Max runs. v1 only does inline expansion on the most-recent run.
- Multi-team theming. Mint accent only.
- Mobile-specific layout below 768px. Stack everything; do not optimize.

---

## Acceptance criteria

A reviewer should be able to verify each of these without asking questions:

1. Navigating to `/agents/aria`, `/agents/max`, and `/agents/nova` all render the new full-page workspace. Bad ids 404 cleanly.
2. Clicking any card on `/agents` navigates to the corresponding detail route. The current `AgentDetailPanel` modal is removed from `AgentsView`.
3. Each agent's greeting bubble shows the correct first-person message in their voice with the yellow accent on the key number.
4. The chat input is full width on desktop, the Send button is mint, and the four suggestion chips for each agent match the strings listed above.
5. Max's page shows three recent-work cards. The most recent has a mint left border and the full action row. The yellow pill shows the anomaly count.
6. Aria's page shows the today's-hero card with the gradient placeholder when `imageUrl` is absent, the star score chip in yellow, and a 4-up thumbnail gallery below it.
7. Nova's page shows the draft preview with title, excerpt, three metric chips, and two buttons.
8. The toolkit panel reads as a single paragraph with tool pills. The "Pause [agent]" button toggles the paused state in local component state and the avatar ring goes grayscale.
9. The page passes the yellowHEAD-brand visual rules: no raw hex values, all colors via CSS custom properties or Tailwind tokens, the display font on the agent name, the body font everywhere else.
10. The page renders on `npm run dev` without console errors.

---

## How to verify before declaring done

Run `npm run dev` and:

- Click each of the three agent cards on `/agents`.
- Confirm visual fidelity against the mockups in the chat session that produced this prompt (the human will compare).
- Toggle Pause and confirm the avatar ring goes grayscale on the listing card too (since the listing reads the same agent state).
- Click each suggestion chip on each page and confirm it pre-fills the input.
- Click Send with text and confirm it logs to console without crashing.

---

## Notes you should not need but might want

- The avatars are at `public/avatars/aria.png`, `max.png`, `nova.png` at 256x256.
- The Glass fallback bulb is at `src/components/ui/GlassBulb.tsx` -- use as `onError` fallback on the avatar image, matching the existing pattern in `AgentCard.tsx`.
- The Anomaly / Image / Report render primitives already exist in `AgentRunOutput.tsx`. Reuse where it makes sense rather than re-implementing.
- The codebase uses `lucide-react` for icons throughout. Stick with that even where this spec mentions Tabler -- substitute the closest equivalent (`Star`, `Sparkles`, `PlayCircle`, `Pause`, `MessageCircle`, `ArrowRight`, `ThumbsUp`, `ThumbsDown`).
- The codebase already has a `cn()` helper at `src/lib/utils.ts`.

---

## When you are done

Reply with:

1. The list of files you created or modified, grouped by purpose.
2. Anything from the spec you could not implement cleanly and your proposed alternative.
3. Any open questions for the product partner before this ships.

Do not write a long summary. The human can read the diff.
