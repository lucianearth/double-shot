export const meta = {
  name: 'plan-to-blueprint',
  description: 'Turn a deep plan/design doc into a concrete, buildable implementation blueprint via parallel research + design + synthesis. Generic: the plan itself drives what gets researched and designed.',
  whenToUse: 'After aligning with the user on stack/scope/constraints, when you have a substantial plan doc and need a buildable blueprint before an autonomous build phase.',
  phases: [
    { title: 'Decompose', detail: 'read the plan; extract dependencies to research and hard subsystems to design' },
    { title: 'Research', detail: 'one agent per external dependency/toolchain' },
    { title: 'Design', detail: 'one agent per hard subsystem' },
    { title: 'Synthesize', detail: 'merge into BLUEPRINT.md' },
    { title: 'Reconcile', detail: 'IF a wireframe contract exists: confirm the blueprint keeps every frame feasible, accurate, and representative — report drift for the gate' },
  ],
}

// args: { planPath (required), repoPath?, stack?, scope?, constraints?, wireframesDir? }
// Some harnesses deliver `args` as a JSON string rather than a parsed object; normalize either way.
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
// Model tiers — every agent() call is pinned to one of three args-overridable tiers so a fan-out never
// silently inherits an expensive main-loop model. `grunt` = mechanical (research readers); `heavy` =
// judgment (synthesis); `apex` = the highest-leverage judgment calls (decompose, subsystem design) —
// the stages worth a frontier model. Defaults: grunt='sonnet'; heavy=undefined (inherit — set
// models:{heavy:'opus'} when orchestrating from a pricier main-loop model); apex=falls back to heavy,
// pure opt-in — set models:{apex:'fable'} to give decompose + design a frontier model.
const M = A.models || {}                 // { grunt?: string, heavy?: string, apex?: string }
const GRUNT = ('grunt' in M) ? M.grunt : 'sonnet'
const HEAVY = M.heavy
const APEX = ('apex' in M) ? M.apex : HEAVY
const planPath = A.planPath
const repoPath = A.repoPath || '.'
const stack = A.stack || 'choose the best fit for this plan and justify the choice'
const scope = A.scope || 'the full core software described by the plan, with external services abstracted behind interfaces plus deterministic fakes for tests'
const constraints = A.constraints || 'none specified beyond the plan'
// Approved wireframe set (stories.md + frames + decisions.md) = the UX contract. When present, every
// judgment stage is bound to it: designs must support the frames; deviations are flagged, never silent.
const wireframesDir = A.wireframesDir || ''
const WIRE = wireframesDir
  ? `\n\nUX CONTRACT: an APPROVED wireframe set lives at ${wireframesDir} (stories.md + frame HTML files + decisions.md — all small; read them, nothing else there needs exploring). It is the human-approved experience contract: your output MUST support the frames and the user stories, and must not re-litigate anything recorded in decisions.md. If something you're doing genuinely conflicts with a frame, flag it as an open question — never silently deviate.`
  : ''

if (!planPath) throw new Error('args.planPath is required (absolute path to the plan/design doc)')

const DECOMP_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string', description: 'A faithful 1-2 paragraph restatement of what the plan asks us to build.' },
    dependencies: {
      type: 'array', description: 'External libraries/services/toolchain that need concrete research before building.',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, why: { type: 'string' }, research_questions: { type: 'string' } },
        required: ['name', 'why', 'research_questions'],
      },
    },
    subsystems: {
      type: 'array', description: 'The hard subsystems that need careful up-front design (core invariants, security-critical paths, subtle algorithms).',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, why_hard: { type: 'string' }, design_questions: { type: 'string' } },
        required: ['name', 'why_hard', 'design_questions'],
      },
    },
  },
  required: ['summary', 'dependencies', 'subsystems'],
}

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    area: { type: 'string' },
    summary: { type: 'string', description: 'Markdown findings: what it is, how to use it for our needs, version/maturity.' },
    key_apis: { type: 'array', items: { type: 'string' }, description: 'Concrete API calls / signatures / config snippets to build from.' },
    risks: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'summary', 'key_apis', 'risks', 'sources'],
}

const DESIGN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    component: { type: 'string' },
    design: { type: 'string', description: 'Detailed markdown design/spec, faithful to the plan principles.' },
    interfaces: { type: 'array', items: { type: 'string' }, description: 'Concrete interface signatures: types/traits/DDL/tool schemas.' },
    open_questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['component', 'design', 'interfaces', 'open_questions'],
}

const BLUEPRINT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    blueprint_path: { type: 'string' },
    key_decisions: { type: 'array', items: { type: 'string' } },
    module_dag: { type: 'string', description: 'Module/crate dependency graph + build order as text.' },
    top_risks: { type: 'array', items: { type: 'string' } },
    open_questions_for_user: { type: 'array', items: { type: 'string' } },
    ready_to_build: { type: 'boolean' },
  },
  required: ['blueprint_path', 'key_decisions', 'module_dag', 'top_risks', 'open_questions_for_user', 'ready_to_build'],
}

phase('Decompose')
const decomp = await agent(
  `Read the plan at ${planPath} IN FULL. Stack guidance: ${stack}. Scope: ${scope}. Constraints: ${constraints}.\n\n` +
  `Identify two things: (1) the external dependencies / libraries / toolchain that need concrete research before building (with the specific questions to answer for each), and (2) the hard subsystems that need careful up-front design — the parts carrying the project's core invariants, its security-critical paths, or its subtle algorithms (with the design questions for each). Be thorough but don't pad: only list things that genuinely need research/design. Return structured.${WIRE}`,
  { phase: 'Decompose', agentType: 'general-purpose', model: APEX, schema: DECOMP_SCHEMA })

