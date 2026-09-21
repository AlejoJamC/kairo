// ---------------------------------------------------------------------------
// KAI-45 — which layer is responsible, over a run that already exists.
//
// `ticket_type` stopped being one answer and became the product of three
// coordinates, so a wrong type is unattributable from the type alone. Three
// different defects look identical in a predictions CSV:
//
//   L2  the routing policy withheld the message, so no model ran
//   L3  the model answered an axis wrong
//   L4  no pair of axes on that provenance row can reach the label at all
//
// Only the third is unfixable by prompting, and telling them apart is the
// difference between rewriting a rubric that was never the problem and finding
// out an axis is missing. This computes the split.
//
// It needs no model and no new run. Provenance comes from the envelope, routing
// is a pure function of the envelope, and reachability is arithmetic over
// TYPE_DERIVATION — so an afternoon of compute already spent can be re-read for
// free, as many times as the table changes.
//
// Direction of fit: the sheet is the specification. `table_gap` means the table
// is wrong, never that a label is.
//
//   bun run eval:attribute <run-dir-or-csv> [--corpus coverage]
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import {
  ACTIONABILITY,
  SUBJECT_MATTER,
  type Provenance,
  type TicketType,
} from '../../packages/types/src/classification';
import {
  DERIVATION_VERSION,
  TYPE_DERIVATION,
  derivationKey,
  provenanceOf,
} from '../../packages/intelligence/src/classification/derive';
import { extractMailFacts } from '../../apps/api/src/lib/email/mail-facts';
import { ROUTING_POLICY_VERSION, resolveRoute } from '../../apps/api/src/lib/email/routing-policy';
import { parseEml } from './lib/parse-eml';
import { readEmlHeaders, tenantMailboxes } from './lib/eml-headers';
import { resolveCorpus, type Corpus } from './lib/corpus';
import { PIPELINE_OUTPUT } from './lib/run-files';
import { parseCsv, adaptGroundTruth, canonicalEmailId } from './compute_metrics';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;

const OUTCOMES = [
  'correct',
  /** Routing called it spam and the sheet did not. */
  'routing_false_spam',
  /** Routing withheld a message the sheet gives a real type to: a guaranteed miss. */
  'routing_withheld',
  /** Routing let a spam through; the table cannot emit `spam`, so it is always a miss. */
  'routing_missed_spam',
  /** Another pair on this provenance row reaches the label — the rubric can fix it. */
  'model_axes',
  /** No pair reaches it. An axis or a cell is wrong; no prompting fixes this. */
  'table_gap',
] as const;
type Outcome = (typeof OUTCOMES)[number];

interface Attributed {
  id: string;
  provenance: Provenance;
  route: 'skip' | 'classify';
  skipReason: string;
  predicted: string;
  gold: string;
  outcome: Outcome;
  /** Every axis pair that would have produced `gold` on this provenance row. */
  reaching: string[];
}

/** Every axis pair that, on this provenance row, produces `gold`. */
function axesReaching(provenance: Provenance, gold: TicketType): string[] {
  const out: string[] = [];
  for (const a of ACTIONABILITY) {
    for (const s of SUBJECT_MATTER) {
      if (TYPE_DERIVATION[derivationKey(provenance, a, s)] === gold) out.push(`${a}/${s}`);
    }
  }
  return out;
}

function goldLabels(corpus: Corpus): Map<string, TicketType> {
  const sheet = adaptGroundTruth(
    parseCsv(readFileSync(join(SCRIPT_DIR, corpus.groundTruth), 'utf-8')),
  );
  const out = new Map<string, TicketType>();
  for (const row of sheet.rows) {
    const id = canonicalEmailId(row['email_id'] ?? '');
    const label = (row['ticket_type'] ?? '').trim();
    if (id && label) out.set(id, label as TicketType);
  }
  return out;
}

/** `predicted_ticket_type` by email id, from any run this repo produces. */
function predictions(csv: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of parseCsv(readFileSync(csv, 'utf-8')).rows) {
    const id = canonicalEmailId(row['email_id'] ?? '');
    if (id) out.set(id, (row['predicted_ticket_type'] ?? '').trim());
  }
  return out;
}

