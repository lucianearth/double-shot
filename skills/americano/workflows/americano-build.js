export const meta = {
  name: 'americano-build',
  description: 'Americano build: a TRIMMED build-from-blueprint for a BOUNDED change to an ALREADY-GREEN repo. Confirm green baseline (NO scaffold/foundation phase) -> build the blueprint waves (impl -> adversarial verify -> bounded fix loop) -> loop to green via the repo gate -> simplification wave (applied directly, gate-protected) -> adversarial review of the final shape with a bounded delta re-review loop. For greenfield / new-foundation, use double-shot build-from-blueprint instead.',
  whenToUse: 'After americano-plan, or any bounded blueprint with ordered waves over an EXISTING green codebase. Dilution vs build-from-blueprint: drops the greenfield Foundation/scaffold/freeze + dep-spike up-front pass.',
  phases: [
    { title: 'Plan', detail: 'transcribe the blueprint waves + the green-gate cmd + the invariant to protect (no foundation derivation)' },
    { title: 'Baseline', detail: 'confirm the repo is green at HEAD so any new red is ours; refuse to build on red' },
    { title: 'Modules', detail: 'ordered waves of disjoint work-items: impl -> adversarial verify -> bounded fix loop' },
    { title: 'Green', detail: 'integrate; loop the repo gate until fully green' },
    { title: 'Simplify', detail: 'dedicated apex pass that APPLIES load-bearing simplifications (gate-protected, invariant-barred) so the final reviews see the final shape' },
    { title: 'Review', detail: 'adversarial security + correctness on the post-simplify code -> triage + fix high-sev -> bounded delta re-review loop (all three lenses) until a clean round' },
    { title: 'Checkpoint', detail: 'commit + push WIP to the feature branch at every barrier so an OOM/crash never loses work (no PR, no merge)' },
  ],
}

