export const meta = {
  name: 'americano-plan',
  description: 'Americano phase 1: bounded research (confirm, not explore) -> one design pass per dimension -> one adversarial critique -> a build-ready blueprint doc. The watered-down plan-to-blueprint. Writes the doc; NO build. Feature-specific content arrives via args (researchTargets, designDimensions, invariants).',
  phases: [
    { title: 'Research', detail: 'targeted readers that CONFIRM specifics (the design is already aligned), not open exploration' },
    { title: 'Design', detail: 'one pass per orthogonal dimension' },
    { title: 'Critique', detail: 'one adversarial round vs the stated invariants — hunt runtime-breakers' },
    { title: 'Synthesize', detail: 'write the build-ready blueprint doc + return outline & must-fixes' },
    { title: 'Reconcile', detail: 'IF a wireframe contract exists: confirm the doc keeps every frame feasible, accurate, and representative — report drift for the gate' },
  ],
}

// args: {
//   feature: string, repoPath: string, outDoc: string, invariants: string,
//   researchTargets:  [{ label, prompt }],
//   designDimensions: [{ label, prompt, uses?: number[] }],  // uses = research indices to feed in (default: all)
//   styleRef?: string,                                       // an existing plan doc to match in voice/shape
//   wireframesDir?: string                                   // approved wireframe set (stories.md + frames + decisions.md) = the UX contract
// }
// Robust: the harness may hand `args` through as a JSON STRING rather than a parsed object.
const a = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const repoPath = a.repoPath || '.'
const feature = a.feature || 'feature'
const outDoc = a.outDoc || `docs/${feature}-plan-v1.md`
const researchTargets = a.researchTargets || []
const designDimensions = a.designDimensions || []
const invariants = a.invariants || '(none stated — infer the repo conventions; call out anything load-bearing you find.)'
const styleRef = a.styleRef ? `Match the structure/voice of the existing plan doc at ${a.styleRef}.` : ''
const wireframesDir = a.wireframesDir || ''
const WIRE = wireframesDir
  ? `\n\nUX CONTRACT: an APPROVED wireframe set lives at ${wireframesDir} (stories.md + frame HTML files + decisions.md — all small; read them, nothing else there needs exploring). It is the human-approved experience contract: your output MUST support the frames and the user stories, and must not re-litigate anything recorded in decisions.md. If something you're doing genuinely conflicts with a frame, flag it as an open question — never silently deviate.`
  : ''
// Model + effort are PRESCRIPTIVE — hardcoded per call, nothing inherits the session (change
// here, in code). BUILD ('sonnet') at effort 'high' does the research reading. JUDGE ('fable')
// makes the calls the whole blueprint hangs on — the once-per-run planning authors (design,
// the adversarial critique, synthesis) run effort 'high' (their mistakes propagate everywhere
// with nothing above them to catch it); the reconcile check runs 'medium'. A judge call that
// dies falls back to opus via agentRetry, never lower.
const BUILD = 'sonnet'
const JUDGE = 'fable'

// Retry an agent() that returns null — a terminal error after the harness's own retries. A
// fable-pinned call retries ONCE on fable (a transient capacity blip recovers there), and only
// THEN falls back to opus — that covers the won't-do-it case (e.g. a review getting flagged),
// which retrying on fable can't fix. Non-fable calls retry on their own model. So opus only
// ever appears as the last-resort fallback on judge calls, never on implementation.
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

if (!researchTargets.length || !designDimensions.length) {
  log('americano-plan: args.researchTargets[] and args.designDimensions[] are required. Aborting.')
  // @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
  return { error: 'missing researchTargets/designDimensions' }
}

phase('Research')
const research = await parallel(researchTargets.map((t) => () =>
  agent(
    `${t.prompt}\n\nRepo: ${repoPath}. Report CONCISELY (bullets with file:line, no large code dumps). This is CONFIRM-not-explore: the design is largely settled — nail the specifics a build will need, and flag anything you find that CONTRADICTS the assumed design.`,
    { label: `research:${t.label}`, phase: 'Research', agentType: 'Explore', model: BUILD, effort: 'high' })))
log(`Research: ${research.filter(Boolean).length}/${researchTargets.length} done.`)

phase('Design')
const design = await parallel(designDimensions.map((d) => () => {
  const idx = Array.isArray(d.uses) ? d.uses : research.map((_, j) => j)
  const ctx = idx.map((j) => research[j]).filter(Boolean).join('\n\n---\n\n')
  return agentRetry(
    `${d.prompt}\n\nProduce a CONCRETE design with exact code touch-points (file:line). Call out every risk to the stated invariants.${WIRE}\n\nINVARIANTS (do not violate):\n${invariants}\n\nRESEARCH CONTEXT:\n${ctx}`,
    { label: `design:${d.label}`, phase: 'Design', effort: 'high', model: JUDGE })
}))
log(`Design: ${design.filter(Boolean).length}/${designDimensions.length} done.`)

