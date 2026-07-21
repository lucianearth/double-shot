---
name: wireframe
description: >
  UX-first wireframing: derive a THOROUGH user-story list, wireframe every story with a
  constrained low-fi HTML kit, machine-lint taste (word budgets, one primary action,
  story↔frame traceability), and iterate with the human until the wireframe is APPROVED —
  before any blueprint or build. The approved stories+frames become the UX contract that
  planning and building must serve. Use when starting any UI-bearing project or change
  ("wireframe this", "UX first", "what should this screen be?"), before double-shot /
  americano planning whenever the work touches a user-facing surface, AND standalone —
  "just the wireframe part", "do the wireframe thing (from double-shot)", "let's wireframe
  it first" — where the session simply ends with the approved contract on disk
  (stories.md + frames + decisions.md) for a later build to pick up. ALSO load this
  whenever USER STORIES come up at all — writing them, reviewing them, or pre-planning a
  feature in conversation before any workflow exists: the UX-forward story method here
  (beats of the experience, never correctness cases; the category sweep; story↔frame
  traceability) is the house style for user stories. Not for pure backend/CLI work with
  no surface.
---

# wireframe — align on the experience before anything supports it

Functionality gaps get caught by tests; **experience gaps get caught here or never** — a
missing search bar is invisible to a green suite. This skill front-loads that catch: you
align with the human on *what the experience is* (stories + frames), and everything
downstream — blueprint, build, review — exists to serve it.

Two design decisions make AI wireframing work, don't fight them:

1. **Never draw; declare.** No freehand SVG, no coordinates — models are bad at geometry.
   Frames are HTML composed ONLY from the bundled kit (`assets/wireframe.css`); the
   browser's layout engine does all spatial work. Low-fi is enforced by the kit: grayscale,
   one font, sketchy borders — so every iteration argument is about structure and
   hierarchy, never color or polish.
2. **Written ≠ good.** You must LOOK at what you made (screenshot + vision) and lint it
   before the human ever sees it.

## Run it context-lean (orchestrator + subagents)

You (the main agent) hold ONLY the loop; subagents do all the file work. **The loop's
entire state lives on disk** — `stories.md`, the frames, and `decisions.md` — never in
anyone's context, which is what makes fresh subagents cheap and the loop survivable
across compaction and sessions.

- **Round 0**: one subagent gets a distilled brief (or the plan-doc path) → writes
  stories + frames, lints, builds the showcase. You receive a one-paragraph summary.
- **Each revision round**: hand a FRESH subagent the wireframes dir + the user's
  feedback verbatim → it applies the feedback, re-lints, regenerates the showcase,
  appends to `decisions.md`, and returns ≤5 lines. You republish the showcase and relay.
- **`decisions.md`** is the re-litigation guard: each round the subagent appends what
  feedback came in, what changed, and what was explicitly rejected — so round 5's fresh
  agent doesn't propose back what round 2 killed.

**Every subagent prompt must pin the context budget.** Include, verbatim in spirit:
*"Your entire world is the wireframes directory (stories.md, the frame files,
decisions.md, wireframe.css) plus this brief/feedback. Do NOT explore the repo, do NOT
read the codebase, do NOT try to learn everything, do NOT read the full plan doc unless
this brief points you at specific sections. Stay focused and context-efficient: read the
dir, do the work, lint, regenerate the showcase, append to decisions.md, and return a
summary of five lines or fewer — never file contents."*

## The protocol

### 1. Stories first — the thorough sweep

Write `stories.md` in the wireframes dir (`docs/wireframes/` unless told otherwise):
`- **S1** — As a …, I want …, so that …` under category headings (the lint accepts `—`,
`–`, or a plain `-` after the ID — use `-` when the doc should read author-neutral).

**Stories are UX-FORWARD: each one is a beat of the experience — what the user sees,
reaches, and feels while doing the thing the app is for.** They are NOT correctness
cases; the build pipeline already owns correctness (adversarial verify loops, reviews).
If a story reads like a test case, cut it. The litmus: *"invalid input is rejected"* is
a test; *"the form makes invalid input impossible to type"* is a story. Every story
should be answerable by pointing at a frame and walking it with a thumb.

