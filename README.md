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
/plugin marketplace add lucianHymer/double-shot
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

> Dogfooded: `americano-build` took a real, no-merge-invariant-adjacent feature
> to a **505-test green** autonomously, and the adversarial review caught a
> genuine cross-user bug it then fixed.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