function attribute(corpus: Corpus, predicted: Map<string, string>): Attributed[] {
  const mailboxes = tenantMailboxes();
  const gold = goldLabels(corpus);
  const emlDir = join(SCRIPT_DIR, corpus.emlDir);
  const out: Attributed[] = [];

  for (const file of readdirSync(emlDir).filter((f) => f.endsWith('.eml')).sort()) {
    const id = file.replace(/\.eml$/, '');
    const raw = readFileSync(join(emlDir, file), 'utf-8');
    const parsed = parseEml(raw);
    const facts = extractMailFacts({
      from: parsed.from,
      subject: parsed.subject,
      headers: readEmlHeaders(raw),
      tenantMailbox: mailboxes,
    });

    const provenance = provenanceOf(facts);
    const route = resolveRoute(facts);
    const g = gold.get(canonicalEmailId(id)) ?? '';
    const model = predicted.get(canonicalEmailId(id)) ?? '';
    const reaching = g ? axesReaching(provenance, g as TicketType) : [];

    let shown: string;
    let outcome: Outcome;
    if (route.kind === 'skip' && route.reason === 'spam_filtered') {
      shown = 'spam';
      outcome = g === 'spam' ? 'correct' : 'routing_false_spam';
    } else if (route.kind === 'skip') {
      // The pipeline emits no ticket at all. The sheet gives this email a type,
      // so it can never be reproduced — the model was never asked.
      shown = '(withheld)';
      outcome = 'routing_withheld';
    } else {
      shown = model;
      outcome =
        model === g
          ? 'correct'
          : g === 'spam'
            ? 'routing_missed_spam'
            : reaching.length > 0
              ? 'model_axes'
              : 'table_gap';
    }

    out.push({
      id,
      provenance,
      route: route.kind,
      skipReason: route.kind === 'skip' ? route.reason : '',
      predicted: shown,
      gold: g,
      outcome,
      reaching,
    });
  }
  return out;
}

function render(rows: Attributed[], source: string): string {
  const pad = (s: string, n: number) => s.padEnd(n);
  const of = (o: Outcome) => rows.filter((r) => r.outcome === o);
  const lines: string[] = [];

  lines.push('KAI-45 — layer attribution');
  lines.push(new Date().toISOString());
  lines.push(`source ${source}`);
  lines.push(`routing ${ROUTING_POLICY_VERSION}   derivation ${DERIVATION_VERSION}`);
  lines.push('');
  lines.push(`end to end: ${of('correct').length}/${rows.length}`);
  lines.push('');
  for (const o of OUTCOMES) {
    if (o === 'correct' || of(o).length === 0) continue;
    lines.push(`  ${pad(o, 22)}${String(of(o).length).padStart(3)}   ${of(o).map((r) => r.id).join(' ')}`);
  }
  lines.push('');
  lines.push(
    pad('id', 5) + pad('provenance', 15) + pad('route', 10) + pad('skip_reason', 20) +
    pad('predicted', 12) + pad('gold', 10) + pad('outcome', 20) + 'axes that reach gold',
  );
  lines.push('-'.repeat(130));
  for (const r of rows) {
    if (r.outcome === 'correct') continue;
    lines.push(
      pad(r.id, 5) + pad(r.provenance, 15) + pad(r.route, 10) + pad(r.skipReason, 20) +
      pad(r.predicted, 12) + pad(r.gold, 10) + pad(r.outcome, 20) +
      (r.reaching.join(' ') || 'NONE'),
    );
  }
  lines.push('');
  lines.push('Per class in the sheet:');
  for (const c of [...new Set(rows.map((r) => r.gold))].filter(Boolean).sort()) {
    const group = rows.filter((r) => r.gold === c);
    lines.push(`  ${pad(c, 10)} ${String(group.filter((r) => r.outcome === 'correct').length).padStart(2)}/${group.length}`);
  }
  lines.push('');
  lines.push('Provenance, computed from the envelope:');
  for (const p of ['external', 'same_company', 'tenant_mailbox'] as Provenance[]) {
    const group = rows.filter((r) => r.provenance === p);
    lines.push(`  ${pad(p, 15)} ${String(group.length).padStart(2)}   labels present: ` +
      `${[...new Set(group.map((r) => r.gold))].filter(Boolean).sort().join(' ')}`);
  }
  return lines.join('\n') + '\n';
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const target = args[0];
  if (!target) {
    console.error('usage: bun run eval:attribute <run-dir-or-csv>   [EVAL_CORPUS=coverage]');
    console.error('  <run-dir-or-csv> a directory holding a predictions CSV, or the CSV itself.');
    process.exit(1);
  }

  const csv = statSync(target).isDirectory()
    ? [PIPELINE_OUTPUT, 'layers.csv'].map((f) => join(target, f)).find(existsSync)
    : target;
  if (!csv) {
    console.error(`✗ no ${PIPELINE_OUTPUT} or layers.csv in ${target}`);
    process.exit(1);
  }

  const corpus = resolveCorpus();
  const rows = attribute(corpus, predictions(csv));
  // Printed, never written. A run directory holds a measurement someone paid
  // compute for; a read-only tool does not get to leave files in it. Redirect
  // if you want it on disk.
  console.log(render(rows, csv));
}

main();
