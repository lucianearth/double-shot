---
name: double-shot
description: >-
  Use when the user wants to take a substantial plan or design document all the way to a
  built, tested, reviewed product in one orchestrated push — phrasings like "one-shot this",
  "double-shot it", "build the whole thing from this plan", "ship this design / blueprint".
  Runs a two-phase orchestration — plan→blueprint (with a mandatory human feedback gate),
  then blueprint→build-to-green + adversarial review — using the bundled `plan-to-blueprint`
  and `build-from-blueprint` workflows. The main agent orchestrates; the workflows do the
  building. NOT for quick features or bug fixes.
---

# Double Shot

`double-shot` takes a substantial plan/design doc all the way to a built, tested, reviewed product, in **two phases with one human feedback gate between**.

You are the **orchestrator**: you understand the plan, align with the user, and run the two phases — but the building is done by two background **workflows**. Your context stays clean and you never do the heavy work yourself.

## The two phases (and the gate)

```
[you: understand the plan + repo, align with the user]     ← conversation
        │
   PHASE 1 — plan-to-blueprint    (research + design → BLUEPRINT.md)
        │
[you: show the user the blueprint + flagged risks]         ← FEEDBACK GATE (mandatory)
        │
   PHASE 2 — build-from-blueprint (scaffold → build modules → green → review)
        │
[you: verify on disk yourself, then report]                ← back to the user
```

## Procedure

1. **Understand first.** Read the plan doc in full yourself; skim the repo. Reflect the goal back to the user so they know you've got it. Do **not** start building.
2. **Align on the forks the plan doesn't settle** — language/stack, scope, deployment target, anything genuinely the user's call. Ask (AskUserQuestion); don't guess. These become the workflow args.
3. **Phase 1 — plan-to-blueprint.** Invoke the workflow (see *Invoking* below) with `{ planPath, repoPath, stack, scope, constraints }`. It researches the toolchain, designs the hard subsystems, and writes a `BLUEPRINT.md`.
4. **Gate (mandatory).** Show the user the blueprint plus the synthesis's flagged risks and open questions. **Wait for their approval/feedback.** Fold their answers in before building. This is the one place the human steers — never skip it.
5. **Phase 2 — build-from-blueprint.** On the user's go, invoke the workflow with `{ blueprintPath, repoPath, envPrefix, buildCmd?, testCmd?, constraints }`. It spikes risky deps, builds the foundation and adversarially verifies the crown-jewel before fanning out, builds modules in disjoint-file waves (each adversarially verified + fix-looped), loops to green, then runs the adversarial security/correctness/simplification review + triage.
6. **Verify on disk yourself.** Do **not** trust the workflow's self-report — re-run the build/tests yourself and confirm green. Then report with the diff, what was built, and **honest caveats** (deferred items, anything not fully sealed). Offer to commit (branch first if on the default branch).

## Invoking the bundled workflows

The two workflows ship with this plugin in `workflows/` (a sibling of this skill's directory). Prefer the bundled copies so it's self-contained — resolve the plugin root from this skill's location (`${CLAUDE_PLUGIN_ROOT}` if available) and pass an absolute path:

```
Workflow({ scriptPath: "<plugin-root>/workflows/plan-to-blueprint.js",
           args: { planPath, repoPath, stack, scope, constraints } })

Workflow({ scriptPath: "<plugin-root>/workflows/build-from-blueprint.js",
           args: { blueprintPath, repoPath, envPrefix } })   // envPrefix carries shell setup, e.g. PATH
```

If the user has also copied the two `.js` files into `~/.claude/workflows/`, you can invoke by name instead: `Workflow({ name: "plan-to-blueprint", args: {…} })` (this also surfaces them as `/`-commands). Each workflow runs in the background and returns one structured result; you'll be notified on completion.

## Operating principles (don't skip these)

- **You orchestrate; you don't do the work.** All building + checking goes into the workflows. Your job: understand, align, gate, read each result, decide the next phase. Keep your context pristine.
- **Never trust a single agent.** The workflows verify every build with a fresh adversarial agent — let them. When you re-check, do it *independently* (re-run on disk), not by re-reading the report.
- **The gate is mandatory** — one human feedback gate, after the blueprint. The build phase then runs beginning-to-end without gates.
- **No babysitting.** Workflows run in the background and notify on completion — don't poll. Parallelize freely.
- **Spike risky deps first; verify the foundation before fanning out; keep heavy/optional pieces feature-gated** so the default build stays fast. (Baked into the workflows — honor them when you read results.)

## When NOT to use

A quick feature, a bug fix, or a task without a substantial plan doc — just do it directly or with a single agent. Double-shot is for taking a *real design* all the way to a built product; it spawns many agents and is not free.
