# Intelligence prompts

Versioned instructions in `<prompt-id>/en.md` and `<prompt-id>/es.md`. Model selection belongs to [model roles](../src/config/model-roles.ts), independently of prompt versions.

## Classification contracts

[buildPrompt](../src/classification/prompt.ts) combines `email-classification/` with the contract selected by the message stage:

- `onboarding_triage/`: initial inbox reading, available evidence and missing information.
- `historical_learning/`: historical message classification for ingestion; conversation learning runs separately.
- `incoming_email_decision/`: classification of new mail with available case context.
- `message_triage/`: manual or unspecified-stage classification without assuming an incoming-event context.

Message classification asks only message-level questions. Conversation-level outcome, learning and next-action questions are selected separately by [workflow-contract.ts](../src/classification/workflow-contract.ts).

Backfill classification uses shared priority and urgency criteria from [historical-attention.ts](../src/classification/historical-attention.ts). These remain independent axes; uncertainty records missing evidence instead of forcing escalation. The initial-reading rubric is unchanged.

## Analysis and generation

- `historical-analysis/`: reconstruct conversation evidence, attempted actions and confirmed outcomes. Role: `evidence_analysis`.
- `incoming-analysis/`: identify changes, remaining requests and affected decisions. Role: `evidence_analysis`.
- `knowledge-impact/`: assess an approved knowledge version against a ticket. Role: `evidence_analysis`.
- `incoming-decision/`: structured incoming-case judgments when classification uses a language model. Role: `classification`.
- `email-knowledge/`: propose reusable business facts, rules, exceptions and articles from available evidence. Role: `knowledge_draft`.
- `historical-knowledge/`: historical extraction instructions composed with `email-knowledge/` by the loader. Role: `knowledge_draft`.
- `historical-knowledge-references/`: Tier 2 proposals select source fragment IDs. Code resolves original text before semantic validation. Role: `knowledge_draft`.
- `knowledge-draft/`: draft an article from a resolved ticket selected by the knowledge-candidate workflow. Role: `knowledge_draft`.
- `reply-suggestion/`: draft a response from current case context and approved knowledge. Role: `reply`.
- `ticket-assistant/`: conversational tool use for inspecting tickets and proposing actions. Role: `assistant`.

## Native decision questions

Typed decision models receive questions and criteria defined in code:

- [decision-questions.ts](../src/classification/decision-questions.ts): classification axes, priority, category, tone and urgency.
- [workflow-contract.ts](../src/classification/workflow-contract.ts): questions selected by stage and message/case scope; knowledge relevance.
- [email-knowledge.ts](../src/knowledge/email-knowledge.ts): candidate selection and novelty, support and conflict validation. Roles: `knowledge_decision` and `validation`.
- [decision.ts](../src/knowledge/decision.ts): resolved-ticket knowledge candidate selection. Role: `knowledge_decision`.

These criteria are written in English. Language classification uses the EN/ES markdown plus the selected workflow questions. Allowed classification identifiers and schemas come from code, not YAML frontmatter.

## Loading and versions

- [loadPromptTemplate](../src/harness/template.ts) loads and caches the requested language; a missing file is an error, with no language fallback.
- Versions are read from a heading such as `# Prompt name — v1.0.0`. YAML frontmatter is not required.
- `{{variable}}` placeholders receive runtime values. `fillTemplate` rejects missing variables.
- Historical extraction records both the historical and shared knowledge prompt versions.
- Classification records the base prompt, selected contract and workflow-question versions. Native decisions also record state/question versions.

Prompt versions use `1.Y.Z`, with `1` fixed. Increment `Y` and reset `Z` for a whole-block replacement or removal of a model output field/class. Increment `Z` for rules, thresholds, definitions, wording and ordering changes. Keep EN/ES versions aligned; update the corresponding version constants when changing native criteria.

## Checks

From the repository root, without model calls:

```sh
bun test packages/intelligence/src/classification/prompt-parity.test.ts packages/intelligence/src/classification/workflow-contract.test.ts
```

For model-based quality checks, use the [evaluation runners](../../../evals/README.md). Corpus data and results stay in their existing private location.
