---
name: kairo-llm-feature
description: Step-by-step procedure for adding or changing any LLM- or embedding-backed feature in Kairo (email classification, reply suggestion, assistant draft, summarisation, knowledge search, LLM contact extraction), including changes to its prompt, the routing policy, the ticket_type derivation table or a proposal gate. Use when a task adds a model call, edits packages/intelligence/prompts, touches routing-policy.ts, derive.ts, a *-proposal-status.ts gate, llm_calls logging or Langfuse instrumentation, or decides whether a model output may act without a person.
---

# Building an LLM feature in Kairo

## Hard rules

- **Customer and eval data never leave `scripts/eval/data/`.** Fixtures, prompts, tests, comments and PR text use only `Acme`, `acme.com`, `support@acme.com`, `client@outside.com`. Refer to corpus emails by number only.
- `packages/intelligence/` is an architecture boundary (`PROJECT.md`): change it only when the task explicitly says so.
- A migration is written and tested locally; nothing reaches the remote database (`supabase db push`, `db dump`, `gen types`) before the change is approved for commit.
- A new feature ships behind a default-off server flag (`packages/feature-flags/src/flags.ts`, pattern of `enable_contact_extraction`).

## Workflow

Copy this checklist into the task and tick it off:

```
LLM feature progress:
- [ ] 0. Inventory what already exists
- [ ] 1. Decide whether a model is needed at all
- [ ] 2. Decompose: model answers, code derives
- [ ] 3. Prompt as a versioned es/en artifact
- [ ] 4. Schema-first structured output
- [ ] 5. One input-contract module; tenant context; stated facts
- [ ] 6. Retrieval through the shared function
- [ ] 7. Call through the harness
- [ ] 8. Provenance on every stored decision
- [ ] 9. Telemetry
- [ ] 10. Resilience
- [ ] 11. Human in the loop and the automation gate
- [ ] 12. Evaluate before shipping
- [ ] 13. Validator, tests, typecheck
```

### 0. Inventory what already exists

Before writing a loader, a heuristic, an RPC call or a TODO saying something "is not implemented", search for it:

```bash
grep -rn "rpc(\"find_" apps/api/src
grep -rn "export" packages/intelligence/src/index.ts
ls packages/intelligence/prompts apps/api/src/lib
```

A TODO that claims a capability is missing must be checked against this search. Reuse beats a second copy.

### 1. Is a model needed?

Use the cheapest reliable signal first. Headers, flags, a regex or a lookup that is right on every case it fires on goes **before** the model and decides alone — see `resolveRoute` in `apps/api/src/lib/email/routing-policy.ts` (provider spam verdict first) and contact extraction's heuristic Pass A in `apps/api/src/functions/contact-extraction/extract.ts`. The model only sees what the cheap layer cannot settle.

### 2. Decompose

Ask the model questions it answers well and that are independent of each other; derive the product label in code from a versioned table. Reference: `ModelVerdictSchema` (two orthogonal axes) in `packages/intelligence/src/classification/schema.ts` and `TYPE_DERIVATION` in `packages/intelligence/src/classification/derive.ts`. A derived label is auditable: a wrong one can be attributed to the model's answer or to the table.

### 3. Prompt artifact

- Path: `packages/intelligence/prompts/<feature>/{es,en}.md`. Never inline a prompt in a route.
- First heading carries the version: `# <Title> (ES) — v1.0.0`; read it with `extractPromptVersion()`.
- Version rule is **X.Y.Z, not semver**: X frozen at 1; Y = a block rewritten whole or a field the model stops answering; Z = everything else, including edits that move labels. Full rule: `packages/intelligence/prompts/README.md`. Ignore the semver note in `packages/intelligence/OBSERVABILITY.md`; the README wins.
- Extend `packages/intelligence/src/classification/prompt-parity.test.ts` (or a sibling test) so both languages share headings, placeholders, enum values and version.

### 4. Schema-first structured output

Define a Zod schema; call `provider.completeJSONWithMeta(prompt, schema, options)`. Providers compile it into a decoding grammar, and a schema failure surfaces as a non-retriable `ProviderError`. **Never** extract JSON with a regex over `rawText`. Enum values are stable English IDs imported from `@kairo/types`, whatever the prompt language.

### 5. Input contract and tenant context

- One module decides everything that reaches the model for this feature (body cap, quote stripping, which context fields per stage). Model: `apps/api/src/lib/classifier-input.ts`. If the feature has stages, use the eval's stage names (`scripts/eval/lib/run-label.ts`) so a measured cell and a production path share a name.
- Language is the tenant's: `resolveTenantLanguage(accountId)` in `classifier-input.ts`, the same resolution the classifier uses. Never guessed from keywords.
- State verified facts; **omit** unknown ones instead of rendering them as negatives or `N/A`; mark missing inputs with the `(no disponible)` convention (`packages/intelligence/src/classification/prompt.ts`, `renderFacts`).
- Resolve per-account context once per batch or request, not per item.

### 6. Retrieval

