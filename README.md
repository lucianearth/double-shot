<p align="center">
  <img src="assets/double-shot.png" alt="double-shot" width="320">
</p>

<h1 align="center">double-shot</h1>

<p align="center"><em>Like one-shot, but better.</em></p>

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
| `skills/double-shot/workflows/plan-to-blueprint.js` | **Phase 1** — fan-out research + design → `BLUEPRINT.md`. |
| `skills/double-shot/workflows/build-from-blueprint.js` | **Phase 2** — derive the module DAG, build the foundation + verify the crown-jewel, build modules in disjoint-file waves, loop to green, adversarial review + triage. |

The skill is the brain; the workflows are the hands.

## Install

As a Claude Code plugin, straight from GitHub:

```
/plugin marketplace add lucianHymer/double-shot
/plugin install double-shot@double-shot
```

Then use it with `/double-shot`. The two workflow scripts live inside the skill directory, so they install with it.

<details><summary>Alternatives</summary>

```bash
# add the marketplace from a local clone instead of GitHub:
claude plugin marketplace add /path/to/double-shot
claude plugin install double-shot@double-shot

# or install just the skill via the cross-agent installer (vercel-labs/skills):
npx skills add lucianHymer/double-shot
```
</details>

> The skill invokes its two bundled workflows by `scriptPath` from inside the installed skill directory (`~/.claude/skills/double-shot/workflows/`). To also get `Workflow({ name: … })` / standalone `/`-command access, copy them to your user workflows dir:
> ```bash
> cp ~/.claude/skills/double-shot/workflows/*.js ~/.claude/workflows/
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

Functional Source License, Version 1.1, with an MIT future license — converting
to MIT three years after publication. See [LICENSE](LICENSE).
