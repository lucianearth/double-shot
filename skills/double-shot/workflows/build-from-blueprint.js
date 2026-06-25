export const meta = {
  name: 'build-from-blueprint',
  description: 'Autonomously build a project from a BLUEPRINT.md to green: derive the module DAG, scaffold + verify the foundation (crown-jewel adversarially checked), build modules in dependency waves (each adversarially verified + fix-looped), loop tests to green, then adversarial review + triage-fix. Generalized from real, proven build runs.',
  whenToUse: 'After plan-to-blueprint (or any concrete buildable blueprint with an ordered module/build plan). Pairs with the One-Shot Playbook: the main loop gates the blueprint with the user; THIS workflow is the gate-free build engine.',
  phases: [
    { title: 'Plan', detail: 'read blueprint -> module DAG/waves, build+test cmds, crown-jewel, risky deps; spike risky deps' },
    { title: 'Foundation', detail: 'scaffold + shared contracts + Wave-0 module; adversarially verify the crown-jewel invariant' },
    { title: 'Modules', detail: 'waves of disjoint modules: impl -> adversarial verify -> bounded fix loop' },
    { title: 'Green', detail: 'integrate; loop build+test until fully green' },
    { title: 'Live', detail: 'IF the project has a UI: serve it live + agent-browser SCREENSHOT every surface; a vision agent confirms it actually RENDERS (green != renders); fix-loop visual defects; re-green' },
    { title: 'Review', detail: 'adversarial security/correctness/simplification -> triage + fix high-sev -> re-verify green' },
  ],
}

// args: { blueprintPath (required), repoPath?, buildCmd?, testCmd?, envPrefix?, constraints? }
// Some harnesses deliver `args` as a JSON string rather than a parsed object; normalize either way.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const blueprintPath = A.blueprintPath
const repoPath = A.repoPath || '.'
const envPrefix = A.envPrefix || ''          // e.g. 'export PATH="$HOME/.cargo/bin:$PATH";'
const buildCmdHint = A.buildCmd || 'auto-detect from the blueprint/repo'
const testCmdHint = A.testCmd || 'auto-detect from the blueprint/repo'
const constraints = A.constraints || 'none beyond the blueprint'
if (!blueprintPath) throw new Error('args.blueprintPath is required (absolute path to the blueprint)')

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
      type: 'array', description: 'Ordered build waves (barrier between waves). DEFAULT TO SERIAL: prefer fewer, coarser steps — typically ONE module per wave — because most projects are a near-linear dependency chain. Put MULTIPLE modules in one wave (they run in parallel) ONLY when they are genuinely independent (disjoint files, no compile-time dependency on each other) AND each is substantial enough that a dedicated, focused agent context is worth more than the coordination + shared build-lock overhead. Group small or tightly-coupled files into a single module that one agent builds in sequence. Fan-out buys CONTEXT ISOLATION, not wall-clock (a single-crate build shares one target-dir lock, so concurrent builds mostly serialize anyway).',
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
const plan = await agent(
  `Read the blueprint at ${blueprintPath} IN FULL (repo: ${repoPath}). Produce a concrete build plan: the build command + test command (hints: build=${buildCmdHint}, test=${testCmdHint}; env-prefix hint: ${JSON.stringify(envPrefix)}); the foundation (scaffold + shared contracts / Wave-0 module to build and FREEZE first); the crown-jewel (the security-critical or core-invariant component to verify hardest, plus the exact invariant); any risky external deps/toolchain that need an up-front spike before building; and the ordered build WAVES. DEFAULT TO SERIAL — most projects are a near-linear dependency chain, so prefer fewer, coarser modules built one at a time (a single agent can implement several small, related files in sequence). Split a wave into PARALLEL modules ONLY when they are genuinely independent (disjoint files, no compile-time dependency between them in that wave) AND each is large/self-contained enough that giving it its own focused agent context beats one agent doing them in sequence — here parallelism buys context isolation more than wall-clock (e.g. a single-crate build shares one target-dir lock, so concurrent builds mostly serialize). For each module give owned path-globs, the blueprint sections it implements, and machine-checkable acceptance criteria; modules sharing a wave MUST own disjoint files. ALSO: if the project has a USER-FACING UI, produce \`fe_verify\` — how to serve it LIVE (serve_cmd + any backend/seed bring-up + a ready_check), the base_url, the routes/surfaces to screenshot-verify (each with what MUST be visible), and key flows — so a live VISUAL check can run (compile-green never proves a page actually renders). OMIT \`fe_verify\` for a non-UI project. Constraints: ${constraints}. Return structured.`,
  { label: 'plan-build', phase: 'Plan', agentType: 'general-purpose', schema: PLAN_SCHEMA })

const ENV = plan.env_prefix || envPrefix
const B = plan.build_cmd, T = plan.test_cmd

