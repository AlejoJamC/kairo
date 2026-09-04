# Kairo Pipeline Eval — KAI-106

Runs 50 raw `.eml` files through the Kairo email classification pipeline and
writes a structured CSV with the pipeline's predictions. Used as input to the
KAI-97 evaluation framework for comparison against human ground truth.

## Prerequisites

- `ANTHROPIC_API_KEY` set in `.env` (root of monorepo), or
- `INTELLIGENCE_PROVIDER=ollama` with an Ollama endpoint reachable

### Choosing where inference runs

Open-weight models are not a local-only category. `OLLAMA_BASE_URL` points the
run at any Ollama-compatible endpoint; it defaults to `http://localhost:11434`,
which is the development runtime, not a constraint.

```bash
OLLAMA_BASE_URL=https://gpu.internal:11434 \
INTELLIGENCE_PROVIDER=ollama OLLAMA_MODEL=granite4.2:30b bun run eval:pipeline
```

A non-default endpoint gets its own run directory (`…-at-<host>`), because the
same model on a laptop and on a remote GPU produces latency figures that are
not comparable. The endpoint is also written on every output row.

### Two runs against one endpoint

Starting a second run against an endpoint already serving a model does not
fail — the two runs **share** it. Both then measure an endpoint serving two
clients: wall-clock latency roughly doubles while the model is unchanged.
Measured on this corpus, `granite4.2:30b` reports ~22 s/email alone and ~57 s
when two runs overlap.

The runner checks `/api/ps` at start and prints a warning when the endpoint is
already busy. It does not block: sharing an endpoint is fine when only quality
is being measured, since F1 is unaffected. **Do not publish latency from a run
that carried that warning.** The `tokens_per_second` column comes from the
provider's own generation timer and is the figure to compare across runs —
unlike wall-clock, a drop in it is a real throughput signal.

## Where the business context comes from

`{{business_context}}` — "what does this company do" — is the block the rubric
names as what separates `support` from `internal`. Two runners feed it, and
neither feeds it the way production does:

| Runner | Source | Behaviour when absent |
|--------|--------|-----------------------|
| `eval:pipeline` | `EVAL_BUSINESS_CONTEXT` env var | Unset → the field is not sent, and the rubric renders `(no disponible)` |
| `eval:matrix` | `scripts/eval/data/input/business_context.txt` | Missing or empty → the run **refuses to start**: two of its four variants exist to measure this field, and without it they would silently repeat the other two |

```bash
EVAL_BUSINESS_CONTEXT="$(cat scripts/eval/data/input/business_context.txt)" bun run eval:pipeline
```

**Both of those texts are written by hand, and production's is not.** In
production the value is read from `accounts.business_context` — a column that
is empty until something fills it, and whose text is expected to be refined
over time. A hand-written paragraph is the best case: it measures the ceiling
the field can buy, not what an account will actually be carrying. Report a
figure from these runs as a ceiling, not as a forecast.

The field is no longer an axis of the matrix. It was one, it was measured, and
both answers are settled: on backfill it is worth +0.082 macro F1 (median,
five models) and on onboarding the best model lost 0.073 with it and none of
the five gained. Both answers are enforced in
`apps/api/src/lib/classifier-input.ts` — `onboarding` does not read the column,
`backfill` always does — so a cell varying it would measure something no call
site can produce.

One cell per stage, therefore: `onboarding` without the context and `backfill`
with it, each mirroring what its call sites send. That the column is empty for
every account today is a task in another domain, not a condition this bench
observes: re-measuring an accepted delta spends compute reconfirming a decision
instead of informing one.

## Annotator agreement

Every F1 in a report is distance to a label. That distance only means something
if the label is reproducible — if two people reading the same email with the
same rubric write the same value. `eval:metrics` computes that from the sheet's
own annotator columns and prints it above the F1 table:

| Field | Agreement | By chance | Kappa | Reading |
|---|---|---|---|---|
| tone | 94% | 38% | 0.90 | almost perfect |
| category | 88% | 68% | 0.62 | substantial |
| ticket_type | 88% | 76% | 0.51 | moderate |
| priority | 48% | 32% | 0.24 | fair |
| urgency | 44% | 38% | 0.10 | slight |
| difficulty | 88% | 88% | −0.03 | no better than chance |

**Read the kappa, not the percentage.** Two classes with a skewed split hand out
~50% agreement for free, so the raw figure is not comparable between fields —
`ticket_type` and `difficulty` both sit at 88% and one of them is worth nothing.
That last row matters more than it looks: the verdict is macro F1 over the
emails *both* annotators called easy, and they agree on that split no better
than their own habits predict.

