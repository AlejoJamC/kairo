---
name: kairo-ai-evaluation
description: Procedure for measuring Kairo's LLM pipeline and deciding whether a change is supported by evidence, using the offline harness in scripts/eval (eval:pipeline, eval:metrics, eval:matrix, eval:layered, eval:attribute, eval:ablation) and production signals (llm_calls, classification_feedback, Langfuse scores, ClickStack decision spans). Use when choosing a model, establishing a baseline for a new LLM feature, comparing before/after a prompt, routing or derivation change, attributing a wrong ticket_type to a layer, reading calibration or annotator agreement, or reporting quality, cost or latency.
---

# Evaluating Kairo's AI

## Hard rules

- Corpus files, ground truth, outputs and anything exported from production live only under `scripts/eval/data/` (a separate private repo, gitignored here). No email content, address, domain, name or identifier from them goes into code, tests, docs, commits, PRs or Linear. Refer to emails by number only, and only when unavoidable.
- **The labelled sheet is the specification.** Fit the rule, rubric or table to reproduce it. Never propose relabelling, and never turn annotator agreement into a gate; it is reported, not enforced.
- **The eval measures the model, not the system.** `eval:pipeline` and `eval:matrix` bypass the pre-filter on purpose so the model's answer is known even where static rules catch the message. Do not "fix" that. To measure the system in order, use `eval:layered`.
- Runs cost compute and time. Run an eval only when the user asks; otherwise plan the run and state the command.
- Do not re-measure an accepted decision (for example, business context on `backfill` vs `onboarding`, settled and enforced in `apps/api/src/lib/classifier-input.ts`).

## Pick the question, then the tool

| Question | Command | Reads |
|---|---|---|
| Which model / variant is best? | `bun run eval:matrix` | `EVAL_MODELS`, `EVAL_CORPUS`, `EVAL_MAX_MINUTES`, `EVAL_MAX_CALLS`, `EVAL_MATRIX_DRY=1` |
| One model, one stage | `bun run eval:pipeline` | `INTELLIGENCE_PROVIDER`, `OLLAMA_MODEL`/`ANTHROPIC_MODEL`, `EVAL_STAGE`, `EVAL_BUSINESS_CONTEXT`, `EVAL_TENANT_MAILBOX`, `EVAL_NO_CONTEXT=1` |
| Score a run against the sheet | `bun run eval:metrics [<run-dir>]` | the run directory |
| The whole pipeline, layer by layer (L1 facts → L2 routing → L3 model → L4 table) | `bun run eval:layered` | `EVAL_STAGE` (default `backfill`), `EVAL_OUTPUT_ROOT`, `EVAL_LAYERED_DRY=1` |
| Which layer made a wrong type? (no model call) | `bun run eval:attribute` | an existing layered run |
| Does the model use the context it gets? (no model call) | `bun run scripts/eval/compare_ablation.ts <run-slug>` (`eval:ablation`) | a full run and an `EVAL_NO_CONTEXT=1` run |

Entry points and flags are documented in `scripts/eval/README.md`; read it before a first run.

## Workflow

```
Evaluation progress:
- [ ] 1. Write the question and the decision it informs
- [ ] 2. Choose corpus and stage
- [ ] 3. Establish or locate the baseline
- [ ] 4. Run cleanly
- [ ] 5. Score and read the right number
- [ ] 6. Attribute errors to a layer
- [ ] 7. Decide: enough evidence or not
- [ ] 8. Report quality, cost and latency
```

**1. Question.** One sentence, plus which choice changes depending on the answer. If no choice changes, do not run.

**2. Corpus and stage.** `EVAL_CORPUS=main` (default) is a random window of the inbox and gives the verdict. `EVAL_CORPUS=coverage` is hand-picked edge cases: read it pass/fail per email, **never as a mean, never merged or averaged with `main`** (it would move the majority-class baseline). Match `EVAL_STAGE` to the production path being changed: `onboarding` = Tier 1 (raw body, 20k cap, no business context); `backfill` = everything else (quotes stripped, 2k cap, business context). Stage names and body rules are the same as `CLASSIFIER_BODY_RULES` in `apps/api/src/lib/classifier-input.ts`; if one changes, change `STAGE_BODY_RULES` in `scripts/eval/lib/run-label.ts` and both pinning tests.

**3. Baseline.** Every macro-F1 is read against the majority-class baseline `eval:metrics` prints; a model that does not beat it is excluded (`scripts/eval/lib/matrix.ts`). A change needs a before run on the same corpus, stage, model and prompt version; find it in `scripts/eval/data/output/` before running a new one. `scripts/eval` measures email classification only; for any other LLM feature, define its labelled set and baseline first (see [reference/new-feature-baseline.md](reference/new-feature-baseline.md)).

**4. Run cleanly.**
- One process per inference endpoint. Two runs sharing an endpoint double wall-clock latency; `eval:matrix` runs everything sequentially in one process for this reason. `eval:pipeline` checks the endpoint's `/api/ps` and warns when it is busy. Never publish latency from a run that warned.
- A non-default `OLLAMA_BASE_URL` gets its own run directory; latency across endpoints is not comparable.
- `eval:matrix` resumes from its ledger; Ctrl+C finishes the call in flight. `eval:matrix` and `eval:layered` refuse to overwrite an existing cell: archive it or set `EVAL_OUTPUT_ROOT`.
- Use a dry run (`EVAL_MATRIX_DRY=1`, `EVAL_LAYERED_DRY=1`) to check the plan before spending compute.

**5. Score.** The verdict is **macro-F1 over the emails whose `difficulty_final` is `easy`** in `main`. Read kappa, not raw agreement, in the annotator-agreement table. Self-reported `confidence` bands (`scripts/eval/lib/calibration.ts`) are descriptive only: confidence does not separate right from wrong, so no gate or recommendation may rest on it.

**6. Attribute.** A wrong `ticket_type` is the product of three coordinates. `eval:attribute` splits errors into L2 (routing withheld it), L3 (an axis was wrong) and L4 (no cell on that provenance row reaches the label — `table_gap` means the table is wrong, never the label). Only L3 is fixable in the rubric.

**7. Decide.** An intervention has enough evidence when the before/after moves the verdict on the same cell beyond the baseline gap and the change is explained by the layer it targeted. A single cell, a latency figure from a shared endpoint, a coverage mean, or a confidence band is not evidence.

**8. Report.** Quality (macro-F1 vs baseline, per-class where it moved), cost (tokens from `pipeline_output.csv` or `llm_calls`), latency (`processing_time_ms` from a clean run; compare throughput with `tokens_per_second`, not wall-clock). Name corpus, stage, model, endpoint and prompt/derivation/routing versions for every figure. Aggregates only; no email content.

## Production signals

For what production already records (corrections, abstain rate, proposal status, skip reasons, per-feature cost and latency) and how to query it, see [reference/production-signals.md](reference/production-signals.md). Setup of Langfuse and ClickStack is in `docs/observability.md`.
