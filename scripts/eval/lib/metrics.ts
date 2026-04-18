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
}

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

/**
 * Compute precision, recall, and macro-F1 for a single classification field.
 * truths[i] and predictions[i] must correspond to the same email.
 * Arrays must be the same length and must not be empty.
 */
export function computeFieldMetrics(
  truths: string[],
  predictions: string[],
): FieldMetrics {
  if (truths.length === 0) {
    return { macro_f1: 0, macro_precision: 0, macro_recall: 0, per_label: {} };
  }

  // Derive labels from data — never hardcode expected values
  const labels = [...new Set([...truths, ...predictions])].sort();
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

  const values = Object.values(per_label);
  const n = values.length;
  const macro_precision = safeDiv(values.reduce((s, v) => s + v.precision, 0), n);
  const macro_recall = safeDiv(values.reduce((s, v) => s + v.recall, 0), n);
  const macro_f1 = safeDiv(values.reduce((s, v) => s + v.f1, 0), n);

  return { macro_f1, macro_precision, macro_recall, per_label };
}
