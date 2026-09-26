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

## Tools

| Tool | Kind | Where | Consumers |
|---|---|---|---|
| `runLlmFeature`, `runLlmTextFeature` | runtime | `packages/intelligence/src/harness/run-llm-feature.ts` | reply suggestion; every new LLM feature |
| `withGeneration`, `loadPromptTemplate`, `fillTemplate` | runtime | `packages/intelligence/src/harness/` | `runLlmFeature`, `classifyEmailWithMeta`, `generateEmbedding(s)` |
| `runDecisionFeature` | runtime | `packages/intelligence/src/harness/run-decision-feature.ts` | `DecisionProvider` calls (JEV); `classifyEmailWithJev` uses `withGeneration` directly instead, same reason `classifyEmailWithMeta` does |
| `recordLlmCall` | runtime | `apps/api/src/lib/llm-logging.ts` | the `logger` every `runLlmFeature` call in `apps/api` passes |
| `retrieveTicketContext`, `findResolvedCases`, `findRelevantKb` | runtime | `apps/api/src/lib/ticket-context.ts` | reply suggestion, `/knowledge-context`, `/related-history` |
| `check-llm-feature` | agent script | `skills/kairo-llm-feature/scripts/check-llm-feature.ts` | `kairo-llm-feature` step 13; its own test keeps the repo clean |
| `export_feedback` | agent script | not built — contract below | `kairo-ai-evaluation`; the auto-approval recompute job |

### `runLlmFeature`

The single path for an LLM call from product code.

```ts
runLlmFeature<T>({
  feature,        // snake_case: llm_calls.feature and the Langfuse generation name
  promptId,       // directory under packages/intelligence/prompts/
  lang,           // the tenant's language (resolveTenantLanguage), never guessed
  vars,           // placeholder values; an unfilled placeholder throws before any model call
  schema,         // Zod schema; the provider validates the answer against it
  confidenceOf?,  // which answer field is stored as llm_calls.confidence_score (recorded, never decided on)
  options?, context?: { ticketId, accountId, userId },
  provider?,      // injection for tests and second opinions
  logger?,        // recordLlmCall in apps/api
}): Promise<{ data, prompt, promptVersion, model /* reported */, usage, latencyMs, llmCallId }>
```

`runLlmTextFeature` is the same without `schema`, returning text. `ProviderError` passes through unchanged; a missing template or unfilled placeholder is a non-retriable `LlmFeatureError`; a logging failure never throws. Retry, concurrency, derivation and gating stay with the caller.

### `retrieveTicketContext`

The single source of similar resolved tickets and KB articles, for prompts and the agent panel.

```ts
retrieveTicketContext({ ticketId, accountId, queryText, kbLimit?, casesLimit? })
  : Promise<{ kbArticles: KbArticle[]; resolvedCases: ResolvedCase[]; degraded: ContextDegradation[] }>
```

A ticket is resolved in any final state of `RESOLVED_STATUSES` (`ai_resolved` included); a match counts from `RELATED_CONTEXT_THRESHOLD`. KB articles are ranked matches only, with content, in rank order. Never throws: a failed source is listed in `degraded`, and resolved cases are still returned when the embedding service is down. `/similar` (grouping) and the escalation past-L2 check ask different questions and keep their own calls.

### `check-llm-feature`

```bash
bun skills/kairo-llm-feature/scripts/check-llm-feature.ts <files or dirs> | --all
```

Deterministic check of the `kairo-llm-feature` rules: regex JSON extraction, direct provider calls from `apps/`, prompt files read outside `packages/intelligence`, hand-opened Langfuse generations, hardcoded `model_version`, keyword language guessing, `llm_calls` written outside `llm-logging.ts`, tests that redefine the function they test, prompt directories missing a language or a version heading. Prints `path:line rule message`; exits 1 on any violation.

### `export_feedback` (contract)

Turns human-verified classifications into an eval dataset.

- Input: read-only query over `classification_feedback` rows with a corrected type and `ticket_proposals` confirmed through `POST /v1/tickets/:id/classify-approve`. Which statuses count as verified is a product decision made before implementation.
- Output: only under `scripts/eval/data/production/<run-date>/`; any other path is refused. `ground_truth.csv` in the English sheet schema (`email_id` as a sequential number, `ticket_type_final`, `priority_final`, `category_final`); `layers.csv` with the predicted type, the model's axes (from `ai_model_verdict`), provenance (from `ai_mail_facts` via `provenanceOf`) and the derivation, prompt and routing versions; a private `id_map.csv`. No subject, body, address or name.
- Errors: missing credentials, a path outside `scripts/eval/data/`, or zero rows exit non-zero. Rows without provenance are counted and reported, never guessed.
- `eval:attribute` gains an option to read provenance from `layers.csv` instead of `.eml` files.
- Tests: pure mapping functions with `Acme` fixtures; the path guard; no network.

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
