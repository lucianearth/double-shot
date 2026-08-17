export const meta = {
  name: 'build-from-blueprint',
  description: 'Autonomously build a project from a BLUEPRINT.md to green: derive the module DAG, scaffold + verify the foundation (crown-jewel adversarially checked), build modules in dependency waves (each adversarially verified + fix-looped), loop tests to green, then a simplification wave (applied directly, gate-protected) + adversarial review of the final shape with a bounded delta re-review loop. Generalized from real, proven build runs.',
  whenToUse: 'After plan-to-blueprint (or any concrete buildable blueprint with an ordered module/build plan). Pairs with the One-Shot Playbook: the main loop gates the blueprint with the user; THIS workflow is the gate-free build engine.',
  phases: [
    { title: 'Plan', detail: 'read blueprint -> module DAG/waves, build+test cmds, crown-jewel, risky deps; spike risky deps' },
    { title: 'Foundation', detail: 'scaffold + shared contracts + Wave-0 module; adversarially verify the crown-jewel invariant' },
    { title: 'Modules', detail: 'waves of disjoint modules: impl -> adversarial verify -> bounded fix loop' },
    { title: 'Green', detail: 'integrate; loop build+test until fully green' },
    { title: 'Live', detail: 'IF the project has a UI: serve it live + agent-browser SCREENSHOT every surface; a vision agent confirms it actually RENDERS (green != renders); fix-loop visual defects; re-green' },
    { title: 'Simplify', detail: 'dedicated judge-tier pass that APPLIES load-bearing simplifications across the built project (build+test-protected, crown-jewel-barred) so the final reviews see the final shape' },
    { title: 'Review', detail: 'adversarial security + correctness on the post-simplify code -> triage + fix high-sev -> bounded delta re-review loop (all three lenses) until a clean round' },
    { title: 'Checkpoint', detail: 'commit + push WIP to the feature branch at every barrier so an OOM/crash never loses work (no PR, no merge)' },
  ],
}

// args: { blueprintPath (required), repoPath?, buildCmd?, testCmd?, envPrefix?, constraints?, wireframesDir?, checkpoint?, checkpointRemote? }
// Some harnesses deliver `args` as a JSON string rather than a parsed object; normalize either way.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const blueprintPath = A.blueprintPath
const repoPath = A.repoPath || '.'
const envPrefix = A.envPrefix || ''          // e.g. 'export PATH="$HOME/.cargo/bin:$PATH";'
const buildCmdHint = A.buildCmd || 'auto-detect from the blueprint/repo'
const testCmdHint = A.testCmd || 'auto-detect from the blueprint/repo'
const constraints = A.constraints || 'none beyond the blueprint'
const CKPT = A.checkpoint !== false                 // WIP checkpointing default ON; pass checkpoint:false to disable
const CKPT_REMOTE = A.checkpointRemote || 'origin'  // remote to push WIP checkpoints to
const wireframesDir = A.wireframesDir || ''         // approved wireframe set = the UX contract the Live phase verifies against
// Model + effort are PRESCRIPTIVE — hardcoded per call, nothing inherits the session (change
// here, in code). BUILD ('sonnet') at effort 'high' writes the code: spikes, foundation, parts,
// integrate, every fix loop, the green rounds, triage+fix (its findings arrive from judge
// reviewers with severity + suggested fix, and the judge delta re-review checks its work next
// round); checkpoints run BUILD at 'medium' (mechanical git work). JUDGE ('fable') designs and
// reviews: plan-build at effort 'high' (once per run, and the module split is the biggest
// cost/correctness lever — its mistakes propagate everywhere); at 'medium', the in-loop checks:
// crown-jewel foundation verify, every module verify, the live-FE judge
// (which delegates its token-heavy browser mechanics to a sonnet subagent it spawns, keeping
// visual judgment to itself), the simplification wave — which APPLIES load-bearing
// simplifications, not just reports them — and the final adversarial review lenses. A judge
// call that dies falls back to opus via agentRetry, never lower.
const BUILD = 'sonnet'
const JUDGE = 'fable'
if (!blueprintPath) throw new Error('args.blueprintPath is required (absolute path to the blueprint)')

