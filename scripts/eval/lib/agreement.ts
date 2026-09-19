// ---------------------------------------------------------------------------
// How much the two annotators agree, per field.
//
// Every F1 in this report is distance to a label. That distance only means
// something if the label is reproducible — if two people reading the same email
// with the same rubric write the same value. When they do not, a high F1 says
// the model landed close to a coin flip, and nothing in the report said so.
//
// This was computed by hand, in a chat, exactly once. It is measurement, so it
// belongs in the report next to the number it qualifies.
// ---------------------------------------------------------------------------

export interface FieldAgreement {
  /** Emails where both annotators wrote a value. Pairs with a blank are skipped. */
  n: number;
  /** Fraction of those where they wrote the same value. */
  observed: number;
  /**
   * Agreement expected from their individual habits alone: how often they would
   * coincide if each kept their own class frequencies and answered at random.
   */
  expected: number;
  /**
   * Cohen's kappa — the share of the achievable agreement above chance that
   * they actually reached.
   *
   * The raw percentage cannot be read on its own. Two classes with a skewed
   * split give ~50% agreement for free; five even classes give 20%. A field at
   * 88% and one at 54% can be equally informative, or not at all. Kappa is what
   * makes two fields comparable: 0 is chance, 1 is perfect, and negative means
   * they agree *less* than their own habits predict.
   */
  kappa: number;
}

const EMPTY: FieldAgreement = { n: 0, observed: 0, expected: 0, kappa: 0 };

/**
 * Agreement between two annotators on one field.
 *
 * `a[i]` and `b[i]` must be the same email. A pair where either side is blank
 * is not a disagreement — it is an unanswered question — so it is dropped
 * rather than counted against them.
 */
export function computeAgreement(a: string[], b: string[]): FieldAgreement {
  const pairs: [string, string][] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = (a[i] ?? '').trim();
    const y = (b[i] ?? '').trim();
    if (x === '' || y === '') continue;
    pairs.push([x, y]);
  }

  const n = pairs.length;
  if (n === 0) return { ...EMPTY };

  const observed = pairs.filter(([x, y]) => x === y).length / n;

  const freq = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return counts;
  };
  const fa = freq(pairs.map(([x]) => x));
  const fb = freq(pairs.map(([, y]) => y));
  const labels = new Set([...fa.keys(), ...fb.keys()]);

  let expected = 0;
  for (const label of labels) {
    expected += ((fa.get(label) ?? 0) / n) * ((fb.get(label) ?? 0) / n);
  }

  // Both annotators used exactly one class, and the same one. Chance agreement
  // is total, so there is no room above it to measure: kappa is undefined and
  // reported as 0 rather than as a division by zero.
  const kappa = expected >= 1 ? 0 : (observed - expected) / (1 - expected);

  return { n, observed, expected, kappa };
}

/**
 * Landis & Koch, the convention these numbers are usually read against. Printed
 * beside kappa so a reader does not have to remember where the cut-offs are.
 */
export function readKappa(kappa: number): string {
  if (kappa <= 0) return 'no better than chance';
  if (kappa < 0.21) return 'slight';
  if (kappa < 0.41) return 'fair';
  if (kappa < 0.61) return 'moderate';
  if (kappa < 0.81) return 'substantial';
  return 'almost perfect';
}