Similar resolved tickets and KB articles come from `apps/api/src/lib/ticket-context.ts`: `retrieveTicketContext` for both, `findResolvedCases` or `findRelevantKb` for one. Never call `supabase.rpc("find_similar_tickets" | "find_relevant_kb")` directly for LLM or panel context: the module holds the one threshold (`RELATED_CONTEXT_THRESHOLD`) and the one status filter (every final state in `RESOLVED_STATUSES`, `ai_resolved` included). A model only receives ranked matches; an unranked "latest articles" list is a panel fallback. Reference consumer: `apps/api/src/lib/reply-suggestion.ts`.

### 7. Call through the harness

Every model call goes through `runLlmFeature` (structured answer) or `runLlmTextFeature` (free text) from `@kairo/intelligence` (`packages/intelligence/src/harness/`). Pass `logger: recordLlmCall` from `apps/api/src/lib/llm-logging.ts`. The harness loads the versioned prompt, fails on an unfilled placeholder, validates the answer against the schema, opens one Langfuse generation under `sessionId = ticketId`, writes one `llm_calls` row on success and on failure, and returns the model the provider reported and the row id for outcome writeback.

```ts
const result = await runLlmFeature({
  feature: "reply_suggestion", promptId: "reply-suggestion", lang, vars,
  schema: ReplySuggestionSchema,
  context: { ticketId, accountId, userId },
  logger: recordLlmCall,
});
```

Do not open Langfuse generations, read prompt files or insert into `llm_calls` by hand in `apps/`. Classification keeps `classifyEmailWithMeta`, which shares the harness's generation wrapper and template loader. Keep the feature's logic in a `lib/` module with injectable dependencies; the route only maps the result to HTTP.

### 8. Provenance

Every stored AI decision records what produced it: `prompt_version`, the model **the provider reported** (`result.model` / `meta.model`), and any decision-layer version it passed through. Build the columns in one helper, as `classificationAudit` / `routingAudit` / `feedbackAudit` do in `apps/api/src/lib/classification-audit.ts`. Never write `resolveModelVersion()` (`apps/api/src/lib/model-version.ts`) into a new column: it is a hardcoded id, not the model that answered.

### 9. Telemetry

- Langfuse: generation per call, grouped by `sessionId = ticketId` (step 7).
- `llm_calls.feature`: a stable snake_case name from the table in `packages/intelligence/OBSERVABILITY.md`; add a row there for a new feature.
- A deterministic decision (a route, a gate, a correction) gets an OTel span through `recordDecision` with a pure attribute builder in `apps/api/src/lib/decision-telemetry.ts`. **No address, domain or message text in attributes**: enums, flags, counts and versions only.

### 10. Resilience

- Providers throw `ProviderError{retriable, retryAfterMs}` (`packages/intelligence/src/providers/base.ts`); the harness passes it through unchanged. Keep the distinction up to the response: retriable → 503 with `retryable: true`, anything else → 500 (see `POST /:id/suggest-reply`). A harness misuse throws `LlmFeatureError` (non-retriable).
- Batch paths wrap the call in `withRetry(semaphore, fn)` from `apps/api/src/lib/retry.ts` and a per-run `createCircuitBreaker`, and persist failures with `recordClassificationFailure`-style status (`failed` / `failed_permanent`).
- A request path (a user waiting) does not retry with multi-second backoff; it degrades per missing context source and fails only when the model call fails.

### 11. Human in the loop and the automation gate

Model output is stored as a **proposal**, and the person's reaction is captured: a correction endpoint with a provenance snapshot (`POST /:id/correct-classification`) or an outcome writeback (`PATCH /:id/suggest-reply/:llmCallId/outcome`). Wire the client call in the same change; an outcome column nothing writes is not feedback.

If any output may act without a person (auto-approve, auto-send, auto-promote), follow [reference/selective-automation.md](reference/selective-automation.md).

### 12. Evaluate before shipping

A new feature needs a baseline and a corpus before its prompt is tuned; a change to an existing one needs a before/after on the same cell. Follow `skills/kairo-ai-evaluation/SKILL.md`. Do not run evals the user did not ask for.

### 13. Validate, test, typecheck

Run the validator over the files you touched and fix every violation before finishing:

```bash
bun skills/kairo-llm-feature/scripts/check-llm-feature.ts <changed files or dirs>
```

It fails on: JSON extracted with a regex, a model called directly from `apps/`, a prompt file read outside `packages/intelligence`, a hand-opened Langfuse generation, a hardcoded model stored as `model_version`, a keyword language guess, `llm_calls` written outside `llm-logging.ts`, a test that redefines the function it tests, and a prompt directory missing a language or a version heading. `--all` checks the whole repo; it must stay clean. Re-run until it prints `OK`.

- Default-off flag for a new feature (Hard rules).
- Tests import the real exported function.
- `bun test`; `bunx tsc --noEmit -p apps/api/tsconfig.json` and `-p packages/intelligence/tsconfig.json` after changes there; after any `apps/dashboard/` change also `turbo run typecheck --filter=@kairo/dashboard`.

## Changing a decision layer

Editing the classification prompt, `ROUTING_POLICY_VERSION`/`resolveRoute`, `TYPE_DERIVATION`/`DERIVATION_VERSION` or a proposal gate: follow [reference/decision-layers.md](reference/decision-layers.md) for which version moves, which tests guard it and what gets persisted.
