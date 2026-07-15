<p align="center">
  <img src="assets/double-shot.png" alt="double-shot" width="320">
</p>

<h1 align="center">double-shot</h1>

<p align="center"><em>Like one-shotting, but better.</em></p>

---

**double-shot** is a plugin for **Claude Code** that takes a plan document all
the way to a built, tested, reviewed codebase. You write the plan and steer once
at the blueprint; two background Claude Code workflows do the parallel building
and adversarially verify their own work.

It works for any stack, but shines when your plan has a **checkable invariant** —
a core property the build can mechanically prove it didn't break. **Rust is a
great fit:** its type system can make the invariant *structural*, so a violation
becomes a compile error and the adversarial verifier gets an objective answer.

## Install

A Claude Code plugin, straight from GitHub:

```
/plugin marketplace add lucianearth/double-shot
/plugin install double-shot@double-shot
```

## Use it

1. **Write a detailed plan** as a markdown file — with Claude Code, Claude
   Desktop, or however you like. The more concrete the better.

2. **In Claude Code, point double-shot at it:**

   > *Use double-shot to implement `plan_xyz.md`*

That's it. The agent reads your plan, aligns with you on the open decisions,
produces a blueprint and **stops to show you**, then — on your go — builds it
to green and reports back with the diff.

## Americano — the watered-down double-shot

Installing the plugin also gives you **`americano`** (`/americano`) — the same
two-phase shape, watered down for an *already-aligned, bounded* change landing in
a *green* repo, where double-shot's full up-front pass (research tournament,
scaffold + crown-jewel verify) is overkill. Its build skips the greenfield
scaffold and goes straight to the waves.

Reach for **double-shot** on greenfield / new-foundation / max-rigor work; reach
for **americano** when the design's already settled and the change is bounded.
The axis is *how much rigor the change warrants* — double-shot is great in mature
repos too.

## Wireframe — align on the UX before anything gets built

The plugin also ships **`wireframe`** (`/wireframe`) — a UX-first gate that both
double-shot and americano run automatically whenever the work touches a
user-facing surface, and that you can run standalone:

> *Let's just do the wireframe part for `plan_xyz.md`*

It writes **UX-forward user stories** (beats of the experience, not test cases),
wireframes them with a constrained **low-fi HTML kit** (grayscale by
construction — you argue about structure, never colors), lints taste
mechanically (word budgets, one primary action, and story↔frame traceability —
a story no frame serves *fails*, which catches the missing search bar before
anything is built), and iterates a one-page showcase with you until **you**
approve. The approved set (`stories.md` + frames + `decisions.md`) lives on
disk as the UX contract: the blueprint is reconciled against it, and the build's
live visual check judges every surface against its frame.

Its **user-story method** is also the house style for stories in general: stories
are *beats of the experience* — what the user sees, reaches, and feels — never
correctness cases (the build pipeline owns correctness). Even in a pure
pre-planning conversation, "let's write the user stories" should think this way.

## Model tiers — put your best model where it counts

Every agent the workflows spawn is pinned to one of three args-overridable
tiers, so a fan-out never silently inherits an expensive main-loop model:

- **`grunt`** — mechanical stages (research readers, baseline gate, checkpoints).
  Default `'sonnet'`.
- **`heavy`** — judgment stages (build, verify, fix, integrate, triage).
  Default: inherit the session model.
- **`apex`** — the few highest-stakes calls: decompose, design, the adversarial
  critique, the simplification wave, the final review lenses, the wireframe
  reconcile. Defaults to heavy, so it's pure opt-in.

**If you have a frontier model available, pass it as apex** — today that means
Fable; adapt to whatever the smartest model is when you read this:

```
models: { apex: 'fable' }              // frontier judgment on planning + reviews only
models: { heavy: 'opus', apex: 'fable' }   // and/or keep the fan-out off a pricey main-loop model
```

No review ever runs below heavy.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