`tone` is read from the `*_tono_v130` columns and only those. The sheet also
carries the original four-class pass and an intermediate binary one; neither
describes a label anything reads, and the first was annotated before the
insistence rule existed, at 12% agreement.

Nothing is hand-written: there is no `_meta.json`. A corpus whose sheet has no
annotator columns simply gets no agreement section, which is the honest answer
there — a zero would read as "they never agreed".

## Two corpora

`EVAL_CORPUS` selects which body of email a run measures. It defaults to `main`,
so every command that worked before this existed still means the same thing.

| | `main` | `coverage` |
|---|---|---|
| Emails | `data/input/eml/` | `data/input/coverage/eml/` |
| Ground truth | `data/input/ground_truth_50.csv` | `data/input/coverage/coverage_ground_truth.csv` |
| Output | `data/output/<cell>/` | `data/output/coverage/<cell>/` |
| How it was built | a random window of the inbox | hand-picked, on purpose |
| How to read it | macro F1 — the verdict | pass or fail, never a mean |

```bash
EVAL_CORPUS=coverage bun run eval:matrix
EVAL_CORPUS=coverage bun run eval:metrics ollama-granite4.2-30b
```

**`coverage` exists because a random window cannot reach an edge case.** In 100
annotations of `main`, `prospect`, `spam` and `other` had **zero** examples
between them — three of the five classes production can emit were never
measured. Sampling harder does not fix that: they are rare by nature.

**They must not be merged.** The majority-class baseline is derived from the
ground truth's own label frequencies, so injecting hand-picked examples into
`main` would move the floor the verdict is measured against without anything
flagging it, and macro F1 would stop weighting `internal` at half. A separate
subtree also gives each corpus its own execution ledger, which is only
meaningful against the cell count it was written for.

Email ids in `coverage` start at 101: `canonicalEmailId` strips leading zeros,
so `001` in one corpus and `001` in the other would collide if the two sheets
were ever joined.

An unknown `EVAL_CORPUS` is a fatal error rather than a fallback to `main` —
silently measuring one corpus while a report claims another is the failure this
split exists to prevent.

### Sheet schema

`main` is written half in Spanish because it grew a column at a time. Anything
written from now on uses English column names, and the adapter reads both:

| | Legacy (`main`) | English (`coverage` and anything new) |
|---|---|---|
| Consensus | `tipo_ticket_final`, `prioridad_final`, … | `ticket_type_final`, `priority_final`, … |
| Tone consensus | `tono_final_v130` | `tone_final` |
| Difficulty consensus | `difficulty_final` | `difficulty_final` |
| Annotators | `alexandra_tono_v130`, `alexandra_dificultad` | `alexandra_tone`, `alexandra_difficulty` |

Detection keys on the `ticket_type` consensus column, whose two spellings cannot
both be right. A sheet carrying both is refused rather than guessed at:
`alexandra_tone` means the original four-class pass in the legacy sheet — the
one the annotators agreed on 12% of the time — and the live pass in an English
one. Reading one as the other would score a run against labels nobody stands
behind.

### Difficulty

How hard the annotators found the email to label. It is theirs to resolve, like
every other field, and it has a consensus column:

| Value | Meaning |
|---|---|
| `easy` | straightforward to classify |
| `ambiguous` | they are not fully in agreement, or there is doubt |
| `hard` | indisputably difficult to label — passive-aggressive wording, a request whose real subject sits in an attachment, a thread whose owner cannot be told from the text |

It carries weight the name does not suggest: **the verdict is macro F1 over the
`easy` emails only**, so this column decides which subset the headline number is
measured over.

Until now there was no consensus column and the adapter derived one — the
harsher of the two annotators won. That is a judgement resolved by an `indexOf`,
on the one field that decides what the verdict is computed on. It now comes from
`difficulty_final` like everything else.

In `coverage` the same column separates the two questions that set answers:
`easy` on the unequivocal examples, `ambiguous` or `hard` on the ones picked
specifically to sit near the boundary.

## Data layout (private repo)

`scripts/eval/data/` is a **separate private git repo** — it holds real company
emails and is fully ignored by this monorepo (see root `.gitignore`). Nothing
under it, including its own README, is visible from here, so the expected tree
is documented in this file:

