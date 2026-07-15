---
name: americano
description: >-
  A watered-down double-shot — take an ALREADY-ALIGNED, BOUNDED change to a built, green,
  reviewed result without the full ceremony. Two phases with a clean-context handoff: a BOUNDED
  plan→blueprint (targeted research, one design pass per dimension, one adversarial critique),
  then a TRIMMED build (no greenfield scaffold/foundation phase — confirm the repo is green,
  build the blueprint's waves, loop to green, adversarial review). A change that touches a
  user-facing surface first passes the WIREFRAME GATE (bundled `wireframe` skill, scoped to
  the touched surfaces). Use when you and the user
  already hashed out the design and the change doesn't warrant double-shot's heavy up-front pass
  — phrasings like "americano this", "lite double-shot", "wrap this up and build it". Use full
  `double-shot` instead when the change is greenfield, introduces a new foundation, or is
  big/risky enough to deserve maximal rigor. For a trivial fix, just do it — use neither.
---

# Americano

A **watered-down double-shot**. Same two-phase shape — plan→blueprint, then build — but both phases are *bounded*, because Americano assumes two things double-shot doesn't:

1. **The design is already aligned** (you hashed it out with the user) → the planning phase *confirms + specifies*; it does not run a cold N-way design tournament.
2. **The change lands in an already-green repo and is bounded** → the build phase *skips the greenfield scaffold/foundation ceremony* and goes straight to building the blueprint's waves.

You are the **orchestrator**. The two workflows do the work; your context stays clean.

## Americano vs double-shot (the steering)

| | double-shot | americano |
|---|---|---|
| Use when | greenfield · new foundation · big/risky · needs max rigor (the heavy pass is worth it) | design already aligned · bounded change to a green repo · the full ceremony is overkill |
| Phase 1 | full `plan-to-blueprint` (design tournament, loop-until-dry, multi-round critique) | **bounded** `americano-plan` (targeted research, one design pass/dim, one critique) |
| Phase 2 | `build-from-blueprint` (scaffold skeleton + freeze contracts + crown-jewel verify, then waves) | **trimmed** `americano-build` (confirm green baseline — no scaffold — then waves) |

The axis is **how much rigor the change warrants**, NOT brownfield-vs-greenfield: double-shot is worth its heavy pass on big/risky changes *even in a mature repo*. If midway you realize the change is bigger than it looked (a real new foundation, lots of new shared contracts), **stop and switch to double-shot** — the trimmed build's lack of a scaffold/freeze step is only safe for bounded changes.

## The two phases (and the gate)

```
[you + user: hash out the design in conversation]            ← already happened
        │
[you + user: WIREFRAME GATE — only if the change touches a user-facing surface, scoped to the touched surfaces]
        │
   PHASE 1 — americano-plan   (bounded research + design + 1 critique → <feature>-plan-v1.md → reconcile vs wireframes)
        │
[you: show the user the outline + the critique's must-fixes + flagged judgment calls]   ← FEEDBACK GATE (mandatory)
        │   ← the user may CLEAR CONTEXT here; the doc is the whole hand-off
   PHASE 2 — americano-build  (green baseline → build waves → loop to green → simplify wave → review + delta re-review)   ← on a feature branch, checkpointed to origin throughout
        │
[you: verify on disk yourself, then report]
```

## Procedure

1. **Confirm Americano fits.** Design roughly settled + bounded + lands in a green repo → Americano. Greenfield / new-foundation / max-rigor → double-shot. Trivial → just do it.
2. **Wireframe gate (only if the change touches a user-facing surface).** Almost any change is experienced by someone — UX comes first. Look for an approved wireframe set covering the touched surfaces (`docs/wireframes/`, possibly from an earlier session — the contract is on disk); absent, run the **`wireframe` skill** scoped to the touched surfaces (even a one-frame change gets its stories) and iterate to the user's approval, subagent-driven per the skill's context-lean protocol. If the repo defines `review-subagents`, run it over the showcase before each human round. Pure backend with no user-visible impact → skip silently.
3. **Scope Phase 1 inline.** From the conversation + a quick repo skim, derive the **researchTargets** (subsystems a build must get right — confirm-not-explore), the **designDimensions** (one per orthogonal piece), the **invariants** the design must not violate, and the **outDoc** (`docs/<feature>-plan-v1.md`). This inline scouting is what keeps Phase 1 light — don't make the workflow rediscover the design.
4. **Phase 1 — americano-plan.** Invoke the bundled workflow (see *Invoking*) with those args (plus `wireframesDir` when the gate ran). It writes the build-ready blueprint and returns the outline + must-fix list + flagged judgment calls — and, with a wireframe contract, a **Reconcile** verdict confirming the doc kept every frame *feasible, accurate, and representative*.
5. **Gate (mandatory).** Show the user the outline + the critique's **must-fixes** + any judgment calls + the **wireframe reconcile verdict** ('fix-blueprint' drift you fold in yourself; **'revise-frame' drift means a wireframe revision round + re-approval before building**). Separate the mechanical must-fixes (already folded into the doc) from genuine human decisions. Fold their answers into the doc. The user may clear context after this — the doc stands alone. **If the target repo defines a `review-subagents` skill, run it over the plan doc first** (the repo's own reviewers decide what they care about — pattern congruence, design/UX taste; hand it the showcase path when one exists) and fold its blockers before the gate.
6. **Branch + upstream, then Phase 2 — americano-build.** With a wireframe contract, pass it via `constraints` (e.g. "the approved wireframes at docs/wireframes/ are the UX contract — surfaces must structurally match their frames"). Ensure you're on a feature branch (NOT the default) with an `origin` upstream (`git push -u origin HEAD`) so the build can checkpoint to the remote. Invoke the build workflow on the doc. It confirms the repo is green at HEAD, builds the waves (each adversarially verified + bounded-fix-looped), loops to green via the repo's own gate, then runs a dedicated **Simplify wave** (an apex agent APPLIES load-bearing simplifications directly — gate-protected, invariant-barred) followed by the adversarial security + correctness review of the final shape + triage, with a **bounded delta re-review loop** (whenever triage lands fixes, all three lenses re-review just the fixes' diff, until a clean round; max 2 extra rounds) — **committing + pushing a WIP checkpoint to the branch at every barrier** (each wave, green, simplify, each review-fix round, final) so a crash/OOM mid-run never loses work. (On by default; `checkpoint: false` disables, `checkpointRemote` overrides `origin`.)
7. **Verify on disk yourself.** Don't trust the self-report — re-run the gate, confirm green, report with the diff + honest caveats. **If the change touched a UI, your run-it-and-LOOK verification judges each surface against its wireframe frame** (structural match — americano-build has no Live phase, so this check is yours). The branch is already checkpointed to `origin`; commit + push anything *you* fixed during verification. **If the target repo defines a `review-subagents` skill, run it over the final diff** — hand it your verification screenshots too, so a repo-defined design/UX reviewer has pixels to judge; fold blockers first. Then offer to **open a PR** (still the user's call).

