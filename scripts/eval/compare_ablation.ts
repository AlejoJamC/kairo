/**
 * Ablation diff — does the model use the context it is given?
 *
 * Compares a full run against the same run with the context fields withheld
 * (`EVAL_NO_CONTEXT=1`). Both use the same prompt template and the same model;
 * the only difference is whether recipients, thread depth and attachments
 * reached the prompt, so any change in the predictions is attributable to
 * them and to nothing else.
 *
 * Three readings:
 *   - nothing changes            → the context is ignored; the plumbing is inert
 *   - much changes, F1 flat/down → the context is used, the rubric reads it wrong
 *   - ticket_type/priority move
 *     and F1 rises               → the context is used and understood
 *
 * Calls no model. Run it after both pipeline runs exist:
 *   bun run scripts/eval/compare_ablation.ts <run-slug>
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import { parseCsv, adaptGroundTruth, canonicalEmailId } from './compute_metrics';
import { PIPELINE_OUTPUT } from './lib/run-files';
import { computeFieldMetrics } from './lib/metrics';
import { resolveRunLabel } from './lib/run-label';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output');
const GT_FILE = join(SCRIPT_DIR, 'data/input/ground_truth_50.csv');

// Strip any -nocontext suffix so either run name resolves the same pair
const BASE_SLUG = (process.argv[2] ?? resolveRunLabel().slug).replace(/-nocontext$/, '');

const FIELDS = [
  { key: 'ticket_type', gt: 'ticket_type', pred: 'predicted_ticket_type' },
  { key: 'priority', gt: 'priority', pred: 'predicted_priority' },
  { key: 'category', gt: 'category', pred: 'predicted_category' },
  { key: 'tone', gt: 'tone', pred: 'predicted_tone' },
  { key: 'urgency', gt: 'urgency', pred: 'predicted_urgency' },
] as const;

type Row = Record<string, string>;

async function loadRun(slug: string): Promise<Map<string, Row>> {
  const path = join(OUTPUT_DIR, slug, PIPELINE_OUTPUT);
  try {
    await access(path);
  } catch {
    console.error(
      `ERROR: run not found:\n  ${path}\n\n` +
        (slug.endsWith('-nocontext')
          ? 'Produce it with:  EVAL_NO_CONTEXT=1 bun run eval:pipeline'
          : 'Produce it with:  bun run eval:pipeline'),
    );
    process.exit(1);
  }
  const { rows } = parseCsv(await readFile(path, 'utf-8'));
  const map = new Map<string, Row>();
  for (const r of rows) {
    const id = canonicalEmailId(r['email_id'] ?? '');
    if (id && !r['error']) map.set(id, r);
  }
  return map;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;
}

async function main(): Promise<void> {
  const withCtx = await loadRun(BASE_SLUG);
  const without = await loadRun(`${BASE_SLUG}-nocontext`);

  const gtRows = adaptGroundTruth(parseCsv(await readFile(GT_FILE, 'utf-8'))).rows;
  const gt = new Map(gtRows.map((r) => [r['email_id']!, r]));

  // Only emails both runs answered — an error in one side is not a change
  const ids = [...withCtx.keys()].filter((id) => without.has(id) && gt.has(id)).sort();

  console.log('Kairo Ablation Diff — does the model use the context?');
  console.log(`Run:      ${BASE_SLUG}`);
  console.log(`With:     ${withCtx.size} emails answered`);
  console.log(`Without:  ${without.size} emails answered`);
  console.log(`Compared: ${ids.length} answered by both`);
  console.log('─'.repeat(78));
  console.log(
    `${pad('field', 14)}${pad('changed', 10)}${pad('F1 with', 10)}` +
      `${pad('F1 without', 12)}${pad('delta', 9)}effect`,
  );
  console.log('─'.repeat(78));

  let totalChanged = 0;

  for (const f of FIELDS) {
    const truths: string[] = [];
    const predWith: string[] = [];
    const predWithout: string[] = [];
    let changed = 0;

    for (const id of ids) {
      const a = withCtx.get(id)![f.pred] ?? '';
      const b = without.get(id)![f.pred] ?? '';
      truths.push(gt.get(id)![f.gt] ?? '');
      predWith.push(a);
      predWithout.push(b);
      if (a !== b) changed++;
    }

    const f1With = computeFieldMetrics(truths, predWith).macro_f1;
    const f1Without = computeFieldMetrics(truths, predWithout).macro_f1;
    const delta = f1With - f1Without;
    totalChanged += changed;

    let effect: string;
    if (changed === 0) effect = 'context ignored';
    else if (delta > 0.02) effect = 'context helps';
    else if (delta < -0.02) effect = 'context hurts';
    else effect = 'context moves predictions without improving them';

    console.log(
      `${pad(f.key, 14)}${pad(`${changed}/${ids.length}`, 10)}` +
        `${pad(f1With.toFixed(3), 10)}${pad(f1Without.toFixed(3), 12)}` +
        `${pad(signed(delta), 9)}${effect}`,
    );
  }

  console.log('─'.repeat(78));

  if (totalChanged === 0) {
    console.log(
      'VERDICT: identical output. The context fields reached the prompt and\n' +
        '         changed nothing — the model is not reading them.',
    );
  } else {
    console.log(
      `VERDICT: ${totalChanged} prediction(s) changed across 5 fields. ` +
        'Read the per-field\n         deltas above: a field that moves without ' +
        'gaining F1 is being used\n         against a rubric that reads it wrong.',
    );
  }

  // Emails whose ticket_type flipped are the ones worth reading by hand
  const flipped = ids.filter(
    (id) =>
      withCtx.get(id)!['predicted_ticket_type'] !==
      without.get(id)!['predicted_ticket_type'],
  );
  if (flipped.length > 0) {
    console.log('');
    console.log('ticket_type changed on these emails:');
    for (const id of flipped) {
      const a = withCtx.get(id)!['predicted_ticket_type'];
      const b = without.get(id)!['predicted_ticket_type'];
      const t = gt.get(id)!['ticket_type'];
      const mark = a === t ? '✓ fixed' : b === t ? '✗ broke' : '  neither';
      console.log(`  ${pad(id, 4)} without=${pad(b!, 10)} with=${pad(a!, 10)} truth=${pad(t!, 10)}${mark}`);
    }
  }
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error('Fatal error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
