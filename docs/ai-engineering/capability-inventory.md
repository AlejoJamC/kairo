# AI capabilities

Every place Kairo calls an LLM or an embedding model, or decides what reaches one or what happens to its answer. For each: where it lives, what kind of decision it is, and which Skill governs changes to it.

Skills: [`kairo-llm-feature`](../../skills/kairo-llm-feature/SKILL.md) (building or changing an LLM feature) and [`kairo-ai-evaluation`](../../skills/kairo-ai-evaluation/SKILL.md) (measuring it).

## Model calls

| Capability | Where | Decision | Human | Governed by |
|---|---|---|---|---|
| Email classification | `classifyEmailWithMeta` in `packages/intelligence/src/classification/classify.ts`; schema `ModelVerdictSchema` in `schema.ts`; rubric `packages/intelligence/prompts/email-classification/{es,en}.md` | Model answers two orthogonal axes plus priority, category, tone, urgency; structured output through `completeJSONWithMeta` | Proposal review, correction | `kairo-llm-feature`, `kairo-ai-evaluation` |
| Second-model ensemble | `resolveEnsembleTarget` in `packages/intelligence/src/config/ensemble.ts`; comparison in `classify.ts` | Disagreement on the derived type sets `abstain`; a failed second model is not a disagreement | `abstain` always waits for a person | `kairo-llm-feature` → selective automation |
| Reply suggestion | `suggestReply` in `apps/api/src/lib/reply-suggestion.ts` (tenant language, shared retrieval, `runLlmFeature`); routes `POST /v1/tickets/:id/suggest-reply` and `PATCH …/suggest-reply/:llmCallId/outcome` in `apps/api/src/routes/v1/tickets.ts`; prompts `packages/intelligence/prompts/reply-suggestion/{es,en}.md` | Structured draft (`ReplySuggestionSchema`) | Agent accepts, edits or rejects | `kairo-llm-feature` |
| LLM feature harness | `runLlmFeature`, `runLlmTextFeature`, `withGeneration`, `loadPromptTemplate` in `packages/intelligence/src/harness/`; logger `recordLlmCall` in `apps/api/src/lib/llm-logging.ts` | Versioned prompt, schema-validated answer, Langfuse generation, `llm_calls` row | — | `kairo-llm-feature` step 7 |
| Embeddings | `generateEmbedding`, `generateEmbeddings` in `packages/intelligence/src/embeddings/embed.ts`; writers `apps/api/src/lib/ticket-embedding.ts`, `apps/api/src/lib/kb-embedding.ts` | Vectors for tickets and KB articles | None | `kairo-llm-feature` |
| Retrieval | `retrieveTicketContext`, `findResolvedCases`, `findRelevantKb` in `apps/api/src/lib/ticket-context.ts` (RPCs `find_similar_tickets`, `find_relevant_kb`); consumed by reply suggestion, `/related-history`, `/knowledge-context`. `/similar` and escalation past-L2 call the RPC for other questions | Similar resolved tickets and relevant KB articles | Agent reads the panel | `kairo-llm-feature` step 6 |

## Deterministic layers around the model

| Capability | Where | Governed by |
|---|---|---|
| Envelope facts stated to the model; unknown facts omitted | `extractMailFacts` in `apps/api/src/lib/email/mail-facts.ts`; `renderFacts` in `packages/intelligence/src/classification/prompt.ts` | `kairo-llm-feature` step 5 |
| Routing before any model | `resolveRoute`, `ROUTING_POLICY_VERSION` in `apps/api/src/lib/email/routing-policy.ts`; `preFilterEmail` in `pre-filter.ts` | `kairo-llm-feature` → decision layers |
| `ticket_type` derivation | `TYPE_DERIVATION`, `DERIVATION_VERSION`, `reachableTypes` in `packages/intelligence/src/classification/derive.ts` | `kairo-llm-feature` → decision layers |
| Input contract per stage | `CLASSIFIER_BODY_RULES`, `buildClassifierBody`, `classifierEnvelope`, `resolveClassifierContext` in `apps/api/src/lib/classifier-input.ts` | `kairo-llm-feature` step 5 |
| Proposal gates | `tier1ProposalDecision`, `backfillProposalDecision`, `autoApprovedTypes` in `apps/api/src/functions/pipeline/{tier1,backfill}-proposal-status.ts`; table `ticket_type_auto_approval` | `kairo-llm-feature` → selective automation |
| Correction capture | `POST /v1/tickets/:id/correct-classification` in `tickets.ts`; `feedbackAudit` in `apps/api/src/lib/classification-audit.ts`; `sendTypeCorrectionScore` in `apps/api/src/lib/langfuse-scores.ts` | `kairo-llm-feature` step 11 |
| Decision provenance | `routingAudit`, `classificationAudit`, `feedbackAudit` in `classification-audit.ts`; conventions in `docs/versioning.md` | `kairo-llm-feature` step 8 |
| Observability | Langfuse generation through `withGeneration` (harness), used by `runLlmFeature`, `classify.ts` and `embed.ts`; `logLlmCall` / `recordLlmCall` in `apps/api/src/lib/llm-logging.ts`, written by every classification path including the Gmail poll; `recordDecision` in `apps/api/src/lib/decision-telemetry.ts`; guide `packages/intelligence/OBSERVABILITY.md` | `kairo-llm-feature` step 9, `kairo-ai-evaluation` → production signals |
| Resilience | `ProviderError` in `packages/intelligence/src/providers/base.ts`; `withRetry` in `apps/api/src/lib/retry.ts`; `createCircuitBreaker`; `createSemaphore`; `recordClassificationFailure` in `classification-outcome.ts`; `classificationRetrySweep` | `kairo-llm-feature` step 10 |

## Product logic with no model

Not governed by an AI Skill: changes to these are product decisions.

| Capability | Where |
|---|---|
| Escalation triggers and recommended level | `detectEscalationTriggers` in `packages/intelligence/src/escalation/detect.ts`; `POST /v1/tickets/:id/escalation-reasons`. Its `confidence` is a severity-weighted score, unrelated to the model's self-reported `confidence` |
| Priority score | `computePriorityScore` in `apps/api/src/lib/scoring.ts` (tenant-configurable weights) |
| Contact extraction, heuristic pass | `contactExtraction` in `apps/api/src/functions/contact-extraction/extract.ts`, behind `enable_contact_extraction`. An LLM pass over signatures is a future feature built with `kairo-llm-feature` |
| Assistant panel | `apps/dashboard/src/components/triage/AssistantPanel.tsx` renders scripted answers; its backend is a future feature built with `kairo-llm-feature` |

## Evaluation

| Entry point | Answers |
|---|---|
| `bun run eval:pipeline` | one model, one stage |
| `bun run eval:metrics` | macro-F1 against the labelled sheet, majority-class baseline, calibration bands, annotator agreement |
| `bun run eval:matrix` | which model and variant, in one process, resumable |
| `bun run eval:layered` | the pipeline layer by layer, with routing |
| `bun run eval:attribute` | which layer produced a wrong type |
| `bun run eval:ablation` | whether the model uses the context it is given |

Procedure: `kairo-ai-evaluation`. Data lives only in `scripts/eval/data/`.