## Invoking the workflows

Both are bundled in this skill (`workflows/`). Resolve this skill's dir (`${CLAUDE_SKILL_DIR}` when the harness exposes it, else this installed skill's path under `~/.claude/plugins/.../skills/americano`):

```
Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/americano-plan.js",
           args: { feature, repoPath, outDoc, invariants,
                   researchTargets: [{ label, prompt }, …],
                   designDimensions: [{ label, prompt, uses?: [researchIdx] }, …],
                   styleRef?,                // styleRef: an existing plan doc to match in voice/shape
                   wireframesDir?,           // approved wireframe set (stories.md + frames + decisions.md) = the UX contract; adds a Reconcile phase
                   models? } })              // models: { grunt?, heavy?, apex? } — see below

Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/americano-build.js",
           args: { blueprintPath: outDoc, repoPath, gateCmd?, envPrefix?, constraints?, models? } })
```

`gateCmd` is the repo's own green gate (e.g. `./scripts/green.sh`, `make test`, `npm test`); the build auto-detects from the blueprint if omitted. `models` pins every spawned agent to one of three tiers so a fan-out never silently inherits an expensive main-loop model: `grunt` (mechanical stages — research readers, baseline gate, checkpoints; default `'sonnet'`), `heavy` (judgment stages — synthesis, plan, build, verify, integrate, triage; default inherit), and `apex` (the highest-stakes calls — design, the adversarial critique, the simplification wave — which applies load-bearing simplifications directly, since simplification is what keeps a codebase from growing without bound — and the final review lenses; defaults to heavy so it's pure opt-in). No review ever runs below heavy. Orchestrating from a pricier main-loop model? Pass `models: { heavy: 'opus' }`. Want a frontier model on just planning + reviews? Pass `models: { apex: 'fable' }`. Each workflow runs in the background and returns one structured result; you're notified on completion.

## Operating principles

- **You orchestrate; the workflows do the work.** Scout, scope args, gate, read results — keep your context clean.
- **The bound is your inline scouting.** Phase 1 stays light because YOU front-load the targets/dimensions/invariants from the already-aligned design.
- **Green-in, green-out.** americano-build assumes the repo is green at HEAD and refuses to build on red — fix the baseline first.
- **Dedicated branch; checkpoint to origin throughout.** Never build on the default branch. Branch + set an `origin` upstream before Phase 2; the build commits + pushes a WIP checkpoint at every barrier so a crash/OOM can't lose work. Checkpoints are WIP only — opening a PR / merging still needs the user's go.
- **The gates are mandatory; the build runs gateless.** The wireframe gate (when a surface is touched) and the blueprint gate — then no human steers until build-end.
- **UX first, even for bounded changes.** A change someone experiences gets its stories + frames approved before the plan phase, the plan is reconciled against them (feasible, accurate, representative — 'revise-frame' drift goes back to the human), and your build-end verification judges surfaces against frames. The contract is on disk; iteration runs through context-lean subagents.
- **Look for a repo-defined `review-subagents` skill.** The repo's own reviewers live there — pattern congruence AND design/UX taste (a design reviewer inside it should run on everything except pure backend). If present, run it at the wireframe showcase (before each human round), the plan gate (over the doc), and build-end (over the diff + your verification screenshots), framing: "the repo's own reviewers decide what they care about." Blockers fold in first. Absent → skip.
- **Clean-context handoff is a feature.** The blueprint must stand alone so the user can clear context and build fresh.
- **Know when to escalate.** Bounded got big? Switch to double-shot mid-stream.

## When NOT to use

- Greenfield / new-foundation / max-rigor → **double-shot**.
- A red repo at HEAD → fix the baseline first; Americano builds green→green.
- A trivial fix → just do it.
- No design alignment yet → have the planning conversation first; Americano banks an existing alignment, it doesn't replace it.
