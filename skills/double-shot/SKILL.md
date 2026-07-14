---
name: double-shot
description: >-
  Use when the user wants to take a substantial plan or design document all the way to a
  built, tested, reviewed product in one orchestrated push — phrasings like "one-shot this",
  "double-shot it", "build the whole thing from this plan", "ship this design / blueprint".
  Runs a two-phase orchestration — plan→blueprint (with a mandatory human feedback gate),
  then blueprint→build-to-green + adversarial review — using the bundled `plan-to-blueprint`
  and `build-from-blueprint` workflows. The main agent orchestrates; the workflows do the
  building. NOT for quick features or bug fixes. For an already-aligned, BOUNDED change landing
  in a GREEN repo — where the full up-front pass would be overkill — use the lighter `americano` skill.
---

# Double Shot

`double-shot` takes a substantial plan/design doc all the way to a built, tested, reviewed product, in **two phases with one human feedback gate between**.

You are the **orchestrator**: you understand the plan, align with the user, and run the two phases — but the building is done by two background **workflows**. Your context stays clean and you never do the heavy work yourself.

## The two phases (and the gate)

```
[you: understand the plan + repo, align with the user]     ← conversation
        │
[you + user: WIREFRAME GATE — UI-bearing work only]        ← iterate stories + frames to APPROVAL (the UX contract)
        │
   PHASE 1 — plan-to-blueprint    (research + design → BLUEPRINT.md → reconcile vs wireframes)
        │
[you: show the user the blueprint + flagged risks + wireframe drift]   ← FEEDBACK GATE (mandatory)
        │
   PHASE 2 — build-from-blueprint (scaffold → build modules → green → LIVE visual verify vs frames → review)
        │
[you: verify on disk yourself, then report]                ← back to the user
```

## Procedure

