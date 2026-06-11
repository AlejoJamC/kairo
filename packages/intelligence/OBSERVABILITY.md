# Kairo Intelligence — LLM Observability Guide

Every prompt that Kairo sends to an LLM should be recorded in `llm_calls`. This enables quality monitoring, fine-tuning dataset construction, and A/B testing of prompt versions — the same pattern used by leading AI-native companies to continuously improve model behavior from production data.

---

## Why log every call

| Goal | How llm_calls enables it |
|---|---|
| Detect regressions | Compare `confidence_score` and `outcome` distributions across `prompt_version` |
| Build fine-tuning datasets | `prompt_text` + `response_text` + `outcome = 'accepted'` = labeled training pairs |
| Measure real accuracy | Join `llm_calls` with `categorization_feedback` to get human-verified ground truth |
| Cost tracking | `prompt_tokens + completion_tokens` per `feature` per day |
| A/B prompt testing | Same `feature`, different `prompt_version` → compare `outcome` rates |

The offline eval scripts in `scripts/eval/` currently use synthetic `.eml` files. Once `llm_calls` has production data, feed it there instead — real distribution beats synthetic data every time.

---

## How to instrument a new LLM call site

`@kairo/intelligence` providers expose `completeWithMeta()` / `completeJSONWithMeta()`
in addition to the original `complete()` / `completeJSON()`. The `*WithMeta` variants
return `{ text | data, rawText, model, usage: { promptTokens, completionTokens } }`,
which is exactly the shape `llm_calls` needs — use them for any new instrumented call
site. For email classification, use `classifyEmailWithMeta()`, which additionally
returns the resolved `prompt` and `promptVersion`.

Use the shared `logLlmCall()` helper (`apps/api/src/lib/llm-logging.ts`) — it is
fire-and-forget, skips inserts when `NODE_ENV === "test"`, and maps to the real
`llm_calls` columns (note: `triggered_by_user_id`, NOT `user_id`):

```typescript
import { classifyEmailWithMeta } from "@kairo/intelligence";
import { logLlmCall } from "../lib/llm-logging.js";
import { resolveModelVersion } from "../lib/model-version.js";

const start = Date.now();
try {
  const { result, meta, prompt, promptVersion } = await classifyEmailWithMeta({
    subject, body, from,
  });

  logLlmCall({
    feature: "email_classification",     // snake_case feature name
    model: meta.model,
    promptVersion,                        // from prompt file heading, or null
    promptText: prompt,
    responseText: meta.rawText,
    promptTokens: meta.usage.promptTokens,
    completionTokens: meta.usage.completionTokens,
    confidenceScore: result.confidence,
    latencyMs: Date.now() - start,
    triggeredByUserId: userId,            // null if not yet known
    accountId,
    ticketId: ticketId ?? null,           // null if not yet known
  });
} catch (err) {
  logLlmCall({
    feature: "email_classification",
    model: resolveModelVersion(),
    promptText: `${from} | ${subject}`,
    latencyMs: Date.now() - start,
    errorCode: "LLM_ERROR",
    errorDetail: err instanceof Error ? err.message : String(err),
    triggeredByUserId: userId,
    accountId,
  });
}
```

For a raw `complete()`-style call (e.g. reply suggestion), use
`provider.completeWithMeta(prompt, options)` the same way — `meta.rawText`,
`meta.model`, and `meta.usage` come straight from the provider response
(Ollama: `prompt_eval_count` / `eval_count`; Anthropic: `usage.input_tokens` /
`usage.output_tokens`).

**Rules:**
- Log is fire-and-forget (`logLlmCall` never throws/blocks) — a logging failure must NEVER fail the user request
- The one exception is `reply_suggestion`'s `suggest-reply` endpoint, which does an **awaited** insert into `llm_calls` (still wrapped in try/catch) so it can return `llm_call_id` to the client for outcome writeback
- Always capture `latency_ms` — it's the most actionable signal for cost/perf
- Always set `feature` to a stable snake_case identifier — this is the grouping key for all analysis
- Always set `prompt_version` from the prompt file's heading/frontmatter (`extractPromptVersion()` / `getPromptVersion()`) — without this, regression analysis is impossible

