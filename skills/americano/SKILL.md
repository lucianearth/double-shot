---
name: americano
description: >-
  A watered-down double-shot — take an ALREADY-ALIGNED, BOUNDED change to a built, green,
  reviewed result without the full ceremony. Two phases with a clean-context handoff: a BOUNDED
  plan→blueprint (targeted research, one design pass per dimension, one adversarial critique),
  then a TRIMMED build (no greenfield scaffold/foundation phase — confirm the repo is green,
  build the blueprint's waves, loop to green, adversarial review). Use when you and the user
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
   PHASE 1 — americano-plan   (bounded research + design + 1 critique → <feature>-plan-v1.md)
        │
[you: show the user the outline + the critique's must-fixes + flagged judgment calls]   ← FEEDBACK GATE (mandatory)
        │   ← the user may CLEAR CONTEXT here; the doc is the whole hand-off
   PHASE 2 — americano-build  (green baseline → build waves → loop to green → review)   ← on a feature branch, checkpointed to origin throughout
        │
[you: verify on disk yourself, then report]
```

## Procedure

1. **Confirm Americano fits.** Design roughly settled + bounded + lands in a green repo → Americano. Greenfield / new-foundation / max-rigor → double-shot. Trivial → just do it.
2. **Scope Phase 1 inline.** From the conversation + a quick repo skim, derive the **researchTargets** (subsystems a build must get right — confirm-not-explore), the **designDimensions** (one per orthogonal piece), the **invariants** the design must not violate, and the **outDoc** (`docs/<feature>-plan-v1.md`). This inline scouting is what keeps Phase 1 light — don't make the workflow rediscover the design.
3. **Phase 1 — americano-plan.** Invoke the bundled workflow (see *Invoking*) with those args. It writes the build-ready blueprint and returns the outline + must-fix list + flagged judgment calls.
4. **Gate (mandatory).** Show the user the outline + the critique's **must-fixes** + any judgment calls. Separate the mechanical must-fixes (already folded into the doc) from genuine human decisions. Fold their answers into the doc. The user may clear context after this — the doc stands alone. **If the target repo defines a `review-subagents` skill, run it over the plan doc first** (a design-pattern congruence check, not a general review) and fold its blockers before the gate.
5. **Branch + upstream, then Phase 2 — americano-build.** Ensure you're on a feature branch (NOT the default) with an `origin` upstream (`git push -u origin HEAD`) so the build can checkpoint to the remote. Invoke the build workflow on the doc. It confirms the repo is green at HEAD, builds the waves (each adversarially verified + bounded-fix-looped), loops to green via the repo's own gate, then runs the adversarial review + triage — **committing + pushing a WIP checkpoint to the branch at every barrier** (each wave, green, final) so a crash/OOM mid-run never loses work. (On by default; `checkpoint: false` disables, `checkpointRemote` overrides `origin`.)
6. **Verify on disk yourself.** Don't trust the self-report — re-run the gate, confirm green, report with the diff + honest caveats. The branch is already checkpointed to `origin`; commit + push anything *you* fixed during verification. **If the target repo defines a `review-subagents` skill, run it over the final diff** before reporting — fold blockers first. Then offer to **open a PR** (still the user's call).

## Invoking the workflows

Both are bundled in this skill (`workflows/`). Resolve this skill's dir (`${CLAUDE_SKILL_DIR}` when the harness exposes it, else this installed skill's path under `~/.claude/plugins/.../skills/americano`):

```
Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/americano-plan.js",
           args: { feature, repoPath, outDoc, invariants,
                   researchTargets: [{ label, prompt }, …],
                   designDimensions: [{ label, prompt, uses?: [researchIdx] }, …],
                   styleRef? } })            // styleRef: an existing plan doc to match in voice/shape

Workflow({ scriptPath: "${CLAUDE_SKILL_DIR}/workflows/americano-build.js",
           args: { blueprintPath: outDoc, repoPath, gateCmd?, envPrefix?, constraints? } })
```

`gateCmd` is the repo's own green gate (e.g. `./scripts/green.sh`, `make test`, `npm test`); the build auto-detects from the blueprint if omitted. Each workflow runs in the background and returns one structured result; you're notified on completion.

## Operating principles

- **You orchestrate; the workflows do the work.** Scout, scope args, gate, read results — keep your context clean.
- **The bound is your inline scouting.** Phase 1 stays light because YOU front-load the targets/dimensions/invariants from the already-aligned design.
- **Green-in, green-out.** americano-build assumes the repo is green at HEAD and refuses to build on red — fix the baseline first.
- **Dedicated branch; checkpoint to origin throughout.** Never build on the default branch. Branch + set an `origin` upstream before Phase 2; the build commits + pushes a WIP checkpoint at every barrier so a crash/OOM can't lose work. Checkpoints are WIP only — opening a PR / merging still needs the user's go.
- **The gate is mandatory; the build runs gateless.** One human steer, after the blueprint.
- **Look for a repo-defined `review-subagents` skill.** If present, run it at the plan gate (over the doc) and at build-end (over the diff), telling it it's a *pattern-congruence* review, not a general code/security review. Blockers fold in first. Absent → skip.
- **Clean-context handoff is a feature.** The blueprint must stand alone so the user can clear context and build fresh.
- **Know when to escalate.** Bounded got big? Switch to double-shot mid-stream.

## When NOT to use

- Greenfield / new-foundation / max-rigor → **double-shot**.
- A red repo at HEAD → fix the baseline first; Americano builds green→green.
- A trivial fix → just do it.
- No design alignment yet → have the planning conversation first; Americano banks an existing alignment, it doesn't replace it.
