// ---------------------------------------------------------------------------
// Which body of email a run measures.
//
// Two corpora, two questions, and they must not be averaged into one number:
//
//   main      a random window of the tenant's inbox. Answers "how well does it
//             do on what this mailbox actually receives" — the verdict.
//   coverage  hand-picked examples of the classes a random window does not
//             reach. `prospect`, `spam` and `other` had zero examples in 100
//             annotations of `main`, so nothing measured three of the five
//             classes production can emit. Answers "when one arrives, is it
//             recognised" — pass or fail, never a mean.
//
// Mixing them would break `main` in a way nothing would flag: the majority-class
// baseline is derived from the ground truth's own label frequencies, so
// injecting hand-picked examples silently moves the floor the verdict is
// measured against, and macro F1 would stop weighting `internal` at half.
//
// One variable rather than a path per file: a corpus is emails AND the labels
// for those emails, and pointing at one with the other's ground truth is not a
// configuration anyone wants to be able to express.
// ---------------------------------------------------------------------------

export type CorpusId = 'main' | 'coverage';

export interface Corpus {
  id: CorpusId;
  /** Directory of .eml files, relative to scripts/eval/. */
  emlDir: string;
  /** Annotator sheet for exactly those emails, relative to scripts/eval/. */
  groundTruth: string;
  /**
   * Output namespace. Empty for `main`, so the paths every existing report and
   * archived run already refer to keep resolving. A second corpus gets its own
   * subtree — its own cell directories and its own execution ledger, since a
   * ledger is only meaningful against the cell count it was written for.
   */
  outputSubdir: string;
}

export const CORPORA: Record<CorpusId, Corpus> = {
  main: {
    id: 'main',
    emlDir: 'data/input/eml',
    groundTruth: 'data/input/ground_truth_50.csv',
    outputSubdir: '',
  },
  coverage: {
    id: 'coverage',
    emlDir: 'data/input/coverage/eml',
    groundTruth: 'data/input/coverage/coverage_ground_truth.csv',
    outputSubdir: 'coverage',
  },
};

/**
 * The corpus this run measures. `main` unless asked otherwise, so every command
 * that worked before this existed still means the same thing.
 *
 * An unknown name is fatal rather than a fallback: silently measuring `main`
 * when someone asked for something else is how a report ends up describing a
 * corpus nobody meant to run.
 */
export function resolveCorpus(
  env: Record<string, string | undefined> = process.env,
): Corpus {
  // An unset variable and one set to whitespace are the same intent.
  const requested = (env['EVAL_CORPUS'] ?? '').trim() || 'main';
  const corpus = CORPORA[requested as CorpusId];
  if (!corpus) {
    const known = Object.keys(CORPORA).join(', ');
    throw new Error(`Unknown EVAL_CORPUS "${requested}". Known corpora: ${known}.`);
  }
  return corpus;
}