if (plan.risky_deps && plan.risky_deps.length) {
  await parallel(plan.risky_deps.map((d) => () => agent(
    `Up-front SPIKE to de-risk "${d}" before any real build (per ${blueprintPath}). Actually try it — build a throwaway probe, hit the real API/toolchain in THIS environment; do NOT decide from memory. Report whether it works here, the exact working recipe, and any blocker + the fallback the blueprint names. ${ENV ? ('Shell prefix: ' + ENV) : ''}`,
    { label: `spike:${d}`, phase: 'Plan', agentType: 'general-purpose', schema: STATUS })))
}

phase('Foundation')
let foundation = await agent(
  `Scaffold the project and build the FOUNDATION per ${blueprintPath}: ${plan.foundation}. Create the workspace/skeleton + ALL module stubs + the shared contracts so the dependency graph compiles and later modules only fill in their OWN files (never the shared manifest/contracts). Then fully implement the foundation/shared-contract module. Run \`${ENV} ${B}\` (must compile) + the foundation's tests; fix until green. Repo: ${repoPath}.`,
  { label: 'foundation', phase: 'Foundation', agentType: 'general-purpose', schema: STATUS })
let fverdict = await agent(
  `Adversarially verify the foundation — especially the CROWN JEWEL: ${plan.crown_jewel}. Try to BREAK the stated invariant: write throwaway code that SHOULD be impossible — in a typed/compiled language, code that MUST FAIL TO COMPILE (confirm it does); otherwise, an input or sequence that MUST BE REJECTED at runtime (confirm it is, via a test). Run \`${ENV} ${T}\` for the foundation. Return pass=false with specifics if the invariant can be violated or the foundation is incomplete.`,
  { label: 'verify:foundation', phase: 'Foundation', agentType: 'general-purpose', schema: VERDICT })
if (!fverdict.pass) {
  foundation = await agent(`Fix the foundation; close every issue: ${JSON.stringify(fverdict.blocking_issues)}. Per ${blueprintPath}. Re-run \`${ENV} ${B} && ${T}\`. Report.`, { label: 'fix:foundation', phase: 'Foundation', agentType: 'general-purpose', schema: STATUS })
}

