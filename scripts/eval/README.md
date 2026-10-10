# AI evaluation

All remote evaluations use Vercel AI Gateway. Local Ollama is the only exception. Configure server credentials in the root `.env.local`; never put credentials in scripts, fixtures, output examples or chat.

## Synthetic Gateway validation

Remote checks call the configured Gateway models with the team's BYOK key. Gateway can fall back to system credentials when that key fails, and cannot be told not to; the credential type served each request appears in the Gateway request log and as a warning in the process output. They do not enable the assistant UI or access private data.

```sh
bun run test:gateway:contracts
bun run test:gateway
```

The smoke runner evaluates the configured classifier on five invented inputs per stage: onboarding, history and new mail. It uses the production input contract and reports each dimension, consequential errors, abstention/coverage, latency and Gateway-reported cost. Missing cost remains unknown; BYOK provider billing is not measured by Gateway's charge. This measures synthetic cases, not production calibration; no automation threshold is fitted. It does not access private data or mutate product records.

`test:gateway` starts from a synthetic email and runs ingestion, ticket persistence, decisions, retrieval and the AI SDK tool loop with real model responses and isolated storage/Gmail dependencies. It checks all three tools, knowledge drafts, pending proposals, rejected writes and degraded retrieval. Both commands verify BYOK on every inference, including intermediate tool steps, and stop if it cannot be verified. This is not a Supabase or Gmail network integration test. Bun loads the runtime environment; agents must not inspect or edit `.env.local`.

## Private evaluation

Customer inputs, labels, identifiers, logs and reports must stay under `scripts/eval/data/`, which is private and ignored by Git. Never copy them into tracked docs, tests, comments or external tools. Refer to an email only by numeric corpus position. A configured Gateway key does not authorize a private corpus run.

Existing runners retain their purposes:

- `run_pipeline_eval.ts`: configured classifier, with `EVAL_STAGE=onboarding|backfill|new_email`.
- `run_matrix_eval.ts`: model comparison. `EVAL_GATEWAY_MODELS` lists comma-separated language model IDs; `EVAL_DECISION_MODELS` lists native decision IDs. Each is evaluated separately per stage.
- `run_layered_eval.ts`: envelope facts, routing policy, model judgments and deterministic derivation.
- `compute_metrics.ts`: label metrics and calibration from private output.

Evaluate classification dimensions separately, consequential routing errors, abstention, automatic coverage, latency and reported cost. Keep native question versions, prompt versions and deterministic composition versions in the evaluation identity. Do not transfer a confidence threshold between models or stages without calibration evidence.

Compatibility checks and synthetic cases do not prove production accuracy. Validation of persistence recovery, degraded retrieval and conversational tools belongs in the application regression suite.
