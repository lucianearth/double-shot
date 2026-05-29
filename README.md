<p align="center">
  <img src="assets/double-shot.png" alt="double-shot" width="640">
</p>

<h1 align="center">double-shot</h1>

<p align="center"><em>From a plan/design doc to a built, tested, reviewed product — two phases, one feedback gate between.</em></p>

---

**double-shot** is a Claude Code plugin for taking a substantial plan/design document all the way to a built, green, reviewed codebase — without the orchestrating agent doing the heavy lifting by hand. The human and the main agent stay in the loop to *understand, align, and gate*; two background **workflows** do the parallel building and adversarially verify their own work.

## Status

**v0.1 — patterns proven, packaged scripts not yet re-validated.** The *approach* here is battle-tested: it built a ~24k-line dual-backend product end-to-end and caught real bugs (a credential-forgery hole, a chain-corrupting timestamp bug, two audience-leak paths) via adversarial review. But the two bundled workflows were **extracted and generalized from those runs** — `build-from-blueprint` in particular consolidates several project-specific workflows into one parameterized script that hasn't itself been run end-to-end yet. **Dogfood it on a small throwaway project before relying on it.**

## The two phases

```
[ understand the plan + align with you ]          ← conversation
            │
   PHASE 1 ─ plan-to-blueprint     research the toolchain, design the hard
            │                       subsystems → a concrete BLUEPRINT.md
            ▼
[ review the blueprint ]                          ← your feedback gate
            │
   PHASE 2 ─ build-from-blueprint  scaffold → build modules in waves (each
            │                       adversarially verified) → loop to green
            ▼                       → security / correctness / simplification review
[ verify on disk + report ]                       ← back to you
```

The **feedback gate between the two phases** is the point: you steer once, at the blueprint, then the build runs beginning-to-end on its own.

## What's inside

| Path | What |
|---|---|
| `skills/double-shot/SKILL.md` | The orchestration procedure the main agent follows (understand → align → phase 1 → gate → phase 2 → verify → report). The front door (`/double-shot`). |
| `workflows/plan-to-blueprint.js` | **Phase 1** — fan-out research + design → `BLUEPRINT.md`. |
| `workflows/build-from-blueprint.js` | **Phase 2** — derive the module DAG, build the foundation + verify the crown-jewel, build modules in disjoint-file waves, loop to green, adversarial review + triage. |

The skill is the brain; the workflows are the hands.

## Install

```bash
# from a local clone (for testing)
claude plugin marketplace add /path/to/double-shot
claude plugin install double-shot@double-shot

# the skill is then available as a slash command
/double-shot
```

> **Note on the workflows:** Claude Code plugins don't yet have a documented mechanism to auto-register Workflow scripts, so the skill invokes the bundled `workflows/*.js` by path. For `Workflow({ name: … })` invocation (and to surface them as their own `/`-commands), also copy them into your user workflows dir:
> ```bash
> cp workflows/*.js ~/.claude/workflows/
> ```

## Usage

Point it at a plan doc:

> `/double-shot` — then: *"Take `design/my-plan.md` to a built product."*

Or just describe it: *"build the whole thing from `PLAN.md`."* The agent reads the plan, aligns with you on the open decisions (stack, scope, deployment), produces the blueprint, **stops and shows it to you**, then — on your go — builds it to green and reports with the diff.

## Lessons baked in

These came from real runs that built ~24k lines of verified code:

- **Verify the foundation before fanning out.** A builder once shipped a credential-forgery hole that only a *fresh adversarial verifier* caught.
- **The review catches what green tests miss.** A chain-corrupting timestamp bug and two audience-leak paths survived a 276-test green suite until the adversarial review found them.
- **Spike risky dependencies first.** A "dead" embedded-DB extension turned out obtainable and buildable — but only a throwaway probe proved it before committing the port.
- **Keep heavy/optional pieces feature-gated** so the default build and CI stay fast.

## License

FSL-1.1-MIT — see the plugin manifest.
