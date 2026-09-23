# Baseline for a new LLM feature

`scripts/eval` measures email classification only. A new feature (reply draft, summary, knowledge search, contact extraction) starts with no labelled set, so the first deliverable is the measurement, not the prompt.

1. **Define the unit and the label.** What one example is (a ticket, a thread, a signature block) and what a correct output is. Enum outputs get a label per field; free text gets a rubric with discrete grades and, where possible, a reference answer.
2. **Build the set under `scripts/eval/data/input/<feature>/`**, numbered from `001`, with the sheet schema's English column names (`<field>_final` for consensus, one column per annotator). Two annotators when the label is a judgement; report agreement, do not gate on it.
3. **Pick the floor.** Enum: the majority-class baseline, as `eval:metrics` computes it. Free text: the output of the simplest non-model approach (a template, the heuristic pass) scored with the same rubric.
4. **Mirror the production input.** The runner calls the same input-contract module and the same stage name the feature uses in production; if they differ, the measured cell is not a production path.
5. **Run through the same harness as production** (`runLlmFeature` when it exists) so tokens, latency and model are recorded the same way, with outputs under `scripts/eval/data/output/<feature>/<run>/`.
6. **Hold a coverage set apart** for the rare cases a random sample cannot reach; read it pass/fail, never merge it into the main set.
7. **In production, capture outcomes** (accepted / edited / rejected / ignored / auto_applied on `llm_calls.outcome`) from the first release, so the offline number can be checked against real use.

Reuse `scripts/eval/lib/` (`write-csv.ts`, `metrics.ts`, `agreement.ts`, `ledger.ts`, `run-label.ts`) instead of copying them into a new runner.
