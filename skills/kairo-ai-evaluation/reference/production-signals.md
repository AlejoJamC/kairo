# Production signals

What production already records about AI decisions, and how to read it. Every row is customer data: query read-only, keep results in the conversation or under `scripts/eval/data/`, and write only aggregates anywhere else.

## Contents

- Where each signal lives
- Postgres recipes
- Langfuse and ClickStack

## Where each signal lives

| Signal | Store | Written by |
|---|---|---|
| Route and skip reason per message | `messages.skip_reason`, `messages.mail_facts`, `messages.routing_policy_version`; span `email.route` | `preFilterEmail` (`apps/api/src/lib/email/pre-filter.ts`), `routingAudit` |
| Tenant context degradations | span `classifier.context` (events `support_channels_unreadable`, `accounts_unreadable`, `unsupported_language`) | `resolveClassifierContext` |
| Model axes, versions, abstain | `tickets.model_verdict`, `tickets.derivation_version`, `tickets.prompt_version`, `tickets.abstain` | `classificationAudit` |
| Proposal outcome of the gate | `ticket_proposals.status`; span `ticket.proposal_status` with `kairo.proposal.reason` | `*-proposal-status.ts` |
| Human correction | `classification_feedback` (`ai_*` = what was rejected, incl. `ai_model_verdict`, `ai_derivation_version`, `ai_prompt_version`, `ai_routing_policy_version`; `correct_*` = the answer); span `ticket.correction`; Langfuse score `ticket_type_correction` | `POST /v1/tickets/:id/correct-classification` |
| Cost, latency, errors per call | `llm_calls` (`feature`, `model`, `prompt_version`, `prompt_tokens`, `completion_tokens`, `latency_ms`, `error_code`) | `logLlmCall`; inline insert in suggest-reply |
| Reply outcome | `llm_calls.outcome`, `outcome_recorded_at` | `PATCH /v1/tickets/:id/suggest-reply/:llmCallId/outcome` |
| Classification failures | `messages.classification_status` (`failed`, `failed_permanent`), `classification_attempt_count` | `recordClassificationFailure` |

Before comparing `llm_calls` counts with ticket counts, check that every classification path writes an `llm_calls` row (grep `logLlmCall` against the callers of `classifyEmailWithMeta`, including injected ones such as `apps/api/src/lib/gmail-poll/deps.ts`).

## Postgres recipes

Type corrections by what was rejected and the versions that produced it:

```sql
select ai_ticket_type, correct_ticket_type, ai_derivation_version, ai_prompt_version, count(*)
from classification_feedback
where correct_ticket_type is not null and correct_ticket_type <> ai_ticket_type
group by 1, 2, 3, 4 order by 5 desc;
```

Abstain rate per version:

```sql
select derivation_version, prompt_version, avg(abstain::int) as abstain_rate, count(*)
from tickets where classified_at is not null
group by 1, 2;
```

Skip reasons per routing policy version:

```sql
select routing_policy_version, coalesce(skip_reason, 'classified') as route, count(*)
from messages group by 1, 2 order by 1, 3 desc;
```

Cost and latency per feature and prompt version:

```sql
select feature, model, prompt_version, count(*),
       percentile_cont(0.5) within group (order by latency_ms) as p50_ms,
       sum(prompt_tokens) as in_tokens, sum(completion_tokens) as out_tokens,
       avg((error_code is not null)::int) as error_rate
from llm_calls group by 1, 2, 3;
```

Add `where account_id = '<uuid>'` for a single tenant; never paste the resulting identifiers into a file.

## Langfuse and ClickStack

- Langfuse: generations are named `email-classification`, `suggest-reply`, `embedding`, `embedding-batch`, grouped by `sessionId = ticketId` with `accountId` in metadata. The correction score is categorical, valued with the corrected type, versions in metadata. Dashboards are defined in `scripts/observability/langfuse-dashboards.ts`.
- ClickStack: spans `email.route`, `classifier.context`, `ticket.proposal_status`, `ticket.correction` from tracer `kairo-api`, attributes prefixed `kairo.`; dashboard in `scripts/observability/hyperdx-dashboard.ts`. Setup: `docs/observability.md`.