// args: { blueprintPath (required), repoPath?, gateCmd?, envPrefix?, constraints?, checkpoint?, checkpointRemote? }
// Robust: the harness may hand `args` through as a JSON STRING rather than a parsed object.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const blueprintPath = A.blueprintPath
const repoPath = A.repoPath || '.'
const envPrefix = A.envPrefix || ''                  // e.g. 'export PATH="$HOME/.cargo/bin:$PATH";'
const gateHint = A.gateCmd || 'auto-detect the repo green gate from the blueprint/repo (e.g. ./scripts/green.sh, make test, npm test)'
const constraints = A.constraints || 'none beyond the blueprint'
const CKPT = A.checkpoint !== false                  // WIP checkpointing default ON; pass checkpoint:false to disable
const CKPT_REMOTE = A.checkpointRemote || 'origin'   // remote to push WIP checkpoints to
// Model tiers — every agent() call is pinned to one of three tiers so a fan-out never silently inherits
// an expensive main-loop model. `grunt` covers mechanical stages (baseline gate, checkpoints); `heavy`
// covers judgment stages (plan, build, verify, fix, integrate, triage); `apex` covers the simplification
// wave (it APPLIES load-bearing simplifications, not just reports them — simplification is what keeps a
// codebase from growing without bound; it takes the smartest model, not the cheapest) and the final
// adversarial review lenses (security, correctness, and simplify on delta rounds). NO review ever runs
// below heavy. Defaults: grunt='sonnet'; heavy=undefined (inherit the session model — set
// models:{heavy:'opus'} when orchestrating from a pricier main-loop model); apex=falls back to heavy,
// pure opt-in — set models:{apex:'fable'} to upgrade just the final reviews.
const M = A.models || {}                 // { grunt?: string, heavy?: string, apex?: string }
const GRUNT = ('grunt' in M) ? M.grunt : 'sonnet'
const HEAVY = M.heavy
const APEX = ('apex' in M) ? M.apex : HEAVY
if (!blueprintPath) throw new Error('args.blueprintPath is required (absolute path to the blueprint)')

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    gate_cmd: { type: 'string', description: 'The single command that builds AND tests the repo to green (the existing green gate).' },
    check_cmd: { type: 'string', description: 'The CHEAP, SAFE subset of the gate a part-agent may run while writing code: compile/typecheck only, touching NO database, container, or shared service (e.g. `cargo check`, `tsc --noEmit`, the gate\'s own --check-only flag). Parts run this; only the integrator runs the full gate. Empty string if the repo has no such command — then parts run nothing.' },
    env_prefix: { type: 'string', description: 'Shell prefix needed before the gate (PATH etc.), or empty string.' },
    invariant_to_protect: { type: 'string', description: 'The existing load-bearing invariant this change must NOT break (the crown jewel to verify hardest), AND how to assert it.' },
    waves: {
      type: 'array',
      description: 'Ordered build waves (barrier between waves); modules within a wave run in parallel. A MODULE is the CORRECTNESS unit — one thing you would want independently proven correct, describable to a reviewer in one sentence. AIM FOR 6-10 MODULES TOTAL, HARD MAX 12. If the blueprint names its own phases/stages, use THOSE as the modules — that decomposition is almost always the right one. NEVER split a phase into more modules to make files disjoint (that is what a module\'s `steps` are for), and NEVER map one blueprint work-item to one module (items are `steps[].parts`; a module holding a dozen items is normal and good). Module count is the dominant cost of a build: every module pays a fixed orientation + adversarial-verify + fix-loop tax that does NOT shrink when the module does, so 30 small modules cost several times what 10 coherent ones cost for the same code.',
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
                  description: 'The module\'s work split into ORDERED steps. Parts within one step run in PARALLEL and so MUST own disjoint files; steps run in sequence, so a later step may build on an earlier one. Split generously — each part gets its own FRESH agent context, and that is the main lever on build cost (one agent implementing ten items accumulates all ten items\' context; ten agents do not). When two items collide on a file, put them in consecutive steps rather than merging them into one part. A step holding a single part is fine.',
                  items: {
                    type: 'object', additionalProperties: false,
                    properties: {
                      parts: {
                        type: 'array',
                        items: {
                          type: 'object', additionalProperties: false,
                          properties: {
                            id: { type: 'string', description: 'The blueprint work-item id (e.g. W3.2), or a short slug if the blueprint does not number them.' },
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
  },
  required: ['gate_cmd', 'check_cmd', 'env_prefix', 'invariant_to_protect', 'waves'],
}
const STATUS = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, gate_tail: { type: 'string' }, deviations: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'gate_tail', 'deviations'] }
const VERDICT = { type: 'object', additionalProperties: false, properties: { pass: { type: 'boolean' }, blocking_issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['pass', 'blocking_issues', 'notes'] }
const GREEN = { type: 'object', additionalProperties: false, properties: { green: { type: 'boolean' }, summary: { type: 'string' }, remaining_failures: { type: 'array', items: { type: 'string' } } }, required: ['green', 'summary', 'remaining_failures'] }
const BASE = { type: 'object', additionalProperties: false, properties: { green: { type: 'boolean' }, gate_cmd: { type: 'string' }, summary: { type: 'string' } }, required: ['green', 'gate_cmd', 'summary'] }
const FINDINGS = { type: 'object', additionalProperties: false, properties: { dimension: { type: 'string' }, findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { severity: { type: 'string' }, title: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' }, suggested_fix: { type: 'string' } }, required: ['severity', 'title', 'location', 'detail', 'suggested_fix'] } }, summary: { type: 'string' } }, required: ['dimension', 'findings', 'summary'] }

phase('Plan')
const plan = await agent(
  `Read the blueprint at ${blueprintPath} IN FULL (repo: ${repoPath}). It targets a BOUNDED change to an EXISTING, already-green codebase — there is NO project to scaffold and NO foundation to freeze. Produce: the repo's green-gate command (build+test in one; hint: ${gateHint}; env-prefix hint: ${JSON.stringify(envPrefix)}); the cheap compile-only \`check_cmd\` a part-agent may run safely; the existing INVARIANT this change must not break (the crown jewel + how to assert it); and the ordered build WAVES.\n\nTWO LEVELS, and getting the split right is the single biggest lever on what this build costs:\n• A MODULE is the CORRECTNESS unit — the granularity at which one adversarial verifier asks "is this whole coherent thing right?". Target 6-10, hard max 12. If the blueprint names its own phases, USE THEM AS THE MODULES.\n• A module's STEPS/PARTS are the WORK unit — the blueprint's individual work-items, each implemented by its own fresh short-lived agent. Parts in one step run in parallel and must own disjoint files; steps run in order.\n\nSo file collisions are resolved by ORDERING PARTS INTO STEPS, never by creating more modules. Do NOT map one work-item to one module: a module with a dozen parts is the expected shape. Do NOT invent a scaffold/foundation step. Constraints: ${constraints}. Return structured.`,
  { label: 'plan-build', phase: 'Plan', agentType: 'general-purpose', model: HEAVY, schema: PLAN_SCHEMA })

const ENV = plan.env_prefix || envPrefix
const G = plan.gate_cmd
const CHECK = plan.check_cmd || ''

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
      `1. Confirm you are on a NON-default feature branch. ONLY if you are on the default branch (main/master), create + switch to a feature branch named for this change FIRST — never commit WIP onto the default branch.\n` +
      `2. \`git add -A\`, then commit: "checkpoint(${stage}): <one-line summary of progress so far>". If nothing is staged, skip the commit.\n` +
      `3. Push to ${CKPT_REMOTE}, setting upstream on first push: \`git push -u ${CKPT_REMOTE} HEAD\`.\n` +
      `This is a safety checkpoint ONLY: do NOT open a PR, do NOT merge, do NOT touch the default branch. If ${CKPT_REMOTE} is missing or unreachable, still commit locally and report pushed=false with the reason — NEVER fail, block, or revert the build because of a git error.${ENV ? (' Shell prefix: ' + ENV) : ''} Report what you committed and whether you pushed.`,
      { label: `checkpoint:${stage}`, phase: 'Checkpoint', agentType: 'general-purpose', model: GRUNT, effort: 'low', schema: CKPT_SCHEMA })
  } catch (e) {
    log(`Checkpoint(${stage}) errored (non-fatal): ${e && e.message ? e.message : e}`)
    return null
  }
}

phase('Baseline')
const base = await agent(
  `Confirm the repo at ${repoPath} is GREEN at HEAD before we change anything, so any new red is OURS. Run \`${ENV} ${G}\`. Do NOT modify code. Report green=true ONLY if it passes cleanly; if red, summarize what is already failing.${ENV ? (' Shell prefix: ' + ENV) : ''}`,
  { label: 'baseline-green', phase: 'Baseline', agentType: 'general-purpose', model: GRUNT, schema: BASE })
if (!base.green) {
  log(`Baseline is RED — refusing to build on a red repo. ${base.summary}`)
  // @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
  return { aborted: 'baseline_not_green', gate_cmd: G, baseline: base }
}
log('Baseline green — building the waves.')

// A module is built by a fan-out of PARTS, then one INTEGRATOR, then the unchanged
// adversarial verify + bounded fix loop. Why the split:
//   • Context. One agent implementing every item in a module accumulates every item's tool
//     output for the module's whole life, and each turn re-reads all of it — so a long module
//     agent costs quadratically in its own turn count. A fresh agent per part resets that.
//   • The gate is a SHARED, SERIALIZING resource (one dev database, one build lock). Parts
//     running it concurrently corrupt each other's state, so parts get `check_cmd` (compile
//     only) and the integrator alone owns the real gate.
// The module stays the correctness unit: verify still judges the whole thing, once.
async function buildModule(m) {
  const steps = (m.steps || []).filter((s) => s && s.parts && s.parts.length)
  const landed = []
  for (let i = 0; i < steps.length; i++) {
    const prior = landed.length ? `\n\nALREADY LANDED in this module by earlier steps — build on it, never redo or revert it:\n${landed.map((x) => '  - ' + x).join('\n')}` : ''
    const done = await parallel(steps[i].parts.map((p) => () => agent(
      `Implement ONE PART of module "${m.name}" in the EXISTING repo at ${repoPath}, per ${blueprintPath} ${m.blueprint_secs}.\n\nYOUR PART — ${p.id}: ${p.spec}\nYOU OWN ONLY: ${p.paths}. Other parts are being implemented in parallel right now and own the other files; touching a file you do not own will be overwritten and will break them.\n\nThe module as a whole is aiming at: ${m.acceptance}. You are responsible for YOUR part of that, not all of it.${prior}\n\nDO NOT run \`${G}\` or any test suite, and do not start/stop/reset any database, container, or other shared service — a sibling part is using them right now and a concurrent run corrupts both. ${CHECK ? `You MAY run \`${ENV} ${CHECK}\` to confirm it compiles.` : 'This repo has no safe compile-only command, so run nothing.'} An integrator runs the real gate after this step and fixes cross-part breakage.\n\nNever stub or delete tests to pass; never weaken the protected invariant (${plan.invariant_to_protect}). Report what you changed, precisely enough that the integrator can wire it up.`,
      { label: `part:${m.name}/${p.id}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: STATUS })
      .then((r) => `${p.id}: ${(r && r.summary) || 'no report returned'}`)))
    landed.push(...done.filter(Boolean))
  }
  let impl = await agent(
    steps.length
      ? `INTEGRATE module "${m.name}" in ${repoPath}. Its parts were just implemented by separate agents that each saw only their own slice and were forbidden from running the gate, so the module has never been built or tested as a whole.\n\nWhat they report landing:\n${landed.map((x) => '  - ' + x).join('\n')}\n\nRun \`${ENV} ${G}\` and drive it to green. Fix CROSS-PART breakage — wiring, imports/exports, signature and type mismatches, a missing call site, duplicated or conflicting edits, forgotten registrations. Do NOT re-litigate a part's design choices, and do NOT rewrite work that is merely unfamiliar; if a part looks wrong rather than unwired, note it as a deviation and let the verifier judge it. Acceptance for the whole module: ${m.acceptance}. Per ${blueprintPath} ${m.blueprint_secs}. Never stub/delete tests to pass; never weaken the protected invariant (${plan.invariant_to_protect}).`
      : `Implement work-item "${m.name}" per ${blueprintPath} ${m.blueprint_secs} in the EXISTING repo at ${repoPath}. It owns ONLY these paths: ${m.path_globs} — do not touch other work-items' files. Acceptance: ${m.acceptance}. Build against the existing code/contracts (they already compile). Run \`${ENV} ${G}\` (or the narrowest subset that covers this item) and fix until green for this item. Never stub/delete tests to pass; never weaken the protected invariant (${plan.invariant_to_protect}).`,
    { label: steps.length ? `integrate:${m.name}` : `build:${m.name}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: STATUS })
  let v = await agent(
    `Adversarially verify work-item "${m.name}" vs ${blueprintPath} ${m.blueprint_secs} and acceptance: ${m.acceptance}. Hunt for incompleteness, bugs, unsafety, blueprint divergence, references to nonexistent tables/functions/columns, and trivially-passing tests. Confirm it does NOT weaken the protected invariant (${plan.invariant_to_protect}). pass=false with concrete issues if wrong.`,
    { label: `verify:${m.name}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: VERDICT })
  let r = 0
  while (!v.pass && r < 2) {
    r++
    impl = await agent(`Fix work-item "${m.name}": ${JSON.stringify(v.blocking_issues)}. Per ${blueprintPath} ${m.blueprint_secs}. Re-run the gate. Report.`, { label: `fix:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: STATUS })
    v = await agent(`Re-verify "${m.name}" (same adversarial protocol). Verdict.`, { label: `reverify:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: VERDICT })
  }
  return { module: m.name, ok: impl && impl.ok, passed: v && v.pass }
}

phase('Modules')
const built = []
for (const w of (plan.waves || [])) {               // waves are ordered (barrier between); items within a wave run in parallel on disjoint files
  const r = await parallel((w.modules || []).map((m) => () => buildModule(m)))
  built.push(...r.filter(Boolean))
  await checkpoint('wave-' + w.wave)                // the barrier between waves is the safe point to commit + push
}

phase('Green')
let integ = null, green = false, round = 0
while (!green && round < 4) {
  round++
  integ = await agent(
    `Integration round ${round}: run \`${ENV} ${G}\` across the whole repo. Fix any CROSS-ITEM failures (wiring, interface mismatches, deps, migrations) per ${blueprintPath}. NEVER weaken the protected invariant (${plan.invariant_to_protect}) or delete/ignore tests to go green — fix the real cause. Report green=true ONLY if the gate is fully green; list remaining failures.`,
    { label: `integrate#${round}`, phase: 'Green', agentType: 'general-purpose', model: HEAVY, schema: GREEN })
  green = integ.green
}
await checkpoint('green')

phase('Simplify')
const SIMPLIFY = { type: 'object', additionalProperties: false, properties: { applied: { type: 'array', items: { type: 'string' } }, skipped: { type: 'array', items: { type: 'string' } }, green: { type: 'boolean' }, summary: { type: 'string' } }, required: ['applied', 'skipped', 'green', 'summary'] }
const simplified = await agent(
  `SIMPLIFICATION WAVE — the pass that keeps this codebase from growing without bound; be hardcore AND surgical. Review ONLY the change introduced by ${blueprintPath} in ${repoPath} (the diff vs the green baseline) for duplication, dead code, needless indirection, wrong-altitude abstraction, and inconsistent error handling INTRODUCED by the change — then APPLY the load-bearing simplifications directly; do not just report them. Rules: never touch the protected invariant (${plan.invariant_to_protect}) or its tests; never change external behavior; skip anything you judge risky and record why. After applying, run \`${ENV} ${G}\` — it MUST be fully green (never delete/weaken a test to get there; revert your own edit instead).`,
  { label: 'simplify-wave', phase: 'Simplify', agentType: 'general-purpose', model: APEX, schema: SIMPLIFY })
await checkpoint('simplify')

phase('Review')
// The final reviews see the FINAL (post-simplify) shape. Whenever triage lands fixes, every lens —
// simplify included — re-reviews the DELTA those fixes introduced: a bounded fixpoint, not a full re-read.
const secLens = { k: 'security', p: `ADVERSARIAL SECURITY REVIEW. Focus on the protected invariant (${plan.invariant_to_protect}) and every trust/authz boundary the change touches. Try to get past it; scrutinize error paths, logs, counts for leaks. Try to write a test that breaches it.` }
const corLens = { k: 'correctness', p: `ADVERSARIAL CORRECTNESS REVIEW of the change's core logic/invariants. Try to construct inputs/sequences that violate an invariant. Are the new tests real or vacuous (do they reach the failure region)?` }
const simLens = { k: 'simplify', p: `SIMPLIFICATION REVIEW (NOT a bug hunt): duplication, dead code, needless indirection, wrong-altitude abstraction, inconsistent error handling. Rate a finding high severity ONLY when the simplification is genuinely load-bearing for maintainability (it WILL be applied). Nothing touching the protected invariant or its tests.` }
const allF = []
let triage = null, lastRoundFixed = false, reviewRound = 0
let lenses = [secLens, corLens]              // the simplify lens already ran as its own wave; it rejoins on delta rounds
let scope = `ONLY the change introduced by ${blueprintPath} in ${repoPath} (the diff vs the green baseline; the simplification wave already ran — this is the final shape)`
while (reviewRound < 3) {                    // 1 full round + up to 2 delta re-review rounds
  reviewRound++
  const reviews = await parallel(lenses.map((d) => () => agent(
    `${d.p}\nReview ${scope}. Run \`${ENV} ${G}\` if useful. Report findings with severity + location + suggested_fix.`,
    { label: `review:${d.k}#${reviewRound}`, phase: 'Review', agentType: 'general-purpose', model: APEX, schema: FINDINGS })))
  const roundF = reviews.filter(Boolean).flatMap((r) => (r.findings || []).map((f) => ({ ...f, dimension: r.dimension, round: reviewRound })))
  allF.push(...roundF)
  const mustFix = roundF.filter((f) => f.severity === 'critical' || f.severity === 'high')
  if (!mustFix.length) { lastRoundFixed = false; break }   // fixpoint: a round with no new high-sev findings ends the review
  triage = await agent(
    `Triage + fix the confirmed high-severity findings: CONFIRM each is real first (reproduce/inspect); fix real ones minimally per ${blueprintPath}; reject false positives with reasons. High-severity SIMPLIFICATION findings are first-class — apply them (the gate protects you), never touching the protected invariant or its tests. Then run \`${ENV} ${G}\` — must be GREEN; never delete a test to pass; never weaken the protected invariant. Do NOT apply medium/low findings unless trivially safe.\nFindings:\n${mustFix.map((f, i) => `${i + 1}. [${f.severity}/${f.dimension}] ${f.title} @ ${f.location}: ${f.detail} | fix: ${f.suggested_fix}`).join('\n')}`,
    { label: `triage+fix#${reviewRound}`, phase: 'Review', agentType: 'general-purpose', model: HEAVY, schema: GREEN })
  lastRoundFixed = true
  await checkpoint('review-fixes-' + reviewRound)  // safety, plus a clean git boundary so the next round can see exactly the delta
  lenses = [secLens, corLens, simLens]       // the fixes changed the code — every lens re-checks, but only the delta
  scope = `ONLY the DELTA from the round-${reviewRound} triage fixes in ${repoPath} (the latest checkpoint(review-fixes-${reviewRound}) commit — or \`git diff\` if checkpointing is off; the fixed findings were at: ${mustFix.map((f) => f.location).join('; ')}). The rest of the change was already reviewed — do not re-litigate it`
}
if (lastRoundFixed) log('Review: round cap reached with fixes still landing — the last triage fixes are gate-protected but not re-reviewed.')

const finalCkpt = await checkpoint('final')        // capture Review fixes on the branch (still no PR / merge)

// @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
return {
  gate_cmd: G,
  baseline_green: base.green,
  modules: built,
  integrate_green: green,
  simplify_wave: simplified,
  review_rounds: reviewRound,
  review_findings: allF,
  must_fix: allF.filter((f) => f.severity === 'critical' || f.severity === 'high').length,
  final_green: triage ? triage.green : (simplified ? simplified.green : green),
  checkpointed: CKPT,
  final_checkpoint: finalCkpt,
}