1. **Understand first.** Read the plan doc in full yourself; skim the repo. Reflect the goal back to the user so they know you've got it. Do **not** start building.
2. **Align on the forks the plan doesn't settle** — language/stack, scope, deployment target, anything genuinely the user's call. Ask (AskUserQuestion); don't guess. These become the workflow args. *(double-shot works for any stack, but shines when the plan has a **checkable invariant** — a core property the build can mechanically prove it preserved. **Rust is a great fit:** the type system can make the invariant structural, so a violation fails to compile and the adversarial verifier gets an objective answer. Surface this when it helps the user choose.)*
3. **Wireframe gate (UI-bearing work only).** If the work touches a user-facing surface: look for an approved wireframe set (`docs/wireframes/` with `stories.md` + frames + `decisions.md` — it may have been approved in an earlier session; the contract is on disk). Absent → run the **`wireframe` skill** to approval first: UX-forward stories, kit frames, lint, showcase, and an in-conversation iteration loop with the user — subagent-driven so your context stays lean (the skill's "context-lean" section is binding). If the repo defines `review-subagents`, run it over the showcase before each human round. **The experience is approved before anything designs the system.** Pure backend with no user-visible surface → skip silently.
4. **Phase 1 — plan-to-blueprint.** Invoke the workflow (see *Invoking* below) with `{ planPath, repoPath, stack, scope, constraints, wireframesDir? }`. It researches the toolchain, designs the hard subsystems, writes a `BLUEPRINT.md`, and — when a wireframe contract exists — runs a **Reconcile** phase confirming the blueprint kept every frame *feasible, accurate, and representative*.
5. **Gate (mandatory).** Show the user the blueprint plus the synthesis's flagged risks, open questions, and the **wireframe reconcile verdict**: 'fix-blueprint' drift you fold in yourself; **'revise-frame' drift means a wireframe revision round + re-approval before building** — the contract must be true, not just approved once. **Wait for their approval/feedback.** Fold their answers in before building. This is the one place the human steers — never skip it. **If the target repo defines a `review-subagents` skill, run it over the BLUEPRINT first** (plan-time: the repo's own reviewers decide what they care about — pattern congruence, design/UX taste; hand it the wireframe showcase path when one exists) and fold its blockers into the blueprint before the gate.
6. **Branch + upstream, then Phase 2 — build-from-blueprint.** First put the repo on a **dedicated feature branch** (create one off HEAD if you're on the default branch) and give it an `origin` upstream (`git push -u origin HEAD`) so the build can checkpoint to the remote. Then, on the user's go, invoke the workflow with `{ blueprintPath, repoPath, envPrefix, buildCmd?, testCmd?, constraints, wireframesDir? }` — with a wireframe contract, the Live phase judges every surface as a **structural match to its frame** (a surface that renders but contradicts a frame is a defect). It spikes risky deps, builds the foundation and adversarially verifies the crown-jewel before fanning out, builds modules in disjoint-file waves (each adversarially verified + fix-looped), loops to green, then — **if the project has a UI** — runs the **Live phase**: serves the app, agent-browser **screenshots** every surface, and a **vision agent confirms it actually *renders*** (not just compiles), fix-looping visual defects a green suite cannot catch; then a dedicated **Simplify wave** (an apex agent APPLIES load-bearing simplifications directly — gate-protected, crown-jewel-barred — so the final reviews see the final shape); then the adversarial security + correctness review + triage, with a **bounded delta re-review loop**: whenever triage lands fixes, all three lenses (security, correctness, simplify) re-review just the fixes' diff, until a clean round (max 2 extra rounds). (For the Live phase to fire, the blueprint/plan must yield an `fe_verify` recipe — how to serve the app + the surfaces to screenshot. If the build's plan didn't produce one, pass it via `constraints`.) The build **commits + pushes a WIP checkpoint to the branch at every barrier** (foundation, each wave, green, simplify, each review-fix round, final) so an OOM/crash never loses hours of work — on by default; pass `checkpoint: false` to disable or `checkpointRemote` to push somewhere other than `origin`.
7. **Verify on disk yourself.** Do **not** trust the workflow's self-report — re-run the build/tests yourself and confirm green. **For any UI, "verify" means running the app and LOOKING at it** (agent-browser screenshots at a mobile viewport first, then desktop) — a green suite, a clean type-check, and a perfect a11y tree all pass on a page whose content is *invisible*. Drive the real surfaces and confirm they render; fix what doesn't. Then report with the diff, what was built, and **honest caveats** (deferred items, anything not fully sealed). The branch is already checkpointed to `origin` throughout the build; commit + push anything *you* changed during your own verification. **If the target repo defines a `review-subagents` skill, run it over the final diff** before you report — hand it the Live-phase screenshots too, so a repo-defined design/UX reviewer has pixels to judge; fold blockers first. Then offer to **open a PR** — opening a PR / merging is still the user's call.

## Invoking the bundled workflows

The two workflow scripts are bundled **inside this skill's own directory**, under `workflows/`, so they travel with the skill however it's installed. Invoke them via the Workflow tool's `scriptPath`, resolving this skill's directory (`${CLAUDE_SKILL_DIR}` when your harness exposes it):

```
Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/plan-to-blueprint.js",
           args: { planPath, repoPath, stack, scope, constraints, wireframesDir?, models? } })

Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/build-from-blueprint.js",
           args: { blueprintPath, repoPath, envPrefix, wireframesDir?, models? } })   // envPrefix carries shell setup, e.g. PATH

`models` ({ grunt?, heavy?, apex? }) pins every spawned agent to a tier — grunt (mechanical: research readers, checkpoints; default 'sonnet'), heavy (judgment: synthesis, foundation, build/verify, integrate, triage, and the live-frontend judge+fixer — which delegates its token-heavy browser mechanics to a sonnet subagent it spawns while keeping all visual judgment itself; default inherit), or apex (the highest-stakes calls: decompose, subsystem design, crown-jewel foundation verify, the simplification wave — which applies load-bearing simplifications directly, since simplification is what keeps a codebase from growing without bound — and the final review lenses; defaults to heavy so it's pure opt-in). No review ever runs below heavy. Orchestrating from a pricier main-loop model? Pass `models: { heavy: 'opus' }`. Want a frontier model on just planning + reviews? Pass `models: { apex: 'fable' }`.
```

If `${CLAUDE_SKILL_DIR}` isn't available, resolve this installed skill's absolute path (e.g. `~/.claude/skills/double-shot/workflows/…`), or copy the two `.js` files into `~/.claude/workflows/` and invoke by name: `Workflow({ name: "plan-to-blueprint", args: {…} })`. Each workflow runs in the background and returns one structured result; you'll be notified on completion.

## Operating principles (don't skip these)

- **You orchestrate; you don't do the work.** All building + checking goes into the workflows. Your job: understand, align, gate, read each result, decide the next phase. Keep your context pristine.
- **Never trust a single agent.** The workflows verify every build with a fresh adversarial agent — let them. When you re-check, do it *independently* (re-run on disk), not by re-reading the report.
- **Look for a repo-defined `review-subagents` skill.** A project injects its own reviewers there — pattern congruence AND design/UX taste (a repo wanting a harsh design reviewer defines it inside review-subagents, told to run on everything except pure backend). If present, run it at **three** moments — the wireframe showcase (before each human round), the plan gate (over the blueprint), and build-end (over the diff + Live screenshots) — framing: "the repo's own reviewers decide what they care about; this is not a general code/security review." Hand it the UX artifacts when they exist. Blockers fold in before you proceed. Absent → skip silently.
- **UX first: the wireframe is the earliest gate.** For anything with a user-visible surface, the experience gets aligned and approved (stories + frames on disk) *before* the system is designed; the blueprint must then be reconciled against it (feasible, accurate, representative) and the Live phase verifies the built app against it. The contract lives on disk, so it survives sessions — and the iteration loop runs through context-lean subagents, never in your own context.
- **The gates are mandatory** — the wireframe gate (when UI-bearing) and the blueprint gate. The build phase then runs beginning-to-end without gates.
- **No babysitting.** Workflows run in the background and notify on completion — don't poll. Parallelize freely.
- **Run on a dedicated branch; checkpoint to origin throughout.** Never build on the default branch. Put the work on its own feature branch with an `origin` upstream *before* invoking Phase 2; the build then commits + pushes a WIP checkpoint at every barrier so a memory-leak/OOM/crash mid-run can't vaporize hours of work. This work both **matters and is captured.** Pushing WIP checkpoints is **not** opening a PR and **not** merging — those still need the user's explicit go.
- **Spike risky deps first; verify the foundation before fanning out; keep heavy/optional pieces feature-gated** so the default build stays fast. (Baked into the workflows — honor them when you read results.)
- **Green ≠ renders. For any UI, verification is visual + live.** A compiler, a type-check, an a11y tree, and a passing unit suite ALL pass on an invisible/broken page (a stuck animation, a duplicate-dependency context split, an unstyled or empty surface). The Live phase exists to catch exactly this — serve the app, screenshot every surface, have a vision agent confirm it *renders*, fix-loop. Never report FE "done" on tsc/green alone; never let the workflow do so either.
- **In an autonomous / overnight run, finish IN-WINDOW.** When the user has delegated a long unattended build, the quiet window is exactly when to land the polish: run the live visual verification AND fix the low-risk review findings before handing back — don't defer them to a "review session." Deferring low-risk, well-specified cleanups defeats the point of an overnight delegation. (The branch is already check-pointing to origin throughout the build; opening a PR / merging still needs the user's "go".)

## When NOT to use

A quick feature, a bug fix, or a task without a substantial plan doc — just do it directly or with a single agent. Double-shot is for taking a *real design* all the way to a built product; it spawns many agents and is not free. For an *already-aligned, bounded* change landing in a green repo, reach for the lighter **`americano`** instead — same two-phase shape, less ceremony.
