export interface LabelMetrics {
  precision: number;
  recall: number;
  f1: number;
  support: number;
}

export interface FieldMetrics {
  macro_f1: number;
  macro_precision: number;
  macro_recall: number;
  per_label: Record<string, LabelMetrics>;
  /**
   * Labels the model emitted that the ground truth never contains. Their own
   * F1 is left out of the macro average (see below), but the predictions are
   * not free: each one still counts as a false negative against the class the
   * ground truth does carry.
   *
   * Landing here is **not** a model defect. A value can be perfectly legal
   * under the rubric the model was given and still never appear in a 50-email
   * corpus — `billing` in a corpus whose annotators decided to file every
   * money case as `technical`, for instance. This measures the corpus's
   * coverage, not the model's obedience. For the latter, see below.
   */
  off_ground_truth_labels: string[];
  /** How many predictions fell on a label the ground truth never uses. */
  off_ground_truth_predictions: number;
  /**
   * Labels outside the classification contract the model was handed — the
   * enums in `packages/intelligence`. This one **is** a model defect: it
   * answered something the prompt never offered (`"alta"` instead of `high`).
   *
   * Empty unless the caller passes `contractValues`. This module derives
   * everything else from the data alone and does not know the contract.
   */
  off_contract_labels: string[];
  /** How many predictions fell outside the contract. */
  off_contract_predictions: number;
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Compute precision, recall, and macro-F1 for a single classification field.
 * truths[i] and predictions[i] must correspond to the same email.
 * Arrays must be the same length and must not be empty.
 *
 * `contractValues` is the enum the model was told to answer from. Pass it to
 * get `off_contract_*` populated; omit it and only the ground-truth-derived
 * numbers are produced.
 */
export function computeFieldMetrics(
  truths: string[],
  predictions: string[],
  contractValues?: readonly string[],
): FieldMetrics {
  if (truths.length === 0) {
    return {
      macro_f1: 0, macro_precision: 0, macro_recall: 0, per_label: {},
      off_ground_truth_labels: [], off_ground_truth_predictions: 0,
      off_contract_labels: [], off_contract_predictions: 0,
    };
  }

  // Derive labels from data — never hardcode expected values
  const labels = [...new Set([...truths, ...predictions])].sort();

  // A label the ground truth never contains has support 0, so its recall and
  // F1 are 0 by construction. Averaging it in caps the macro F1 at
  // truthLabels / (truthLabels + offGroundTruth), regardless of how well the
  // model does on the real classes — the fewer classes a field has, the harder
  // the cap bites. Scoring is therefore averaged over the classes the ground
  // truth actually uses; output on the other labels is reported separately.
  const truthLabels = new Set(truths);
  const per_label: Record<string, LabelMetrics> = {};

  for (const label of labels) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    let support = 0;

    for (let i = 0; i < truths.length; i++) {
      const t = truths[i]!;
      const p = predictions[i]!;
      if (t === label) support++;
      if (t === label && p === label) tp++;
      else if (t !== label && p === label) fp++;
      else if (t === label && p !== label) fn++;
    }

    const precision = safeDiv(tp, tp + fp);
    const recall = safeDiv(tp, tp + fn);
    const f1 = safeDiv(2 * precision * recall, precision + recall);
    per_label[label] = { precision, recall, f1, support };
  }

  const scored = labels.filter((l) => truthLabels.has(l)).map((l) => per_label[l]!);
  const n = scored.length;
  const macro_precision = safeDiv(scored.reduce((s, v) => s + v.precision, 0), n);
  const macro_recall = safeDiv(scored.reduce((s, v) => s + v.recall, 0), n);
  const macro_f1 = safeDiv(scored.reduce((s, v) => s + v.f1, 0), n);

  const off_ground_truth_labels = labels.filter((l) => !truthLabels.has(l));
  const off_ground_truth_predictions = predictions.filter(
    (p) => !truthLabels.has(p),
  ).length;

  // Blank predictions are a skipped row, not a contract violation — those are
  // filtered out upstream and counted separately.
  const contract = contractValues ? new Set(contractValues) : undefined;
  const offContract = (p: string) => contract !== undefined && p !== '' && !contract.has(p);
  const off_contract_labels = labels.filter(offContract);
  const off_contract_predictions = predictions.filter(offContract).length;

  return {
    macro_f1, macro_precision, macro_recall, per_label,
    off_ground_truth_labels, off_ground_truth_predictions,
    off_contract_labels, off_contract_predictions,
  };
}

export interface BaselineMetrics {
  /** The single class this classifier always answers. */
  majority_label: string;
  macro_f1: number;
  accuracy: number;
}

/**
 * Majority-class baseline: the score obtained by ignoring the email entirely
 * and always answering whichever class the ground truth uses most.
 *
 * It is the floor a real classifier must clear. A model that fails to beat it
 * carries no information about the email it just read, however high its
 * absolute score looks. Derived from the truths alone — no model is called and
 * no class is hardcoded, so it holds for any dataset.
 */
export function computeBaseline(truths: string[]): BaselineMetrics {
  if (truths.length === 0) {
    return { majority_label: '', macro_f1: 0, accuracy: 0 };
  }

  const counts = new Map<string, number>();
  for (const t of truths) counts.set(t, (counts.get(t) ?? 0) + 1);

  // Ties resolve alphabetically so the baseline is reproducible run to run
  let majority_label = '';
  let best = -1;
  for (const label of [...counts.keys()].sort()) {
    const c = counts.get(label)!;
    if (c > best) {
      best = c;
      majority_label = label;
    }
  }

  return {
    majority_label,
    macro_f1: computeFieldMetrics(truths, truths.map(() => majority_label)).macro_f1,
    accuracy: safeDiv(best, truths.length),
  };
}