Sweep ALL of these experience moments — the sweep is what catches the missing piece
(the search bar that isn't there) up front:

- **Arrival**: the first ten seconds; what the screen answers before anything is tapped;
  the unconfigured first-run moment.
- **The core loop** (×N): the 2–4 things done every session, and how each should *feel* —
  one glance? one thumb? zero waiting?
- **Find & navigate**: search, filters, how anything is reached (≤2 taps to core areas).
- **Create/edit**: how input feels — fewest taps, defaults that are usually right.
- **Moments of trust**: can I act on what I'm seeing? Freshness, empty-with-a-reason,
  silence that is informative.
- **The worst moment**: the 3am page, the panic button — what the experience is when
  things are bad (how it *feels* under stress, not whether the system is correct).
- **Power user**: the shortcut the daily user will crave in week 2.

End with an **"Out of scope this pass"** list — absence must be a decision, not an
oversight. For a bounded change (americano-sized), sweep the same categories but scoped
to the touched surfaces — even a one-frame change gets its stories.

### 2. Frames from stories

One `NN-name.html` per screen (numeric prefix = presentation order). Copy
`assets/wireframe.css` into the wireframes dir so the set is self-contained. Rules:

- Exactly one `<section class="frame" data-title="…" data-stories="S1,S5">` per file.
- Compose ONLY kit classes. A component the kit lacks is a design smell to question first.
- **Real words only for labels, headings, and actions.** Body copy is `.line` skeletons —
  if you're writing sentences into a frame, you're arguing with prose instead of structure.
- Mobile frame first; add `.desktop` only where the layout materially differs.
- Distinct states (empty, error, first-run) are their own frames — FULL screens, exactly
  like the state they portray. There is no half-height fragment class: a shrunken frame
  reads as a popup and confuses humans and agents alike. If something truly is a
  sheet/dialog, draw it over its dimmed parent screen inside one full frame.
- Optionally group the set into journeys: put `data-section="Donor journey — the first
  give"` on the first frame of each group; the showcase renders a section header there
  and every frame's `data-title` as a visible caption.
- Explain behavior in `<aside class="note">` stickies (annotation, budget-exempt), placed
  after the frame: what taps do, why something is placed where it is, which story it serves.

### 3. Lint — the machine-checkable taste gate

```
node <skill-dir>/assets/lint-wireframes.mjs docs/wireframes [--budget 60]
```

Fails on: >60 visible words/frame (override per-frame with `data-budget` only with a
stated reason), >2 primary buttons, a story no frame serves (**the missing-piece catch**),
unknown story refs, missing `data-title`. Warns on frames serving no story. Fix until clean.

### 4. Look at it

Serve the dir (`python3 -m http.server`), screenshot every frame with agent-browser, and
READ each screenshot yourself. No agent-browser? A headless Chrome works:
`npx -y @puppeteer/browsers install chrome-headless-shell@stable --path .chrome`, then
`<binary> --no-sandbox --screenshot=wf.png --window-size=1350,8000 file://<abs>/showcase.html`.
Self-critique against: is the hierarchy the story's hierarchy? one obvious primary
action? would a thumb reach it? what feels missing walking each story tap-by-tap? If no
browser is available at all, say so — do not claim the visual check happened.

### 5. Present & iterate — the human gate

```
node <skill-dir>/assets/showcase.mjs docs/wireframes
```

One self-contained `showcase.html` (stories on top, frames + stickies below, section
headers wherever frames declare `data-section`) — show it to the human (send the file /
publish it as an artifact, same URL each round). The headless binary from step 4 also
prints a shareable PDF (`--print-to-pdf=wf.pdf file://<abs>/showcase.html`) — useful when
review happens in Google Drive, whose PDF preview supports region-anchored comments. Iterate on
their feedback in words; frames are tiny, so rounds are cheap, and every round is logged
in `decisions.md`. **Only the human approves a wireframe.** If the repo defines a
`review-subagents` skill, run it over the showcase BEFORE the human sees it and fold its
blockers — a repo's design/UX reviewer (taste: text minimization, motion, brand UX rules)
lives inside review-subagents and picks this up.

### 6. Hand off as contract

After approval: commit `stories.md` + frames + `decisions.md`; downstream planning must
trace every UI surface to a frame, and `fe_verify` route expectations derive from frames
(structural match — "is the hierarchy this?" — not pixel match). Pass the dir as
`wireframesDir` to the double-shot/americano plan workflows; their Reconcile phase then
confirms the finished blueprint kept every frame **feasible, accurate, and
representative**, and any drift comes back to the human gate ('revise-frame' drift means
another wireframe round + re-approval before building). A build that contradicts an
approved frame without a new human decision is a defect.

## Example

`examples/trading-console/` is the canonical few-shot: 12 stories → 6 frames (including
a first-run state), lint-clean, with stickies explaining placements. Match its altitude:
~5–8 frames for an app-sized pass, word counts in the 20–40s, structure argued in
skeletons and notes — not copy.
