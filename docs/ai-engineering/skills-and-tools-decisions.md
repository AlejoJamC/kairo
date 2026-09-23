# Skills and Tools

## Definitions

- **Feature**: what Kairo offers the user (a ticket type, a queue order, a reply draft).
- **Technique**: the AI mechanism behind a feature (decomposition, ensemble, retrieval, abstention, structured output).
- **Skill**: the procedure an agent follows to apply techniques correctly in this repo. Prose with file references. Lives in `skills/<name>/SKILL.md` at the repo root, never in a vendor-specific folder, and never depends on vendor-specific files.
- **Tool**: something that executes — an agent script (`scripts/`) or a runtime primitive in a package. Code with an interface and tests.

A Skill that is really a function belongs in code; a Tool that is really prose belongs in a Skill.

## When to add a Skill or a Tool

Only with one of these, cited in the PR:

- **Recurrence**: two or more existing implementations of the same pattern, or one plus one already planned in the repo.
- **Measured benefit**: a number the eval harness or the production signals produce before and after.
- **Composition**: two or more other Skills or Tools consume it.

"Useful" is not a reason. When none applies, the candidate stays as product logic, configuration or an implementation detail. Prefer extending an existing Skill over adding one.

## Skills

| Skill | Covers |
|---|---|
| [`kairo-llm-feature`](../../skills/kairo-llm-feature/SKILL.md) | Adding or changing any LLM or embedding feature; changing the rubric, routing policy, derivation table or a proposal gate; letting a model output act without a person |
| [`kairo-ai-evaluation`](../../skills/kairo-ai-evaluation/SKILL.md) | Baselines, corpus and stage choice, clean runs, layer attribution, deciding whether evidence is enough, reading production signals |

## Tool contracts

Any implementation of these must follow the contract.

### `runLlmFeature` (runtime, `packages/intelligence`)

The single path for an LLM call.

```ts
interface LlmFeatureRequest<T> {
  feature: string;                 // snake_case, the llm_calls.feature value
  promptId: string;                // directory under packages/intelligence/prompts/
  lang: PromptLang;                // the tenant's language, resolved by the caller
  vars: Record<string, string>;    // placeholder values; an unfilled placeholder is an error
  schema?: z.ZodSchema<T>;         // present → completeJSONWithMeta; absent → completeWithMeta
  options?: CompletionOptions;
  context: { ticketId?: string; accountId?: string; userId?: string };
  provider?: CompletionProvider;   // injection for tests and ensemble targets
  logger?: (entry: LlmCallRecord) => Promise<string | null>; // writes llm_calls, returns the row id
}

interface LlmFeatureResult<T> {
  data: T | string;
  promptVersion: string | null;
  model: string;                   // as reported by the provider
  usage: CompletionUsage;
  latencyMs: number;
  llmCallId: string | null;
  prompt: string;
}
```

- Loads `prompts/<promptId>/<lang>.md`, reads the version with `extractPromptVersion`, fills placeholders, opens one Langfuse generation named after `feature` under `sessionId = ticketId`, calls the provider, calls `logger` on success and on failure.
- `ProviderError` passes through unchanged. A missing template or unfilled placeholder is a non-retriable `LlmFeatureError`. A logging failure never throws.
- Out of scope: retry and concurrency (callers use `apps/api/src/lib/retry.ts`), derivation, ensemble, gating.
- The logger is supplied by `apps/api` (over `logLlmCall`), because `packages/intelligence` has no database client.
- Tests: fake provider and logger; template and version; unfilled placeholder; schema vs text path; Langfuse metadata; logger called on success and failure; `ProviderError` passthrough.

### `export_feedback` (agent script, `scripts/eval/`)

Turns human-verified classifications into an eval dataset.

- Input: read-only query over `classification_feedback` rows with a corrected type and `ticket_proposals` confirmed through `POST /v1/tickets/:id/classify-approve`. Which statuses count as verified is a product decision made before implementation.
- Output: only under `scripts/eval/data/production/<run-date>/`; any other path is refused. `ground_truth.csv` in the English sheet schema (`email_id` as a sequential number, `ticket_type_final`, `priority_final`, `category_final`); `layers.csv` with the predicted type, the model's axes (from `ai_model_verdict`), provenance (from `ai_mail_facts` via `provenanceOf`) and the derivation, prompt and routing versions; a private `id_map.csv`. No subject, body, address or name.
- Errors: missing credentials, a path outside `scripts/eval/data/`, or zero rows exit non-zero. Rows without provenance are counted and reported, never guessed.
- `eval:attribute` gains an option to read provenance from `layers.csv` instead of `.eml` files.
- Tests: pure mapping functions with `Acme` fixtures; the path guard; no network.

### `retrieveTicketContext` (runtime, `apps/api/src/lib/`)

The single source of similar resolved tickets and KB articles for LLM prompts and the agent panel.

```ts
retrieveTicketContext(input: {
  ticketId: string; accountId: string;
  queryText?: string;              // default: subject + body preview
  kbLimit?: number; casesLimit?: number;
}): Promise<{
  kbArticles: { id: string; title: string; content: string; similarity: number | null }[];
  resolvedCases: { id: string; ticketNumber: number; subject: string | null; resolutionSummary: string | null; similarity: number | null }[];
  degraded: ('embedding_unavailable' | 'kb_rpc_failed' | 'cases_rpc_failed')[];
}>
```

- One embedding, `find_relevant_kb` and `find_similar_tickets` in parallel, one threshold and one status filter for every consumer. Whether `ai_resolved` counts as resolved is decided once, explicitly.
- Never throws; failures go to `degraded`. Every query is scoped to `accountId`.
- Not for `/similar` (grouping) or the escalation past-L2 check: they answer different questions.
- Tests: fake Supabase and embed function; each degradation; threshold filtering; tenant scoping.

## Not Skills or Tools

| Candidate | Why not |
|---|---|
| Generic ensemble | One consumer; its comparison runs on a field only classification derives |
| Wrapper around the `eval:*` scripts | The scripts already are the tools; `kairo-ai-evaluation` documents them |
| Langfuse and ClickStack query recipes | A page of names and queries: reference inside `kairo-ai-evaluation` |
| Classification call-site orchestration | The call sites genuinely differ per tier; the generic part belongs to `runLlmFeature` |
| Shared embedding persist helper | Two short functions over different tables |
| Auto-approval recompute | Product logic: a pipeline job that writes `ticket_type_auto_approval`. Its rules are in `kairo-llm-feature` → selective automation |
| Selective automation, decision-layer changes | Steps of `kairo-llm-feature`, kept as its reference files |
| Prompt language, priority weights, escalation rules, SLA logic | Configuration or product rules |
| Semaphore, circuit breaker, retry | Implementation details referenced by `kairo-llm-feature` |
| Model self-reported `confidence` | Measured not to separate right from wrong; stored and displayed, never used to decide |
