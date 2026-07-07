export const meta = {
  name: 'americano-build',
  description: 'Americano build: a TRIMMED build-from-blueprint for a BOUNDED change to an ALREADY-GREEN repo. Confirm green baseline (NO scaffold/foundation phase) -> build the blueprint waves (impl -> adversarial verify -> bounded fix loop) -> loop to green via the repo gate -> adversarial review + triage. For greenfield / new-foundation, use double-shot build-from-blueprint instead.',
  whenToUse: 'After americano-plan, or any bounded blueprint with ordered waves over an EXISTING green codebase. Dilution vs build-from-blueprint: drops the greenfield Foundation/scaffold/freeze + dep-spike up-front pass.',
  phases: [
    { title: 'Plan', detail: 'transcribe the blueprint waves + the green-gate cmd + the invariant to protect (no foundation derivation)' },
    { title: 'Baseline', detail: 'confirm the repo is green at HEAD so any new red is ours; refuse to build on red' },
    { title: 'Modules', detail: 'ordered waves of disjoint work-items: impl -> adversarial verify -> bounded fix loop' },
    { title: 'Green', detail: 'integrate; loop the repo gate until fully green' },
    { title: 'Review', detail: 'adversarial security/correctness/simplification + protect the named invariant -> triage + fix high-sev' },
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
// Model tiers — every agent() call is pinned to one of two tiers so a fan-out never silently inherits
// an expensive main-loop model. `grunt` covers mechanical stages (baseline gate, checkpoints, the
// simplify review); `heavy` covers judgment stages (plan, build, verify, fix, integrate, the
// security/correctness reviews, triage). Defaults: grunt='sonnet'; heavy=undefined (inherit the session
// model — set models:{heavy:'opus'} when orchestrating from a pricier main-loop model).
const M = A.models || {}                 // { grunt?: string, heavy?: string }
const GRUNT = ('grunt' in M) ? M.grunt : 'sonnet'
const HEAVY = M.heavy
if (!blueprintPath) throw new Error('args.blueprintPath is required (absolute path to the blueprint)')

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    gate_cmd: { type: 'string', description: 'The single command that builds AND tests the repo to green (the existing green gate).' },
    env_prefix: { type: 'string', description: 'Shell prefix needed before the gate (PATH etc.), or empty string.' },
    invariant_to_protect: { type: 'string', description: 'The existing load-bearing invariant this change must NOT break (the crown jewel to verify hardest), AND how to assert it.' },
    waves: {
      type: 'array', description: 'Ordered build waves (barrier between waves). Work-items within a wave touch DISJOINT files and build in parallel. Taken from the blueprint own DAG.',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          wave: { type: 'integer' },
          modules: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: { name: { type: 'string' }, path_globs: { type: 'string' }, blueprint_secs: { type: 'string' }, acceptance: { type: 'string' } },
              required: ['name', 'path_globs', 'blueprint_secs', 'acceptance'],
            },
          },
        },
        required: ['wave', 'modules'],
      },
    },
  },
  required: ['gate_cmd', 'env_prefix', 'invariant_to_protect', 'waves'],
}
const STATUS = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, gate_tail: { type: 'string' }, deviations: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'summary', 'gate_tail', 'deviations'] }
const VERDICT = { type: 'object', additionalProperties: false, properties: { pass: { type: 'boolean' }, blocking_issues: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['pass', 'blocking_issues', 'notes'] }
const GREEN = { type: 'object', additionalProperties: false, properties: { green: { type: 'boolean' }, summary: { type: 'string' }, remaining_failures: { type: 'array', items: { type: 'string' } } }, required: ['green', 'summary', 'remaining_failures'] }
const BASE = { type: 'object', additionalProperties: false, properties: { green: { type: 'boolean' }, gate_cmd: { type: 'string' }, summary: { type: 'string' } }, required: ['green', 'gate_cmd', 'summary'] }
const FINDINGS = { type: 'object', additionalProperties: false, properties: { dimension: { type: 'string' }, findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { severity: { type: 'string' }, title: { type: 'string' }, location: { type: 'string' }, detail: { type: 'string' }, suggested_fix: { type: 'string' } }, required: ['severity', 'title', 'location', 'detail', 'suggested_fix'] } }, summary: { type: 'string' } }, required: ['dimension', 'findings', 'summary'] }