async function buildModule(m) {
  let impl = await agent(
    `Implement module "${m.name}" per ${blueprintPath} ${m.blueprint_secs}. It owns ONLY these paths: ${m.path_globs} — do not touch other modules' files. Acceptance: ${m.acceptance}. The shared contracts are frozen — build against them. Run \`${ENV} ${B}\` and the module's tests; fix until green. Never stub/delete tests to pass.`,
    { label: `build:${m.name}`, phase: 'Modules', agentType: 'general-purpose', schema: STATUS })
  let v = await agent(
    `Adversarially verify module "${m.name}" vs ${blueprintPath} ${m.blueprint_secs} and acceptance: ${m.acceptance}. Hunt for incompleteness, bugs, unsafety, blueprint divergence, and trivially-passing tests. Run \`${ENV} ${T}\` for it. pass=false with concrete issues if wrong.`,
    { label: `verify:${m.name}`, phase: 'Modules', agentType: 'general-purpose', schema: VERDICT })
  let r = 0
  while (!v.pass && r < 2) {
    r++
    impl = await agent(`Fix module "${m.name}": ${JSON.stringify(v.blocking_issues)}. Per ${blueprintPath} ${m.blueprint_secs}. Re-run build+test. Report.`, { label: `fix:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', schema: STATUS })
    v = await agent(`Re-verify "${m.name}" (same adversarial protocol). Run \`${ENV} ${T}\`. Verdict.`, { label: `reverify:${m.name}#${r}`, phase: 'Modules', agentType: 'general-purpose', schema: VERDICT })
  }
  return { module: m.name, ok: impl && impl.ok, passed: v && v.pass }
}

phase('Modules')
const built = []
for (const w of (plan.waves || [])) {               // waves are ordered (barrier between); modules within a wave run in parallel on disjoint files
  const r = await parallel((w.modules || []).map((m) => () => buildModule(m)))
  built.push(...r.filter(Boolean))
}

phase('Green')
let integ = null, green = false, round = 0
while (!green && round < 4) {
  round++
  integ = await agent(
    `Integration round ${round}: run \`${ENV} ${B}\` then \`${ENV} ${T}\` across the whole project. Fix any CROSS-MODULE failures (wiring, trait/interface mismatches, deps, features) per ${blueprintPath}. NEVER weaken the crown-jewel invariant or delete/ignore tests to go green — fix the real cause. Report green=true ONLY if build + tests are fully green; list remaining failures.`,
    { label: `integrate#${round}`, phase: 'Green', agentType: 'general-purpose', schema: GREEN })
  green = integ.green
}

phase('Live')
let live = null
if (plan.fe_verify && plan.fe_verify.routes && plan.fe_verify.routes.length) {
  const fe = plan.fe_verify
  live = await agent(
    `LIVE FRONT-END VERIFICATION. The unit gate (\`${ENV} ${T}\`) is GREEN — but GREEN != RENDERS CORRECTLY. A type-checked, a11y-perfect, fully-tested page can still be VISUALLY BROKEN at runtime: invisible content (a stuck animation / opacity:0, a duplicate-dependency context split), an unstyled / overlapping / off-screen surface, an error boundary, or an empty state where content should be. NONE of that is catchable by a compiler, a type-check, an a11y tree, or a unit test — the ONLY way is to RUN the app and LOOK at the pixels. Do exactly that; never infer "it renders" from the code.\n1. Bring up the live stack: \`${ENV} ${fe.serve_cmd}\` in the BACKGROUND${fe.backend ? ('; also bring up the backend / seed the data it needs: ' + fe.backend) : ''}; wait until it is up (${fe.ready_check}).\n2. Ensure agent-browser is available (it drives real Chrome + returns SCREENSHOTS; install it per the repo's front-end guide if missing). If it genuinely cannot be installed, set ran_live=false and say so — do NOT fake this step.\n3. For EACH route in ${JSON.stringify(fe.routes)} (and each flow in ${JSON.stringify(fe.flows || [])}): set a MOBILE viewport FIRST, agent-browser open \`${fe.base_url}<path>\`, take a SCREENSHOT to a file, and READ that screenshot image yourself — you are vision-capable. Judge it against ${blueprintPath} + the route's "expect": is the primary content actually VISIBLE and styled? anything invisible / transparent / zero-height / overlapping / unstyled / off-screen / errored / wrongly-empty? Then repeat at a desktop viewport.\n4. For EVERY visual defect: find the ROOT CAUSE (a runtime / CSS / bundling / dependency-context bug, NOT a test) and FIX it in the app code; rebuild + RE-SCREENSHOT to confirm it now renders. Loop until every listed surface renders correctly.\n5. Re-run \`${ENV} ${T}\` — it MUST stay GREEN after your fixes (never weaken a test to pass).\nRepo: ${repoPath}. Report per-surface renders_correctly + the screenshot_path you actually inspected + defects; the fixes applied; and stayed_green. NEVER mark a surface verified without a screenshot you personally looked at.`,
    { label: 'live-fe-verify', phase: 'Live', agentType: 'general-purpose', schema: FE_VERDICT })
} else {
  log('Live: no fe_verify recipe in the plan (no UI surfaces to verify) — skipping the live screenshot review.')
}

phase('Review')
const dims = [
  { k: 'security', p: `ADVERSARIAL SECURITY REVIEW. Focus on the crown jewel (${plan.crown_jewel}) and every trust/authz boundary. Try to get past it; scrutinize error paths, logs, and counts for leaks. Try to write a test that breaches it.` },
  { k: 'correctness', p: `ADVERSARIAL CORRECTNESS REVIEW of the core algorithms/invariants. Try to construct inputs/sequences that violate an invariant. Are the existing tests real or vacuous (do they actually reach the failure region)?` },
  { k: 'simplify', p: `SIMPLIFICATION/QUALITY review (NOT a bug hunt): duplication, dead code, wrong-altitude abstraction, inconsistent error handling. High-value low-risk only; nothing that touches the crown-jewel or its tests.` },
]
const reviews = await parallel(dims.map((d) => () => agent(
  `${d.p}\nRead the code under ${repoPath} and ${blueprintPath}. Run \`${ENV} ${T}\` if useful. Report findings with severity + location + suggested_fix.`,
  { label: `review:${d.k}`, phase: 'Review', agentType: 'general-purpose', model: d.k === 'simplify' ? 'sonnet' : undefined, schema: FINDINGS })))
const allF = reviews.filter(Boolean).flatMap((r) => (r.findings || []).map((f) => ({ ...f, dimension: r.dimension })))
const mustFix = allF.filter((f) => f.severity === 'critical' || f.severity === 'high')

let triage = null
if (mustFix.length) {
  triage = await agent(
    `Triage + fix the confirmed high-severity findings: CONFIRM each is real first (reproduce/inspect); fix real ones minimally per ${blueprintPath}; reject false positives with reasons. Then run \`${ENV} ${T}\` — must be GREEN; never delete a test to pass. Do NOT apply medium/low/simplification findings unless trivially safe.\nFindings:\n${mustFix.map((f, i) => `${i + 1}. [${f.severity}/${f.dimension}] ${f.title} @ ${f.location}: ${f.detail} | fix: ${f.suggested_fix}`).join('\n')}`,
    { label: 'triage+fix', phase: 'Review', agentType: 'general-purpose', schema: GREEN })
}

return {
  build_cmd: B, test_cmd: T,
  foundation_ok: foundation && foundation.ok,
  modules: built,
  integrate_green: green,
  live,
  review_findings: allF,
  must_fix: mustFix.length,
  final_green: triage ? triage.green : green,
}