```
scripts/eval/data/
├── input/
│   ├── ground_truth_50.csv    ← produced by KAI-102 (raw two-annotator sheet;
│   │                            adapted in memory at run time — never edited)
│   └── eml/
│       └── 001.eml … 050.eml  ← raw source emails
└── output/                    ← auto-created by the scripts
    └── <provider>-<model>/    ← one directory PER RUN, e.g. ollama-granite4.1-3b
        ├── pipeline_output.csv      (includes provider + model columns)
        ├── eval_report.md / eval_report.json
        └── *.log
```

Each run's identity comes from `INTELLIGENCE_PROVIDER` + `OLLAMA_MODEL` /
`ANTHROPIC_MODEL` at launch time; runs with different models never share or
overwrite files. `eval:metrics` resolves the same directory from the same env
vars, or takes it explicitly: `bun run eval:metrics <run-dir-name>`.

Cloning this monorepo alone is not enough to run the eval — the private data
repo must be present at `scripts/eval/data/`.

## Setup

1. **Place your `.eml` files** in `scripts/eval/data/input/eml/`
   - Name them `001.eml` through `050.eml`
   - The numeric prefix becomes the `email_id` in the output CSV

2. **Install dependencies** (if not already done):
   ```bash
   bun install
   ```

## Running

```bash
# From monorepo root
bun run eval:pipeline
```

## Output

| File | Description |
|------|-------------|
| `scripts/eval/data/output/<run>/pipeline_output.csv` | Pipeline predictions, one row per email |
| `scripts/eval/data/output/pipeline_eval_run.log` | Per-run execution log with timing and errors |

### CSV columns

| Column | Description |
|--------|-------------|
| `email_id` | Zero-padded filename prefix (`001`–`050`) |
| `filename` | Original filename (`001.eml`) |
| `provider` | Provider that ran this row (`ollama` / `anthropic`) |
| `model` | Actual model reported by the provider's response metadata |
| `prompt_version` | Rubric version that produced this row |
| `prompt_lang` | Rubric language (`es` / `en`) |
| `pipeline_stage` | Production path reproduced: `onboarding` (raw body, 20k cap) or `backfill` (quotes stripped, 2k cap) |
| `business_context` | Whether this row carried the `{{business_context}}` block (`yes` / `no`). Written by `eval:matrix`; `eval:pipeline` does not emit this column |
| `tenant_mailbox` | The mailbox sent as the tenant's own. Written by `eval:matrix` only |
| `endpoint` | Where inference ran. A latency figure is meaningless without it |
| `tokens_per_second` | Generation throughput from the provider's own timer (Ollama only; empty for Anthropic). Comparable across runs in a way wall-clock is not |
| `predicted_ticket_type` | `support` / `prospect` / `spam` / `internal` / `other` |
| `predicted_priority` | `P1` / `P2` / `P3` |
| `predicted_category` | `technical` / `billing` / `account` / `general` / `not_applicable` |
| `predicted_tone` | `aggressive` / `frustrated` / `neutral` / `positive` |
| `predicted_urgency` | `high` / `medium` / `low` |
| `confidence` | `0.0`–`1.0` as returned by the pipeline |
| `processing_tier` | `0` — the eval calls the classifier directly and does not run any tier. In production this column is an integer written by the pipeline: `1` fast-path, `2` background, `3` deferred, `0` incremental-sync |
| `processing_time_ms` | Wall clock time for this email |
| `raw_reasoning` | The `reasoning` field from the pipeline |
| `error` | Error message if classification failed, empty otherwise |

## Interpreting errors

- Each failed email is recorded with an empty prediction and the error message
  in the `error` column
- The full error is also written to `pipeline_eval_run.log`
- The script continues after individual failures and reports a final count
- Common causes: malformed `.eml`, missing API key, provider timeout

## Notes

- Temperature is forced to `0` for deterministic, reproducible results
- Emails are processed **sequentially** (one at a time) so `processing_time_ms` is the
  clean latency of a single call — the figure that governs Tier 1, where the first
  ticket renders as soon as the first of several parallel calls returns
- Wall-clock for 50 emails depends entirely on the model: measured 3 min (Claude Haiku 4.5)
  to 52 min (a 31B open-weight model). Do not read it as a pipeline number — production
  dispatches classifications in parallel
- The eval does **not** execute the tier pipeline: no Inngest, no Gmail fetch, no Tier 0
  pre-filter, no persistence. It measures the classifier, not the orchestration
- This script does **not** require or read `ground_truth_50.csv`
- Comparison against ground truth is handled separately in KAI-97
