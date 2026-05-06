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

Every call to `createCompletionProvider().complete()` or `completeJSON()` should be wrapped like this:

```typescript
import { supabase } from "../lib/supabase.js";
import { createCompletionProvider } from "@kairo/intelligence";
import { resolveModelVersion } from "../lib/model-version.js";

const provider = createCompletionProvider();
const start = Date.now();
let responseText: string | null = null;
let errorCode: string | null = null;
let errorDetail: string | null = null;

try {
  responseText = await provider.complete(prompt, { maxTokens: 1500 });
} catch (err) {
  errorCode = "LLM_ERROR";
  errorDetail = err instanceof Error ? err.message : String(err);
}

// Log — fire and forget, never block the primary action
supabase.from("llm_calls").insert({
  user_id: userId,
  ticket_id: ticketId,
  feature: "reply_suggestion",          // snake_case feature name
  provider: process.env["INTELLIGENCE_PROVIDER"] ?? "ollama",
  model: resolveModelVersion(),
  prompt_version: "1.0.0",              // from prompt frontmatter
  prompt_text: prompt,
  response_text: responseText,
  confidence_score: parsedConfidence,   // null if not available
  latency_ms: Date.now() - start,
  error_code: errorCode,
  error_detail: errorDetail,
}).then(({ error }) => {
  if (error) console.error("[llm_calls] log failed", error.message);
});
```

**Rules:**
- Log is fire-and-forget — a logging failure must NEVER fail the user request
- Always capture `latency_ms` — it's the most actionable signal for cost/perf
- Always set `feature` to a stable snake_case identifier — this is the grouping key for all analysis
- Always set `prompt_version` from the prompt file's frontmatter — without this, regression analysis is impossible

---

## Writing back the agent outcome

When the agent accepts, edits, or rejects a suggestion, record it:

```typescript
await supabase
  .from("llm_calls")
  .update({
    outcome: "accepted",            // 'accepted' | 'edited' | 'rejected' | 'ignored' | 'auto_applied'
    outcome_recorded_at: new Date().toISOString(),
  })
  .eq("id", llmCallId);
```

The `llm_call_id` should be returned from the suggestion endpoint and stored client-side until the agent acts.

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
| `email_classification` (pipeline tier1/2/3) | ⏳ pending |
| `reply_suggestion` (KAI-31) | ⏳ pending — `llm_call_id` not yet returned to client |
| `kb_search` | ⏳ not built yet (ADR-012 pending) |
| `resolution_summary` | ⏳ pending |

Table exists. Instrumentation is the next step per feature as they are built or revisited.