---

## Writing back the agent outcome

When the agent accepts, edits, or rejects a suggestion, record it via:

```
PATCH /v1/tickets/:id/suggest-reply/:llmCallId/outcome
Body: { "outcome": "accepted" }   // 'accepted' | 'edited' | 'rejected' | 'ignored' | 'auto_applied'
```

This validates `outcome` against the enum, and updates `llm_calls` setting
`outcome` + `outcome_recorded_at = new Date().toISOString()` scoped to
`id = :llmCallId AND account_id = ctx.accountId` (tenant-scoped). Returns 400
on an invalid outcome value, 404 if no row matched.

The `llm_call_id` is returned from `POST /v1/tickets/:id/suggest-reply` and
should be stored client-side until the agent acts on the suggestion.

---

## Feature naming convention

| Feature | `feature` value |
|---|---|
| Email classification (pipeline) | `email_classification` |
| Reply suggestion | `reply_suggestion` |
| KB article search | `kb_search` |
| Ticket summarization | `summarization` |
| Resolution summary | `resolution_summary` |
| Any future feature | `snake_case_feature_name` |

---

## Prompt versioning

Every prompt file should carry a version in its frontmatter (or first comment line). Use semver:

```markdown
# Reply Suggestion Prompt (ES) — v1.0.0
```

Bump `PATCH` for wording fixes, `MINOR` for structural changes, `MAJOR` for intent changes. Always update `prompt_version` in the call site when bumping.

---

## Querying the data

**Acceptance rate by feature and prompt version:**
```sql
SELECT feature, prompt_version, outcome, COUNT(*)
FROM llm_calls
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY feature, prompt_version, outcome
ORDER BY feature, prompt_version, outcome;
```

**Average confidence by outcome (calibration check):**
```sql
SELECT outcome, AVG(confidence_score), COUNT(*)
FROM llm_calls
WHERE outcome IS NOT NULL
GROUP BY outcome;
```

**Build fine-tuning dataset (accepted suggestions):**
```sql
SELECT prompt_text, response_text
FROM llm_calls
WHERE feature = 'reply_suggestion'
  AND outcome = 'accepted'
  AND response_text IS NOT NULL
ORDER BY created_at DESC;
```

**Token cost by model (last 30 days):**
```sql
SELECT model, SUM(prompt_tokens) AS total_prompt, SUM(completion_tokens) AS total_completion
FROM llm_calls
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY model;
```

---

## What NOT to store

- Do not store PII beyond what's already in the ticket (no raw email bodies unless already in `messages`)
- Do not log embedding vectors in this table — those stay in the pgvector columns
- Do not log health-check or test calls — gate on `NODE_ENV !== 'test'`

---

## Current status

| Call site | Instrumented |
|---|---|
| `email_classification` — pipeline tier1 (`functions/pipeline/tier1-fast-path.ts`) | ✅ done (KAI-110) |
| `email_classification` — pipeline tier2 (`functions/pipeline/tier2-background.ts`) | ✅ done (KAI-110) |
| `email_classification` — pipeline tier3 (`functions/pipeline/tier3-deferred.ts`) | ✅ done (KAI-110) |
| `email_classification` — incremental sync (`functions/pipeline/incremental-sync.ts`) | ✅ done (KAI-110) |
| `email_classification` — batch classify (`functions/batch-classify.ts`) | ✅ done (KAI-110) |
| `email_classification` — manual classify (`routes/v1/tickets.ts` `POST /:id/classify`, `POST /classify-batch`) | ✅ done (KAI-110) |
| `reply_suggestion` (KAI-31, `routes/v1/tickets.ts` `POST /:id/suggest-reply`) | ✅ done (KAI-110) — `llm_call_id` returned to client; outcome writeback via `PATCH /:id/suggest-reply/:llmCallId/outcome` |
| `kb_search` | ⏳ not built yet (ADR-012 pending) |
| `resolution_summary` | ⏳ pending |

Table exists and is now actively populated by the call sites above.
