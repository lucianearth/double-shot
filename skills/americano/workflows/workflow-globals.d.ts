// Ambient declarations for the globals the Workflow runtime injects into every
// workflow script. Dev-time only — powers `// @ts-check` + editor autocomplete.
// NOT loaded or needed at runtime. Contract: see the Workflow tool documentation.

interface WorkflowAgentOpts {
  label?: string;
  phase?: string;
  schema?: object;
  model?: "sonnet" | "opus" | "haiku" | "fable" | (string & {});
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  isolation?: "worktree";
  agentType?: string;
}

/** Spawn a subagent. With `schema` it returns the validated object; otherwise its final text. Null if the agent was skipped or died after retries. */
declare function agent(prompt: string, opts?: WorkflowAgentOpts): Promise<any>;
/** Run thunks concurrently (BARRIER). A thunk that throws resolves to null — filter(Boolean) before use. */
declare function parallel<T>(thunks: Array<() => Promise<T>>): Promise<Array<T | null>>;
/** Run each item through all stages independently (NO barrier between stages). */
declare function pipeline(
  items: any[],
  ...stages: Array<(prev: any, original: any, index: number) => any>
): Promise<any[]>;
/** Emit a progress line to the user (narrator line above the progress tree). */
declare function log(message: string): void;
/** Start a new phase; subsequent agent() calls group under it in the progress display. */
declare function phase(title: string): void;
/** Run another saved workflow (or scriptPath) inline as a sub-step. One level deep only. */
declare function workflow(nameOrRef: string | { scriptPath: string }, args?: any): Promise<any>;

/** The value passed as the Workflow `args` input, verbatim (undefined if not provided). */
declare const args: any;
/** The turn's token budget directive (total is null if unset). */
declare const budget: {
  total: number | null;
  spent(): number;
  remaining(): number;
};