// Retry an agent() that returns null — a terminal error after the harness's own retries. A
// fable-pinned call retries ONCE on fable (a transient capacity blip recovers there), and only
// THEN falls back to opus — that covers the won't-do-it case (e.g. a security-review lens
// getting flagged), which retrying on fable can't fix. Non-fable calls retry on their own
// model. So opus only ever appears as the last-resort fallback on judge calls, never on
// implementation. Use for judgment calls where a dropped agent = lost coverage.
async function agentRetry(prompt, opts, tries = 2) {
  let r = await agent(prompt, opts)
  for (let i = 1; r == null && i <= tries; i++) {
    const m = opts && opts.model
    const toOpus = i > 1 && typeof m === 'string' && m.toLowerCase().includes('fable')
    const model = toOpus ? 'opus' : m
    const label = (opts && opts.label) ? `${opts.label}:retry${i}${toOpus ? '-opus' : ''}` : undefined
    log(`agent "${(opts && opts.label) || 'unlabeled'}" returned null — retry ${i}/${tries}${toOpus ? ' on opus (fable fallback)' : ''}`)
    r = await agent(prompt, { ...opts, model, label })
  }
  return r
}

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    build_cmd: { type: 'string' },
    test_cmd: { type: 'string' },
    env_prefix: { type: 'string', description: 'Shell prefix needed before build/test cmds (PATH etc.), or empty string.' },
    foundation: { type: 'string', description: 'The Wave-0 scaffold + shared-contract module(s) to build first and freeze.' },
    crown_jewel: { type: 'string', description: 'The security-critical / core-invariant component to verify hardest, AND the exact invariant to assert.' },
    risky_deps: { type: 'array', items: { type: 'string' }, description: 'External deps/toolchain needing an up-front spike/bake-off before building (or empty).' },
    waves: {
      type: 'array', description: 'Ordered build waves (barrier between waves). DEFAULT TO SERIAL: prefer fewer, coarser steps — typically ONE module per wave — because most projects are a near-linear dependency chain. Put MULTIPLE modules in one wave (they run in parallel) ONLY when they are genuinely independent (disjoint files, no compile-time dependency on each other) AND each is substantial enough that a dedicated, focused agent context is worth more than the coordination + shared build-lock overhead. Fan-out buys CONTEXT ISOLATION, not wall-clock (a single-crate build shares one target-dir lock, so concurrent builds mostly serialize anyway). AIM FOR 6-10 MODULES TOTAL, HARD MAX 12: a module is the CORRECTNESS unit — one thing you would want independently proven correct, describable to a reviewer in one sentence — and if the blueprint names its own phases/stages, use THOSE as the modules. Every module pays a fixed orientation + adversarial-verify + fix-loop tax that does NOT shrink when the module does, so 30 small modules cost several times what 10 coherent ones cost for the same code. Do NOT split a module to make files disjoint (that is what its `steps` are for) and do NOT map one blueprint work-item to one module (items are `steps[].parts`; a module holding a dozen is normal). A module being large is fine — its parts absorb the volume.',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          wave: { type: 'integer' },
          modules: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                name: { type: 'string' },
                path_globs: { type: 'string' },
                blueprint_secs: { type: 'string' },
                acceptance: { type: 'string', description: 'Machine-checkable acceptance for the MODULE AS A WHOLE — this is what the adversarial verifier checks.' },
                steps: {
                  type: 'array',
                  description: 'The module\'s work split into ORDERED steps. Parts within one step run in PARALLEL and so MUST own disjoint files; steps run in sequence, so a later step may build on an earlier one. Split generously — each part gets its own FRESH agent context, and that is the main lever on build cost (one agent implementing ten items carries all ten items\' context for the whole module; ten agents do not). When two items collide on a file, put them in consecutive steps rather than merging them into one part. A step holding a single part is fine.',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      parts: {
                        type: 'array',
                        items: {
                          type: 'object', additionalProperties: false,
                          properties: {
                            id: { type: 'string', description: 'The blueprint work-item id, or a short slug if the blueprint does not number them.' },
                            spec: { type: 'string', description: 'What this one part must implement, and its own acceptance criterion.' },
                            paths: { type: 'string', description: 'The files this part owns. Must be disjoint from every other part in the SAME step.' },
                          },
                          required: ['id', 'spec', 'paths'],
                        },
                      },
                    },
                    required: ['parts'],
                  },
                },
              },
              required: ['name', 'path_globs', 'blueprint_secs', 'acceptance', 'steps'],
            },
          },
        },
        required: ['wave', 'modules'],
      },
    },
    fe_verify: {
      type: 'object', additionalProperties: false,
      description: 'PRESENT IFF the project has a user-facing UI: how to run it LIVE + the surfaces to screenshot-verify. OMIT entirely for a non-UI project (the Live phase is then skipped).',
      properties: {
        serve_cmd: { type: 'string', description: 'Command that starts the app live (a dev server / preview), backgroundable.' },
        backend: { type: 'string', description: 'How to bring up any backend / seed the data the UI needs to render real surfaces (or empty if none).' },
        ready_check: { type: 'string', description: 'How to know it is up: a URL that 200s, a log line, a listening port.' },
        base_url: { type: 'string', description: 'The base URL the served app is reachable at (e.g. http://localhost:3000).' },
        routes: { type: 'array', description: 'The surfaces to open + screenshot + VISUALLY verify.', items: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' }, expect: { type: 'string', description: 'What MUST be visible + correctly styled here (so the vision agent has a concrete target).' } }, required: ['path', 'expect'] } },
        flows: { type: 'array', items: { type: 'string' }, description: 'Key interactive flows to drive + screenshot (or empty).' },
      },
      required: ['serve_cmd', 'ready_check', 'base_url', 'routes'],
    },
  },
  required: ['build_cmd', 'test_cmd', 'env_prefix', 'foundation', 'crown_jewel', 'risky_deps', 'waves'],
}
const STATUS = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, build_test_tail: { type: 'string' }, deviations: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'build_test_tail', 'deviations'] }
const VERDICT = { type: 'object', additionalProperties: false, properties: { pass: { type: 'boolean' }, blocking_issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['pass', 'blocking_issues', 'notes'] }
const GREEN = { type: 'object', additionalProperties: false, properties: { green: { type: 'boolean' }, summary: { type: 'string' }, remaining_failures: { type: 'array', items: { type: 'string' } } }, required: ['green', 'summary', 'remaining_failures'] }
const FINDINGS = { type: 'object', additionalProperties: false, properties: { dimension: { type: 'string' }, findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { severity: { type: 'string' }, title: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' }, suggested_fix: { type: 'string' } }, required: ['severity', 'title', 'location', 'detail', 'suggested_fix'] } }, summary: { type: 'string' } }, required: ['dimension', 'findings', 'summary'] }
const FE_VERDICT = { type: 'object', additionalProperties: false, properties: { ran_live: { type: 'boolean' }, surfaces: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { route: { type: 'string' }, renders_correctly: { type: 'boolean' }, screenshot_path: { type: 'string' }, defects: { type: 'array', items: { type: 'string' } } }, required: ['route', 'renders_correctly', 'screenshot_path', 'defects'] } }, fixes_applied: { type: 'array', items: { type: 'string' } }, stayed_green: { type: 'boolean' }, notes: { type: 'string' } }, required: ['ran_live', 'surfaces', 'fixes_applied', 'stayed_green', 'notes'] }

phase('Plan')
const plan = await agentRetry(
  `Read the blueprint at ${blueprintPath} IN FULL (repo: ${repoPath}). Produce a concrete build plan: the build command + test command (hints: build=${buildCmdHint}, test=${testCmdHint}; env-prefix hint: ${JSON.stringify(envPrefix)}); the foundation (scaffold + shared contracts / Wave-0 module to build and FREEZE first); the crown-jewel (the security-critical or core-invariant component to verify hardest, plus the exact invariant); any risky external deps/toolchain that need an up-front spike before building; and the ordered build WAVES. DEFAULT TO SERIAL — most projects are a near-linear dependency chain, so prefer fewer, coarser modules built one at a time (a single agent can implement several small, related files in sequence). Split a wave into PARALLEL modules ONLY when they are genuinely independent (disjoint files, no compile-time dependency between them in that wave) AND each is large/self-contained enough that giving it its own focused agent context beats one agent doing them in sequence — here parallelism buys context isolation more than wall-clock (e.g. a single-crate build shares one target-dir lock, so concurrent builds mostly serialize). For each module give owned path-globs, the blueprint sections it implements, and machine-checkable acceptance criteria; modules sharing a wave MUST own disjoint files. THEN SPLIT EACH MODULE INTO ORDERED \`steps\` OF \`parts\` — two levels, and getting the split right is the single biggest lever on what this build costs: a MODULE is the CORRECTNESS unit (6-10 of them, hard max 12; if the blueprint names its phases, use those), while its PARTS are the WORK unit (the individual blueprint work-items, each implemented by its own fresh short-lived agent). Parts in one step run in parallel and must own disjoint files; steps run in order. File collisions inside a module are resolved by ORDERING PARTS INTO STEPS, never by creating more modules, and one work-item is a part, never a module. ALSO: if the project has a USER-FACING UI, produce \`fe_verify\` — how to serve it LIVE (serve_cmd + any backend/seed bring-up + a ready_check), the base_url, the routes/surfaces to screenshot-verify (each with what MUST be visible), and key flows — so a live VISUAL check can run (compile-green never proves a page actually renders). OMIT \`fe_verify\` for a non-UI project.${wireframesDir ? ` An APPROVED wireframe set lives at ${wireframesDir} — derive each route's "expect" from its frame file (name the frame in the expect): the expectation is a STRUCTURAL match to the frame (same hierarchy, same primary action), never a pixel match.` : ''} Constraints: ${constraints}. Return structured.`,
  { label: 'plan-build', phase: 'Plan', agentType: 'general-purpose', model: JUDGE, effort: 'high', schema: PLAN_SCHEMA })

const ENV = plan.env_prefix || envPrefix
const B = plan.build_cmd, T = plan.test_cmd

// Surface the plan's SHAPE before spending anything on it — module count is the dominant cost,
// and it is knowable here, minutes into a run that may last all night.
const ALL_MODULES = (plan.waves || []).flatMap((w) => w.modules || [])
const ALL_PARTS = ALL_MODULES.reduce((n, m) => n + (m.steps || []).reduce((k, s) => k + ((s.parts || []).length), 0), 0)
log(`Plan: ${ALL_MODULES.length} modules over ${(plan.waves || []).length} waves, ${ALL_PARTS} parts. Modules are the dominant cost — 6-10 is the target; over 12 means the blueprint got split too fine.`)

// --- WIP checkpointing: commit + push to a feature branch at safe barriers, so an OOM/crash mid-build never loses work ---
const CKPT_SCHEMA = { type: 'object', additionalProperties: false, properties: { committed: { type: 'boolean' }, pushed: { type: 'boolean' }, branch: { type: 'string' }, note: { type: 'string' } }, required: ['committed', 'pushed', 'branch', 'note'] }
async function checkpoint(stage) {
  if (!CKPT) return null
  try {
    return await agent(
      `WIP CHECKPOINT so an OOM/crash can't lose the work in progress. In repo ${repoPath}:\n` +
      `1. Confirm you are on a NON-default feature branch. ONLY if you are on the default branch (main/master), create + switch to a feature branch named for this build FIRST — never commit build WIP onto the default branch.\n` +
      `2. \`git add -A\`, then commit: "checkpoint(${stage}): <one-line summary of progress so far>". If nothing is staged, skip the commit.\n` +
      `3. Push to ${CKPT_REMOTE}, setting upstream on first push: \`git push -u ${CKPT_REMOTE} HEAD\`.\n` +
      `This is a safety checkpoint ONLY: do NOT open a PR, do NOT merge, do NOT touch the default branch. If ${CKPT_REMOTE} is missing or unreachable, still commit locally and report pushed=false with the reason — NEVER fail, block, or revert the build because of a git error.${ENV ? (' Shell prefix: ' + ENV) : ''} Report what you committed and whether you pushed.`,
      { label: `checkpoint:${stage}`, phase: 'Checkpoint', agentType: 'general-purpose', model: BUILD, effort: 'medium', schema: CKPT_SCHEMA })
  } catch (e) {
    log(`Checkpoint(${stage}) errored (non-fatal): ${e && e.message ? e.message : e}`)
    return null
  }
}

if (plan.risky_deps && plan.risky_deps.length) {
  await parallel(plan.risky_deps.map((d) => () => agent(
    `Up-front SPIKE to de-risk "${d}" before any real build (per ${blueprintPath}). Actually try it — build a throwaway probe, hit the real API/toolchain in THIS environment; do NOT decide from memory. Report whether it works here, the exact working recipe, and any blocker + the fallback the blueprint names. ${ENV ? ('Shell prefix: ' + ENV) : ''}`,
    { label: `spike:${d}`, phase: 'Plan', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })))
}

phase('Foundation')
let foundation = await agent(
  `Scaffold the project and build the FOUNDATION per ${blueprintPath}: ${plan.foundation}. Create the workspace/skeleton + ALL module stubs + the shared contracts so the dependency graph compiles and later modules only fill in their OWN files (never the shared manifest/contracts). Then fully implement the foundation/shared-contract module. Run \`${ENV} ${B}\` (must compile) + the foundation's tests; fix until green. Repo: ${repoPath}.`,
  { label: 'foundation', phase: 'Foundation', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })
let fverdict = await agentRetry(
  `Adversarially verify the foundation — especially the CROWN JEWEL: ${plan.crown_jewel}. Try to BREAK the stated invariant: write throwaway code that SHOULD be impossible — in a typed/compiled language, code that MUST FAIL TO COMPILE (confirm it does); otherwise, an input or sequence that MUST BE REJECTED at runtime (confirm it is, via a test). Run \`${ENV} ${T}\` for the foundation. Return pass=false with specifics if the invariant can be violated or the foundation is incomplete.`,
  { label: 'verify:foundation', phase: 'Foundation', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: VERDICT })
if (fverdict && !fverdict.pass) {
  foundation = await agent(`Fix the foundation; close every issue: ${JSON.stringify(fverdict.blocking_issues)}. Per ${blueprintPath}. Re-run \`${ENV} ${B} && ${T}\`. Report.`, { label: 'fix:foundation', phase: 'Foundation', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })
}
await checkpoint('foundation')

// A module is built by a fan-out of PARTS, then one INTEGRATOR, then the unchanged adversarial
// verify + bounded fix loop. Why the split:
//   • Context. One agent implementing every item in a module carries every item's tool output
//     for the module's whole life, re-reading all of it each turn — so a long module agent costs
//     quadratically in its own turn count. A fresh agent per part resets that.
//   • The test command is a SHARED, SERIALIZING resource (one database/fixture set, one build
//     lock). Parts running it concurrently corrupt each other, so parts may only compile
//     (`build_cmd`) and the integrator alone runs the tests.
// Foundation already froze the shared contracts, so parts code against a stable interface.
// The module stays the correctness unit: verify still judges the whole thing, once.
async function buildModule(m) {
  const steps = (m.steps || []).filter((s) => s && s.parts && s.parts.length)
  const landed = []
  for (let i = 0; i < steps.length; i++) {
    const prior = landed.length ? `\n\nALREADY LANDED in this module by earlier steps — build on it, never redo or revert it:\n${landed.map((x) => '  - ' + x).join('\n')}` : ''
    const done = await parallel(steps[i].parts.map((p) => () => agent(
      `Implement ONE PART of module "${m.name}" per ${blueprintPath} ${m.blueprint_secs}. Repo: ${repoPath}.\n\nYOUR PART — ${p.id}: ${p.spec}\nYOU OWN ONLY: ${p.paths}. Other parts are being implemented in parallel right now and own the other files; touching a file you do not own will be overwritten and will break them. The shared contracts are frozen — build against them, never edit them.\n\nThe module as a whole is aiming at: ${m.acceptance}. You are responsible for YOUR part of that, not all of it.${prior}\n\nDO NOT run \`${T}\` or any test suite, and do not start/stop/reset any database, container, or other shared service — a sibling part is using them right now and a concurrent run corrupts both. You MAY run \`${ENV} ${B}\` to confirm it compiles. An integrator runs the tests after this step and fixes cross-part breakage.\n\nNever stub or delete tests to pass. Report what you changed, precisely enough that the integrator can wire it up.`,
      { label: `part:${m.name}/${p.id}`, phase: 'Modules', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })
      .then((r) => `${p.id}: ${(r && r.summary) || 'no report returned'}`)))
    landed.push(...done.filter(Boolean))
  }
  let impl = await agent(
    steps.length
      ? `INTEGRATE module "${m.name}" in ${repoPath}. Its parts were just implemented by separate agents that each saw only their own slice and were forbidden from running tests, so the module has never been built and tested as a whole.\n\nWhat they report landing:\n${landed.map((x) => '  - ' + x).join('\n')}\n\nRun \`${ENV} ${B}\` then \`${ENV} ${T}\` and drive the module to green. Fix CROSS-PART breakage — wiring, imports/exports, trait/interface and signature mismatches, a missing call site, duplicated or conflicting edits, forgotten registrations. Do NOT re-litigate a part's design choices, and do NOT rewrite work that is merely unfamiliar; if a part looks wrong rather than unwired, note it as a deviation and let the verifier judge it. Acceptance for the whole module: ${m.acceptance}. Per ${blueprintPath} ${m.blueprint_secs}. The shared contracts are frozen. Never stub/delete tests to pass.`
      : `Implement module "${m.name}" per ${blueprintPath} ${m.blueprint_secs}. It owns ONLY these paths: ${m.path_globs} — do not touch other modules' files. Acceptance: ${m.acceptance}. The shared contracts are frozen — build against them. Run \`${ENV} ${B}\` and the module's tests; fix until green. Never stub/delete tests to pass.`,
    { label: steps.length ? `integrate:${m.name}` : `build:${m.name}`, phase: 'Modules', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })
  let v = await agentRetry(
    `Adversarially verify module "${m.name}" vs ${blueprintPath} ${m.blueprint_secs} and acceptance: ${m.acceptance}. Hunt for incompleteness, bugs, unsafety, blueprint divergence, and trivially-passing tests. Run \`${ENV} ${T}\` for it. pass=false with concrete issues if wrong.`,
    { label: `verify:${m.name}`, phase: 'Modules', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: VERDICT })
  let r = 0
  while (v && !v.pass && r < 2) {
    r++
    impl = await agent(`Fix module "${m.name}": ${JSON.stringify(v.blocking_issues)}. Per ${blueprintPath} ${m.blueprint_secs}. Re-run build+test. Report.`, { label: `fix:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: STATUS })
    v = await agentRetry(`Re-verify "${m.name}" (same adversarial protocol). Run \`${ENV} ${T}\`. Verdict.`, { label: `reverify:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: VERDICT })
  }
  return { module: m.name, ok: impl && impl.ok, passed: v && v.pass }
}

phase('Modules')
const built = []
for (const w of (plan.waves || [])) {               // waves are ordered (barrier between); modules within a wave run in parallel on disjoint files
  const r = await parallel((w.modules || []).map((m) => () => buildModule(m)))
  built.push(...r.filter(Boolean))
  await checkpoint('wave-' + w.wave)                // the barrier between waves is the safe point to commit + push
}

phase('Green')
let integ = null, green = false, round = 0
while (!green && round < 4) {
  round++
  integ = await agent(
    `Integration round ${round}: run \`${ENV} ${B}\` then \`${ENV} ${T}\` across the whole project. Fix any CROSS-MODULE failures (wiring, trait/interface mismatches, deps, features) per ${blueprintPath}. NEVER weaken the crown-jewel invariant or delete/ignore tests to go green — fix the real cause. Report green=true ONLY if build + tests are fully green; list remaining failures.`,
    { label: `integrate#${round}`, phase: 'Green', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: GREEN })
  green = integ.green
}
await checkpoint('green')

phase('Live')
let live = null
if (plan.fe_verify && plan.fe_verify.routes && plan.fe_verify.routes.length) {
  const fe = plan.fe_verify
  live = await agentRetry(
    `LIVE FRONT-END VERIFICATION. The unit gate (\`${ENV} ${T}\`) is GREEN — but GREEN != RENDERS CORRECTLY. A type-checked, a11y-perfect, fully-tested page can still be VISUALLY BROKEN at runtime: invisible content (a stuck animation / opacity:0, a duplicate-dependency context split), an unstyled / overlapping / off-screen surface, an error boundary, or an empty state where content should be. NONE of that is catchable by a compiler, a type-check, an a11y tree, or a unit test — the ONLY way is to RUN the app and LOOK at the pixels. Do exactly that; never infer "it renders" from the code.\nTOKEN BALANCE: browser-driving is mechanical and token-heavy — delegate the MECHANICS of steps 1-3 (stack bring-up, agent-browser install, opening routes, capturing screenshots to files at both viewports) to a cheaper subagent via YOUR OWN Agent tool with model 'sonnet', having it return the screenshot file paths. Judgment is NOT delegable: YOU read every screenshot yourself, YOU decide whether it renders, YOU root-cause and fix. Never accept the subagent's opinion of whether a page renders.\n1. Bring up the live stack: \`${ENV} ${fe.serve_cmd}\` in the BACKGROUND${fe.backend ? ('; also bring up the backend / seed the data it needs: ' + fe.backend) : ''}; wait until it is up (${fe.ready_check}).\n2. Ensure agent-browser is available (it drives real Chrome + returns SCREENSHOTS; install it per the repo's front-end guide if missing). If it genuinely cannot be installed, set ran_live=false and say so — do NOT fake this step.\n3. For EACH route in ${JSON.stringify(fe.routes)} (and each flow in ${JSON.stringify(fe.flows || [])}): set a MOBILE viewport FIRST, agent-browser open \`${fe.base_url}<path>\`, take a SCREENSHOT to a file, and READ that screenshot image yourself — you are vision-capable. Judge it against ${blueprintPath} + the route's "expect": is the primary content actually VISIBLE and styled? anything invisible / transparent / zero-height / overlapping / unstyled / off-screen / errored / wrongly-empty? Then repeat at a desktop viewport.\n4. For EVERY visual defect: find the ROOT CAUSE (a runtime / CSS / bundling / dependency-context bug, NOT a test) and FIX it in the app code; rebuild + RE-SCREENSHOT to confirm it now renders. Loop until every listed surface renders correctly.\n5. Re-run \`${ENV} ${T}\` — it MUST stay GREEN after your fixes (never weaken a test to pass).\nRepo: ${repoPath}. Report per-surface renders_correctly + the screenshot_path you actually inspected + defects; the fixes applied; and stayed_green. NEVER mark a surface verified without a screenshot you personally looked at.${wireframesDir ? `\nUX CONTRACT: the approved wireframes at ${wireframesDir} are binding — judge each surface as a STRUCTURAL match to its frame (hierarchy, placement, the one primary action; read the frame HTML, it is small). A surface that renders fine but CONTRADICTS its frame is a DEFECT to fix, same as an invisible one. Do not explore ${wireframesDir} beyond the frames + stories.md.` : ''}`,
    { label: 'live-fe-verify', phase: 'Live', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: FE_VERDICT })
} else {
  log('Live: no fe_verify recipe in the plan (no UI surfaces to verify) — skipping the live screenshot review.')
}

phase('Simplify')
const SIMPLIFY = { type: 'object', additionalProperties: false, properties: { applied: { type: 'array', items: { type: 'string' } }, skipped: { type: 'array', items: { type: 'string' } }, green: { type: 'boolean' }, summary: { type: 'string' } }, required: ['applied', 'skipped', 'green', 'summary'] }
const simplified = await agentRetry(
  `SIMPLIFICATION WAVE — the pass that keeps this codebase from growing without bound; be hardcore AND surgical. Review the project just built under ${repoPath} (vs ${blueprintPath}) for duplication, dead code, needless indirection, wrong-altitude abstraction, and inconsistent error handling — then APPLY the load-bearing simplifications directly; do not just report them. Rules: never touch the crown jewel (${plan.crown_jewel}) or its tests; never change external behavior; skip anything you judge risky and record why. After applying, run \`${ENV} ${B}\` then \`${ENV} ${T}\` — both MUST be fully green (never delete/weaken a test to get there; revert your own edit instead).`,
  { label: 'simplify-wave', phase: 'Simplify', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: SIMPLIFY })
await checkpoint('simplify')

phase('Review')
// The final reviews see the FINAL (post-Live, post-simplify) shape. Whenever triage lands fixes, every
// lens — simplify included — re-reviews the DELTA those fixes introduced: a bounded fixpoint, not a full re-read.
const secLens = { k: 'security', p: `ADVERSARIAL SECURITY REVIEW. Focus on the crown jewel (${plan.crown_jewel}) and every trust/authz boundary. Try to get past it; scrutinize error paths, logs, and counts for leaks. Try to write a test that breaches it.` }
const corLens = { k: 'correctness', p: `ADVERSARIAL CORRECTNESS REVIEW of the core algorithms/invariants. Try to construct inputs/sequences that violate an invariant. Are the existing tests real or vacuous (do they actually reach the failure region)?` }
const simLens = { k: 'simplify', p: `SIMPLIFICATION REVIEW (NOT a bug hunt): duplication, dead code, needless indirection, wrong-altitude abstraction, inconsistent error handling. Rate a finding high severity ONLY when the simplification is genuinely load-bearing for maintainability (it WILL be applied). Nothing that touches the crown-jewel or its tests.` }
const allF = []
let triage = null, lastRoundFixed = false, reviewRound = 0
let lenses = [secLens, corLens]              // the simplify lens already ran as its own wave; it rejoins on delta rounds
let scope = `the code under ${repoPath} vs ${blueprintPath} (the simplification wave already ran — this is the final shape)`
while (reviewRound < 3) {                    // 1 full round + up to 2 delta re-review rounds
  reviewRound++
  const reviews = await parallel(lenses.map((d) => () => agentRetry(
    `${d.p}\nReview ${scope}. Run \`${ENV} ${T}\` if useful. Report findings with severity + location + suggested_fix.`,
    { label: `review:${d.k}#${reviewRound}`, phase: 'Review', agentType: 'general-purpose', model: JUDGE, effort: 'medium', schema: FINDINGS })))
  const roundF = reviews.filter(Boolean).flatMap((r) => (r.findings || []).map((f) => ({ ...f, dimension: r.dimension, round: reviewRound })))
  allF.push(...roundF)
  const mustFix = roundF.filter((f) => f.severity === 'critical' || f.severity === 'high')
  if (!mustFix.length) { lastRoundFixed = false; break }   // fixpoint: a round with no new high-sev findings ends the review
  triage = await agent(
    `Triage + fix the confirmed high-severity findings: CONFIRM each is real first (reproduce/inspect); fix real ones minimally per ${blueprintPath}; reject false positives with reasons. High-severity SIMPLIFICATION findings are first-class — apply them (the test gate protects you), never touching the crown-jewel or its tests. Then run \`${ENV} ${T}\` — must be GREEN; never delete a test to pass. Do NOT apply medium/low findings unless trivially safe.\nFindings:\n${mustFix.map((f, i) => `${i + 1}. [${f.severity}/${f.dimension}] ${f.title} @ ${f.location}: ${f.detail} | fix: ${f.suggested_fix}`).join('\n')}`,
    { label: `triage+fix#${reviewRound}`, phase: 'Review', agentType: 'general-purpose', model: BUILD, effort: 'high', schema: GREEN })
  lastRoundFixed = true
  await checkpoint('review-fixes-' + reviewRound)  // safety, plus a clean git boundary so the next round can see exactly the delta
  lenses = [secLens, corLens, simLens]       // the fixes changed the code — every lens re-checks, but only the delta
  scope = `ONLY the DELTA from the round-${reviewRound} triage fixes in ${repoPath} (the latest checkpoint(review-fixes-${reviewRound}) commit — or \`git diff\` if checkpointing is off; the fixed findings were at: ${mustFix.map((f) => f.location).join('; ')}). The rest of the project was already reviewed — do not re-litigate it`
}
if (lastRoundFixed) log('Review: round cap reached with fixes still landing — the last triage fixes are gate-protected but not re-reviewed.')

const finalCkpt = await checkpoint('final')        // capture Live + Review fixes on the branch (still no PR / merge)

// @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
return {
  build_cmd: B, test_cmd: T,
  foundation_ok: foundation && foundation.ok,
  modules: built,
  integrate_green: green,
  live,
  simplify_wave: simplified,
  review_rounds: reviewRound,
  review_findings: allF,
  must_fix: allF.filter((f) => f.severity === 'critical' || f.severity === 'high').length,
  final_green: triage ? triage.green : (simplified ? simplified.green : green),
  checkpointed: CKPT,
  final_checkpoint: finalCkpt,
}