phase('Critique')
const designsBlob = design.map((d, i) => `### ${(designDimensions[i] || {}).label}\n${d}`).filter(Boolean).join('\n\n')
const critique = await agentRetry(
  `You are an adversarial reviewer. Try to BREAK the following design for "${feature}" (repo: ${repoPath}). Be skeptical and concrete. For EACH issue give: severity (blocker/should-fix/note), where (file:line), and the fix. Specifically check it does NOT violate any stated invariant, and hunt for RUNTIME-BREAKERS (references to nonexistent tables/functions/columns), races, migration hazards, and untested edge cases.${WIRE}\n\nINVARIANTS:\n${invariants}\n\nDESIGNS:\n${designsBlob}\n\nReturn a PRIORITIZED list of must-fixes + notes.`,
  { label: 'critique', phase: 'Critique', effort: 'high', model: JUDGE })
log('Critique done — writing the blueprint.')

phase('Synthesize')
const researchBlob = research.map((r, i) => `## research:${researchTargets[i].label}\n${r}`).filter(Boolean).join('\n\n')
const summary = await agentRetry(
  `Write a BUILD-READY blueprint for "${feature}" by combining the research, designs, and adversarial critique below. WRITE IT to ${repoPath}/${outDoc} with the Write tool. ${styleRef} It must let a FRESH-CONTEXT build agent execute it cold (it is the hand-off; the user may clear context before building). Required sections:\n1. Motivation & what it changes.\n2. Invariants to preserve (one line each) — fold the critique's BLOCKERS in as hard constraints.\n3..N. One section per design dimension — the concrete design + exact touch-points (file:line).\n- DB migrations (if any) + their safety.\n- Build plan: ORDERED waves/work-items with dependencies (the module DAG the build engine consumes), each with machine-checkable acceptance criteria.\n- Test plan: the new tests + the repo's existing green-gate command.\n- Risks (from the critique) + Out-of-scope (with reasons) + any JUDGMENT CALLS the human should decide at the gate.\nAfter writing the file, RETURN: the doc path, a bullet outline of the sections, the critique's must-fix list VERBATIM, and any flagged judgment calls.${WIRE}${wireframesDir ? `\nIn the doc, TRACE every touched user-facing surface to its frame file in ${wireframesDir}, and write UI acceptance criteria as STRUCTURAL matches to the frame (same hierarchy, same primary action) — never pixel matches.` : ''}\n\nINVARIANTS:\n${invariants}\n\nRESEARCH:\n${researchBlob}\n\nDESIGNS:\n${designsBlob}\n\nCRITIQUE:\n${critique}`,
  { label: 'synthesize', phase: 'Synthesize', effort: 'high', model: JUDGE })

// After the doc exists, confirm the UX contract survived it: design decisions can silently invalidate
// an approved frame. Drift goes to the human gate, not the build.
let reconcile = null
if (wireframesDir) {
  phase('Reconcile')
  const RECONCILE = { type: 'object', additionalProperties: false, properties: { feasible: { type: 'boolean' }, drift: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { frame: { type: 'string' }, issue: { type: 'string' }, proposal: { type: 'string' }, resolution: { type: 'string', description: "'fix-blueprint' or 'revise-frame' (frame revisions need human re-approval)" } }, required: ['frame', 'issue', 'proposal', 'resolution'] } }, stories_at_risk: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['feasible', 'drift', 'stories_at_risk', 'notes'] }
  reconcile = await agentRetry(
    `RECONCILE the plan doc against the UX contract. Read ONLY ${repoPath}/${outDoc} and the wireframe set at ${wireframesDir} (stories.md, the frame HTML files, decisions.md) — do not explore anything else. Confirm three things: (1) FEASIBLE — nothing in the doc makes any frame technically infeasible; (2) ACCURATE — no design decision silently changed what a screen must be (data a frame shows that the design doesn't produce, an action that moved, a flow that gained a step); (3) REPRESENTATIVE — every story touching this change is still served end-to-end. For each drift: name the frame, the issue, a concrete proposal, and whether the fix belongs in the doc ('fix-blueprint') or the wireframe ('revise-frame' — that one needs human re-approval). Return structured.`,
    { label: 'reconcile:wireframes', phase: 'Reconcile', effort: 'medium', model: JUDGE, schema: RECONCILE })
}

// @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
return { doc: outDoc, summary, wireframe_reconcile: reconcile }