phase('Plan')
const plan = await agent(
  `Read the blueprint at ${blueprintPath} IN FULL (repo: ${repoPath}). It targets a BOUNDED change to an EXISTING, already-green codebase — there is NO project to scaffold and NO foundation to freeze. Produce: the repo's green-gate command (build+test in one; hint: ${gateHint}; env-prefix hint: ${JSON.stringify(envPrefix)}); the existing INVARIANT this change must not break (the crown jewel + how to assert it); and the ordered build WAVES taken from the blueprint's OWN work-item/DAG section — work-items within a wave MUST touch disjoint files (so they build in parallel without collision). Give each work-item owned path-globs, the blueprint sections it implements, and machine-checkable acceptance criteria. Do NOT invent a scaffold/foundation step. Constraints: ${constraints}. Return structured.`,
  { label: 'plan-build', phase: 'Plan', agentType: 'general-purpose', model: HEAVY, schema: PLAN_SCHEMA })

const ENV = plan.env_prefix || envPrefix
const G = plan.gate_cmd

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

async function buildModule(m) {
  let impl = await agent(
    `Implement work-item "${m.name}" per ${blueprintPath} ${m.blueprint_secs} in the EXISTING repo at ${repoPath}. It owns ONLY these paths: ${m.path_globs} — do not touch other work-items' files. Acceptance: ${m.acceptance}. Build against the existing code/contracts (they already compile). Run \`${ENV} ${G}\` (or the narrowest subset that covers this item) and fix until green for this item. Never stub/delete tests to pass; never weaken the protected invariant (${plan.invariant_to_protect}).`,
    { label: `build:${m.name}`, phase: 'Modules', agentType: 'general-purpose', model: HEAVY, schema: STATUS })
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

phase('Review')
const dims = [
  { k: 'security', p: `ADVERSARIAL SECURITY REVIEW. Focus on the protected invariant (${plan.invariant_to_protect}) and every trust/authz boundary the change touches. Try to get past it; scrutinize error paths, logs, counts for leaks. Try to write a test that breaches it.` },
  { k: 'correctness', p: `ADVERSARIAL CORRECTNESS REVIEW of the change's core logic/invariants. Try to construct inputs/sequences that violate an invariant. Are the new tests real or vacuous (do they reach the failure region)?` },
  { k: 'simplify', p: `SIMPLIFICATION/QUALITY review (NOT a bug hunt): duplication, dead code, wrong-altitude abstraction, inconsistent error handling INTRODUCED by the change. High-value low-risk only; nothing touching the protected invariant or its tests.` },
]
const reviews = await parallel(dims.map((d) => () => agent(
  `${d.p}\nReview ONLY the change introduced by ${blueprintPath} in ${repoPath} (the diff vs the green baseline). Run \`${ENV} ${G}\` if useful. Report findings with severity + location + suggested_fix.`,
  { label: `review:${d.k}`, phase: 'Review', agentType: 'general-purpose', model: d.k === 'simplify' ? GRUNT : HEAVY, schema: FINDINGS })))
const allF = reviews.filter(Boolean).flatMap((r) => (r.findings || []).map((f) => ({ ...f, dimension: r.dimension })))
const mustFix = allF.filter((f) => f.severity === 'critical' || f.severity === 'high')

let triage = null
if (mustFix.length) {
  triage = await agent(
    `Triage + fix the confirmed high-severity findings: CONFIRM each is real first (reproduce/inspect); fix real ones minimally per ${blueprintPath}; reject false positives with reasons. Then run \`${ENV} ${G}\` — must be GREEN; never delete a test to pass; never weaken the protected invariant. Do NOT apply medium/low/simplification findings unless trivially safe.\nFindings:\n${mustFix.map((f, i) => `${i + 1}. [${f.severity}/${f.dimension}] ${f.title} @ ${f.location}: ${f.detail} | fix: ${f.suggested_fix}`).join('\n')}`,
    { label: 'triage+fix', phase: 'Review', agentType: 'general-purpose', model: HEAVY, schema: GREEN })
}

const finalCkpt = await checkpoint('final')        // capture Review fixes on the branch (still no PR / merge)

// @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
return {
  gate_cmd: G,
  baseline_green: base.green,
  modules: built,
  integrate_green: green,
  review_findings: allF,
  must_fix: mustFix.length,
  final_green: triage ? triage.green : green,
  checkpointed: CKPT,
  final_checkpoint: finalCkpt,
}