phase('Research')
const research = await parallel((decomp.dependencies || []).map((d) => () =>
  agent(
    `Research **${d.name}** for this project (stack: ${stack}). Why it matters: ${d.why}\n\nAnswer concretely: ${d.research_questions}\n\n` +
    `Use WebSearch/WebFetch for CURRENT docs; fall back to your knowledge and explicitly FLAG uncertainty. Read ${planPath} for context. Give concrete, code-shaped API snippets we can build from.`,
    { label: `research:${d.name}`, phase: 'Research', model: GRUNT, agentType: 'general-purpose', schema: RESEARCH_SCHEMA })))

const researchBrief = research.filter(Boolean).map((r) =>
  `### ${r.area}\n${r.summary}\nKey APIs:\n- ${r.key_apis.join('\n- ')}\nRisks:\n- ${r.risks.join('\n- ')}`).join('\n\n')

phase('Design')
const designs = await parallel((decomp.subsystems || []).map((s) => () =>
  agent(
    `Design **${s.name}** for this project. Why it's hard: ${s.why_hard}\n\nAddress: ${s.design_questions}\n\n` +
    `Read ${planPath}. Stack: ${stack}. Keep the plan's stated principles intact. Provide concrete interface signatures (types/traits/DDL/schemas). If this subsystem is security-critical or carries a core invariant, be airtight about how the design enforces it.${WIRE}\n\nResearch context:\n${researchBrief}`,
    { label: `design:${s.name}`, phase: 'Design', agentType: 'general-purpose', model: APEX, schema: DESIGN_SCHEMA })))

const designBrief = designs.filter(Boolean).map((d) =>
  `## ${d.component}\n${d.design}\n\nInterfaces:\n\`\`\`\n${d.interfaces.join('\n')}\n\`\`\`\nOpen questions:\n- ${d.open_questions.join('\n- ')}`).join('\n\n---\n\n')

phase('Synthesize')
const blueprint = await agent(
  `You are the lead architect. Synthesize the research and designs below into a single coherent, buildable implementation blueprint. Write it to ${repoPath}/BLUEPRINT.md.\n\n` +
  `Sections: overview & stack decision (with concrete library versions from research); workspace/module layout + dependency DAG + build order; each designed subsystem; the data layer; external-service abstractions + deterministic fakes for tests; the test plan (including security tests for any security-critical path and correctness tests for every core invariant); and an ORDERED list of build phases, each with explicit acceptance criteria the autonomous build will execute against.\n\n` +
  `Resolve conflicts between design docs; where they disagree, choose the better option and say why. Keep the plan's principles intact. Be concrete and buildable. After writing the file, return the structured summary.\n\n` +
  `Constraints to honor: ${constraints}${WIRE}${wireframesDir ? `\nIn the blueprint, TRACE every user-facing surface to its frame file in ${wireframesDir}, and write UI acceptance criteria as STRUCTURAL matches to the frame (same hierarchy, same primary action) — never pixel matches.` : ''}\n\n=== RESEARCH ===\n${researchBrief}\n\n=== DESIGNS ===\n${designBrief}`,
  { label: 'synthesize:blueprint', phase: 'Synthesize', agentType: 'general-purpose', model: HEAVY, schema: BLUEPRINT_SCHEMA })

// After the blueprint exists, confirm the UX contract survived it: technical decisions made during
// research/design can silently invalidate an approved frame. Drift goes to the human gate, not the build.
let reconcile = null
if (wireframesDir) {
  phase('Reconcile')
  const RECONCILE = { type: 'object', additionalProperties: false, properties: { feasible: { type: 'boolean' }, drift: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { frame: { type: 'string' }, issue: { type: 'string' }, proposal: { type: 'string' }, resolution: { type: 'string', description: "'fix-blueprint' or 'revise-frame' (frame revisions need human re-approval)" } }, required: ['frame', 'issue', 'proposal', 'resolution'] } }, stories_at_risk: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['feasible', 'drift', 'stories_at_risk', 'notes'] }
  reconcile = await agent(
    `RECONCILE the blueprint against the UX contract. Read ONLY ${blueprint.blueprint_path} and the wireframe set at ${wireframesDir} (stories.md, the frame HTML files, decisions.md) — do not explore anything else. Confirm three things: (1) FEASIBLE — nothing in the blueprint's stack/architecture makes any frame technically infeasible; (2) ACCURATE — no blueprint decision silently changed what a screen must be (data a frame shows that the design doesn't produce, an action that moved, a flow that gained a step); (3) REPRESENTATIVE — every story in stories.md is still served end-to-end by the blueprint's build plan. For each drift: name the frame, the issue, a concrete proposal, and whether the fix belongs in the blueprint ('fix-blueprint') or the wireframe ('revise-frame' — that one needs human re-approval). Return structured.`,
    { label: 'reconcile:wireframes', phase: 'Reconcile', agentType: 'general-purpose', model: APEX, schema: RECONCILE })
}

// @ts-expect-error top-level return — the Workflow runtime wraps this script body in an async function
return wireframesDir ? { ...blueprint, wireframe_reconcile: reconcile } : blueprint
