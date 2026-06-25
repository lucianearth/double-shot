# double-shot — repo notes

A Claude Code plugin: the `double-shot` and `americano` skills, each with bundled
**Workflow scripts** under `skills/*/workflows/`. The plugin ships **no runtime
dependencies** — the only tooling here is dev-time type-checking of those scripts.

## Type-checking the workflow scripts

The `workflows/*.js` files are plain JavaScript executed by the Workflow runtime,
**not** TypeScript and **not** compiled — there is no build step. We still get full
type-checking + editor autocomplete via:

- `skills/*/workflows/workflow-globals.d.ts` — ambient declarations for the globals
  the Workflow runtime injects (`agent`, `parallel`, `pipeline`, `phase`, `log`,
  `args`, `budget`, `workflow`). Keep this in sync if the Workflow API changes.
- `skills/*/workflows/jsconfig.json` — turns on `checkJs` for that dir, so the editor
  (and `tsc`) check the scripts. Each `workflows/` dir is self-contained so a skill
  type-checks even when extracted on its own.

**Run it** (after a one-time `npm install`):

```
npm run typecheck
```

Do this after editing any workflow script, before committing. Both skill dirs are
checked. CI/pre-commit can run the same command.

### Gotchas (why it's set up this way)

- **No `// @ts-check` directive in the scripts.** That directive only works as the
  file's first line, but the Workflow runtime requires each script to *begin with*
  `export const meta = {…}`. So checking is enabled by `jsconfig.json` (`checkJs`)
  instead — the `.js` files stay byte-identical at the top and runtime-safe.
- **Top-level `return` needs `// @ts-expect-error` above it.** The runtime wraps each
  script body in an async function (so top-level `return`/`await` are legal there),
  but TypeScript checks the file as a module and would flag the `return`. Each such
  line carries a one-line `@ts-expect-error` saying exactly that. If you add a new
  top-level `return`, add the same suppression.
- **Scripts must stay plain JS** — no type annotations, interfaces, or generics in the
  `.js` (the runtime parses them as JavaScript). Types come only from the `.d.ts`.

## Workflow conventions

- Workflow scripts run in the background; `Date.now()` / `Math.random()` / argless
  `new Date()` are unavailable (they'd break resume). Vary by index, or stamp times
  after the workflow returns.
- The build workflows (`build-from-blueprint.js`, `americano-build.js`) **commit + push
  a WIP checkpoint to the feature branch at every barrier** (foundation/each wave/green/
  final) so a crash or OOM mid-build never loses work. On by default; `checkpoint:false`
  disables, `checkpointRemote` overrides `origin`. Checkpoints never open a PR or merge —
  that stays the user's call.
