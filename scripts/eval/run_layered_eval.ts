// ---------------------------------------------------------------------------
// KAI-45 — the layered pipeline, measured as a pipeline.
//
// This is NOT the KAI-93 matrix and does not share a directory with it. The
// matrix answers "which model", by running several models and several input
// variants against one another; it deliberately bypasses the routing policy so
// that the model's answer is known even on the messages the static rules catch
// today. That is the right shape for choosing a model and the wrong shape for
// this ticket, and running one under the other is what produced a report where
// `spam` read 0/10: the table cannot emit `spam` because routing answers it,
// and the matrix never called routing.
//
// What this measures is the whole path, in order, once:
//
//   L1  extractMailFacts    the envelope, as facts
//   L2  resolveRoute        classify or withhold, and why
//   L3  the model           two orthogonal axes, nothing else
//   L4  TYPE_DERIVATION     provenance x axes -> ticket_type
//
// and it records what every layer answered, not just the final label. That is
// the whole point. `ticket_type` is now the product of three coordinates, so a
// wrong type is unattributable from the type alone — a model that picked the
// wrong axis and a table cell that cannot reach the label are different defects
// with different fixes, and one of them is not fixable by any amount of
// prompting. The `outcome` column separates them per email.
//
// Ground truth direction of fit: the sheet is the specification. KAI-100/101
// produced it, KAI-102 adjudicated it, the product owner confirmed it. Nothing
// here reopens a label. `table_gap` means the table is wrong, never the sheet.
// ---------------------------------------------------------------------------

import { join } from 'path';
import { createHash } from 'crypto';
import { readdir, readFile } from 'fs/promises';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

import {
  ACTIONABILITY,
  SUBJECT_MATTER,
  type Actionability,
  type Provenance,
  type SubjectMatter,
  type TicketType,
} from '../../packages/types/src/classification';
import { classifyEmailWithMeta, stripQuotedThread } from '../../packages/intelligence/src/index';
import {
  DERIVATION_VERSION,
  TYPE_DERIVATION,
  derivationKey,
  provenanceOf,
} from '../../packages/intelligence/src/classification/derive';
import { buildPrompt, getPromptVersion, DEFAULT_LANG } from '../../packages/intelligence/src/classification/prompt';
import { extractMailFacts } from '../../apps/api/src/lib/email/mail-facts';
import {
  ROUTING_POLICY_VERSION,
  resolveRoute,
  type SkipReason,
} from '../../apps/api/src/lib/email/routing-policy';
import { parseEml } from './lib/parse-eml';
import { readEmlHeaders, tenantMailboxes } from './lib/eml-headers';
import { resolveCorpus } from './lib/corpus';
import { STAGE_BODY_RULES, slugify, LOCAL_OLLAMA, type PipelineStage } from './lib/run-label';
import { parseCsv, adaptGroundTruth, canonicalEmailId } from './compute_metrics';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const CORPUS = resolveCorpus();
const INPUT_DIR = join(SCRIPT_DIR, CORPUS.emlDir);
const BC_FILE = join(SCRIPT_DIR, 'data/input/business_context.txt');

// Its own root, and the corpus id is deliberately not part of the path.
// `data/output/coverage/` belongs to the KAI-93 matrix — a different experiment,
// a different runner, already paid for. Nothing here writes to it, reads it, or
// is comparable to it. Which corpus a row came from is a column.
const OUTPUT_ROOT = process.env['EVAL_OUTPUT_ROOT'] ?? join(SCRIPT_DIR, 'data/output/rearchitecture');

const PROVIDER = (process.env['INTELLIGENCE_PROVIDER'] ?? 'ollama') as 'ollama' | 'anthropic';
const MODEL =
  process.env['EVAL_MODEL'] ??
  (PROVIDER === 'ollama'
    ? (process.env['OLLAMA_MODEL'] ?? 'muse-glimmer:30b')
    : (process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6'));

// The production path this reproduces. `backfill` is tier 2/3, incremental
// sync, the poll and the reclassify endpoints — everything except the one-time
// onboarding scan — so it is the default.
const STAGE = (process.env['EVAL_STAGE'] ?? 'backfill') as PipelineStage;

const TEMPERATURE = 0;
const DRY = process.env['EVAL_LAYERED_DRY'] === '1';
const TENANT_MAILBOXES = tenantMailboxes();
const TENANT_MAILBOX = TENANT_MAILBOXES[0]!;

// The rubric a run measures is part of the run's identity, not a column buried
// inside it. Two rubrics appended to one file is exactly how 40 rows of one and
// 40 of the next ended up in a single CSV, separable only by hand afterwards;
// naming the directory after the rubric makes that impossible rather than
// detectable. Resolved in main(), since reading the prompt file is async.
let RUN_DIR = '';
let PREDICTIONS = '';
let REPORT = '';

/**
 * Which rubric text this run measured, as the first 8 hex of its SHA-256.
 *
 * Not a date and not a label: both are decisions someone makes, and the one
 * making them is the one who just changed the file. A version number is a claim
 * that a change delivered something, so an experiment does not get to spend
 * one — which means the rubric holds its number while its text moves, and two
 * genuinely different rubrics would otherwise append into one directory under
 * the same version and be separable only by hand.
 *
 * The digest removes the judgement. Identical text resumes into the same
 * directory; any edit, however small, lands somewhere else, automatically and
 * without anyone deciding. A run that measured nothing useful is still
 * identifiable by exactly the rubric that produced it.
 */
function  rubricDigest(template: string): string {
  return createHash('sha256').update(template, 'utf-8').digest('hex').slice(0, 8);
}

function resolveRunDir(promptVersion: string, digest: string): void {
  RUN_DIR = join(OUTPUT_ROOT, `${slugify(`${PROVIDER}-${MODEL}`)}-v${promptVersion}-${digest}`);
  PREDICTIONS = join(RUN_DIR, 'layers.csv');
  REPORT = join(RUN_DIR, 'report.txt');
}

// ---------------------------------------------------------------------------
// One row per email: what each layer answered, and which layer is responsible
// when the answer is wrong.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'email_id', 'filename', 'corpus', 'provider', 'model',
  'prompt_version', 'prompt_lang', 'stage',
  'routing_policy_version', 'derivation_version',
  'provenance', 'route', 'skip_reason',
  'predicted_actionability', 'predicted_subject_matter', 'derivation_key',
  'predicted_ticket_type', 'gold_ticket_type', 'outcome',
  'gold_reachable', 'axes_reaching_gold',
  'processing_time_ms', 'tokens_per_second', 'raw_reasoning', 'error',
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string | number>;

/**
 * Which layer is answerable for this email's result.
 *
 *   correct            the pipeline reproduced the sheet
 *   routing_false_spam L2 called it spam and the sheet did not
 *   routing_withheld   L2 withheld a message the sheet gives a type to
 *   routing_missed_spam L2 let a spam through (the model then had to guess it,
 *                      and the table cannot emit `spam` at all, so this is
 *                      always also a miss)
 *   model_axes         L3 answered a pair that maps elsewhere; another pair on
 *                      this same row reaches the label, so the prompt can fix it
 *   table_gap          no pair on this provenance row reaches the label. The
 *                      table or an axis is wrong; no prompting can fix it
 *   error              the call failed
 */
const OUTCOMES = [
  'correct', 'routing_false_spam', 'routing_withheld', 'routing_missed_spam',
  'model_axes', 'table_gap', 'error', 'dry',
] as const;
type Outcome = (typeof OUTCOMES)[number];

/** Routing withholds a message; only one reason also names a class the sheet uses. */
const SKIP_AS_TYPE: Partial<Record<SkipReason, TicketType>> = {
  spam_filtered: 'spam',
};

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

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function appendRow(row: Row): void {
  mkdirSync(RUN_DIR, { recursive: true });
  if (!existsSync(PREDICTIONS)) {
    writeFileSync(PREDICTIONS, CSV_COLUMNS.join(',') + '\n', 'utf-8');
  }
  appendFileSync(PREDICTIONS, CSV_COLUMNS.map((c) => csvCell(row[c])).join(',') + '\n', 'utf-8');
}

/**
 * Email ids already on disk, so an interrupted run resumes into the delta.
 *
 * Refuses outright if the file holds another corpus. Email ids are only unique
 * within a corpus, so appending a second one would both corrupt the resume set
 * and make every number in the report an average over two populations that were
 * never meant to be averaged.
 */
function alreadyDone(): Set<string> {
  if (!existsSync(PREDICTIONS)) return new Set();
  const lines = readFileSync(PREDICTIONS, 'utf-8').split('\n').filter((l) => l.trim() !== '');
  if (lines.length < 2) return new Set();
  const header = lines[0]!.split(',');

  const corpusColumn = header.indexOf('corpus');
  if (corpusColumn !== -1) {
    const found = new Set(lines.slice(1).map((l) => l.split(',')[corpusColumn]).filter(Boolean));
    found.delete(CORPUS.id);
    if (found.size > 0) {
      console.error(`\n✗ ${PREDICTIONS}`);
      console.error(`  already holds corpus ${[...found].join(', ')}, and this run is ${CORPUS.id}.`);
      console.error('  Point EVAL_OUTPUT_ROOT somewhere else, or move that run aside.\n');
      process.exit(1);
    }
  }

  const column = header.indexOf('email_id');
  return new Set(lines.slice(1).map((l) => l.split(',')[column] ?? '').filter(Boolean));
}

/** The sheet, by canonical email id. */
function goldLabels(): Map<string, TicketType> {
  const sheet = adaptGroundTruth(
    parseCsv(readFileSync(join(SCRIPT_DIR, CORPUS.groundTruth), 'utf-8')),
  );
  const out = new Map<string, TicketType>();
  for (const row of sheet.rows) {
    const id = canonicalEmailId(row['email_id'] ?? '');
    const label = (row['ticket_type'] ?? '').trim();
    if (id && label) out.set(id, label as TicketType);
  }
  return out;
}

// ---------------------------------------------------------------------------

let stopping = false;
function requestStop(signal: string): void {
  if (stopping) process.exit(130);
  stopping = true;
  console.log(`\n${signal} received — finishing the email in flight, then stopping.`);
  console.log('Re-run the same command to continue; finished emails are skipped.\n');
}

async function main(): Promise<void> {
  process.on('SIGINT', () => requestStop('SIGINT'));
  process.on('SIGTERM', () => requestStop('SIGTERM'));

  process.env['INTELLIGENCE_PROVIDER'] = PROVIDER;
  if (PROVIDER === 'ollama') process.env['OLLAMA_MODEL'] = MODEL;
  else process.env['ANTHROPIC_MODEL'] = MODEL;

  const promptVersion = (await getPromptVersion(DEFAULT_LANG)) ?? 'unknown';
  // The rubric exactly as the model will receive it, minus the email.
  const digest = rubricDigest(await buildPrompt({ subject: '', from: '', body: '' }, DEFAULT_LANG));
  resolveRunDir(promptVersion, digest);

  const businessContext =
    STAGE === 'backfill' && existsSync(BC_FILE) ? readFileSync(BC_FILE, 'utf-8').trim() : '';
  const rule = STAGE_BODY_RULES[STAGE];
  const gold = goldLabels();
  const emails = (await readdir(INPUT_DIR)).filter((f) => f.endsWith('.eml')).sort();
  const done = alreadyDone();
  const endpoint =
    PROVIDER === 'ollama'
      ? (process.env['OLLAMA_BASE_URL'] ?? LOCAL_OLLAMA)
      : 'https://api.anthropic.com';

  console.log('Kairo layered pipeline eval — KAI-45');
  console.log('L1 facts → L2 routing → L3 two axes → L4 derivation table');
  console.log('─'.repeat(72));
  console.log(`Model:     ${PROVIDER}/${MODEL}  @ ${endpoint}`);
  console.log(`Stage:     ${STAGE}  (body ${rule.stripQuotes ? 'stripped' : 'raw'}, cap ${rule.maxChars}, ` +
    `businessContext ${businessContext ? 'yes' : 'no'})`);
  console.log(`Rubric:    ${DEFAULT_LANG} v${promptVersion} (${digest})   routing ${ROUTING_POLICY_VERSION}   derivation ${DERIVATION_VERSION}`);
  console.log(`Corpus:    ${CORPUS.id} — ${emails.length} emails, ${gold.size} labelled`);
  console.log(`Output:    ${RUN_DIR}`);
  if (done.size > 0) console.log(`Resuming:  ${done.size} already on disk, ${emails.length - done.size} to go`);
  console.log('─'.repeat(72));

  const startedAt = Date.now();
  let calls = 0;

  for (const filename of emails) {
    if (stopping) break;
    const emailId = filename.replace(/\.eml$/, '');
    if (done.has(emailId)) continue;

    const raw = await readFile(join(INPUT_DIR, filename), 'utf-8');
    const parsed = parseEml(raw);
    const facts = extractMailFacts({
      from: parsed.from,
      subject: parsed.subject,
      headers: readEmlHeaders(raw),
      tenantMailbox: TENANT_MAILBOXES,
    });

    // L1 + L2
    const provenance = provenanceOf(facts);
    const route = resolveRoute(facts);
    const goldType = gold.get(canonicalEmailId(emailId)) ?? '';
    const reaching = goldType ? axesReaching(provenance, goldType as TicketType) : [];

    const base: Row = {
      email_id: emailId, filename, corpus: CORPUS.id, provider: PROVIDER, model: MODEL,
      prompt_version: promptVersion, prompt_lang: DEFAULT_LANG, stage: STAGE,
      routing_policy_version: ROUTING_POLICY_VERSION, derivation_version: DERIVATION_VERSION,
      provenance, route: route.kind, skip_reason: route.kind === 'skip' ? route.reason : '',
      predicted_actionability: '', predicted_subject_matter: '', derivation_key: '',
      predicted_ticket_type: '', gold_ticket_type: goldType, outcome: '',
      gold_reachable: reaching.length > 0 ? 'yes' : 'no',
      axes_reaching_gold: reaching.join(' '),
      processing_time_ms: 0, tokens_per_second: '', raw_reasoning: '', error: '',
    };

    // L2 withheld it: no model call, and the outcome is routing's.
    if (route.kind === 'skip') {
      const asType = SKIP_AS_TYPE[route.reason] ?? '';
      const outcome: Outcome =
        asType && asType === goldType
          ? 'correct'
          : asType
            ? 'routing_false_spam'
            : 'routing_withheld';
      appendRow({ ...base, predicted_ticket_type: asType, outcome });
      process.stdout.write(`\r  ${emailId} ${provenance.padEnd(14)} skip:${route.reason.padEnd(22)} ${outcome}          \n`);
      continue;
    }

    // L3 + L4
    const body = (rule.stripQuotes ? stripQuotedThread(parsed.body) : parsed.body).slice(0, rule.maxChars);
    const t0 = performance.now();
    try {
      if (DRY) {
        // Never `correct`. A dry row is a model call that did not happen, and
        // scoring it as a hit is how a run that classified nothing reports 35/40.
        appendRow({ ...base, outcome: 'dry' });
        continue;
      }
      const { result, verdict, meta } = await classifyEmailWithMeta(
        {
          subject: parsed.subject, from: parsed.from, to: parsed.to, cc: parsed.cc,
          body, threadDepth: parsed.threadDepth, attachments: parsed.attachments,
          tenantMailbox: TENANT_MAILBOX,
          facts,
          ...(businessContext ? { businessContext } : {}),
        },
        { temperature: TEMPERATURE },
      );
      const ms = Math.round(performance.now() - t0);
      const key = derivationKey(
        provenance,
        verdict.actionability as Actionability,
        verdict.subject_matter as SubjectMatter,
      );
      // The only place a wrong answer is attributed. `gold_reachable` is
      // computed with no model call at all, so this attribution is not a
      // judgement about the model — it is arithmetic on the table.
      const outcome: Outcome =
        result.type === goldType
          ? 'correct'
          : goldType === 'spam'
            ? 'routing_missed_spam'
            : reaching.length > 0
              ? 'model_axes'
              : 'table_gap';

      appendRow({
        ...base,
        predicted_actionability: verdict.actionability,
        predicted_subject_matter: verdict.subject_matter,
        derivation_key: key,
        predicted_ticket_type: result.type,
        outcome,
        processing_time_ms: ms,
        tokens_per_second: meta.tokensPerSecond === null ? '' : Math.round(meta.tokensPerSecond * 10) / 10,
        raw_reasoning: result.reasoning,
      });
      calls++;
      process.stdout.write(
        `\r  ${emailId} ${provenance.padEnd(14)} ${verdict.actionability}/${verdict.subject_matter} ` +
        `→ ${String(result.type).padEnd(9)} gold ${String(goldType).padEnd(9)} ${outcome.padEnd(18)} ${ms}ms\n`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      appendRow({ ...base, outcome: 'error', processing_time_ms: Math.round(performance.now() - t0), error: message });
      calls++;
      console.error(`\r  ${emailId} ERROR — ${message}`);
    }
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log('─'.repeat(72));
  console.log(`${stopping ? 'Stopped' : 'Complete'} — ${calls} model call(s) this session, ${elapsed}s`);
  writeReport(promptVersion);
}

// ---------------------------------------------------------------------------
// The report. Read off the CSV rather than kept in memory, so it is the same
// number whether the run finished in one go or in four.
// ---------------------------------------------------------------------------

function writeReport(promptVersion: string): void {
  if (!existsSync(PREDICTIONS)) return;
  const parsed = parseCsv(readFileSync(PREDICTIONS, 'utf-8'));
  const rows = parsed.rows;
  if (rows.length === 0) return;

  // Routing decides without the model, so its verdicts are real even in a dry
  // run — but the emails it passed through were never classified, and an
  // accuracy over them is a number about nothing. Report the layer that ran.
  const dry = rows.filter((r) => r['outcome'] === 'dry');
  if (dry.length > 0) {
    const withheld = rows.filter((r) => r['route'] === 'skip');
    const wrongly = withheld.filter((r) => r['outcome'] === 'routing_withheld' || r['outcome'] === 'routing_false_spam');
    console.log('');
    console.log(`Dry run — no model was called, so there is no end-to-end number.`);
    console.log(`L2 routing ran: ${withheld.length}/${rows.length} withheld, ${dry.length} would have been classified.`);
    console.log(`Withheld with a real label in the sheet: ${wrongly.length}` +
      (wrongly.length ? `   ${wrongly.map((r) => `${r['email_id']}(${r['skip_reason']}→${r['gold_ticket_type']})`).join(' ')}` : ''));
    return;
  }

  const by = (o: Outcome) => rows.filter((r) => r['outcome'] === o);
  const ids = (o: Outcome) => by(o).map((r) => r['email_id']).join(' ');
  const correct = by('correct').length;

  const lines: string[] = [];
  lines.push('KAI-45 — layered pipeline, per-layer attribution');
  lines.push(`${new Date().toISOString()}`);
  lines.push(`model ${PROVIDER}/${MODEL}   stage ${STAGE}   rubric v${promptVersion}   ` +
    `routing ${ROUTING_POLICY_VERSION}   derivation ${DERIVATION_VERSION}`);
  lines.push(`corpus ${CORPUS.id}   ${rows.length} emails`);
  lines.push('');
  lines.push(`end to end: ${correct}/${rows.length} reproduce the sheet`);
  lines.push('');
  lines.push('Where the other answers come from:');
  for (const o of OUTCOMES) {
    if (o === 'correct') continue;
    const n = by(o).length;
    if (n === 0) continue;
    lines.push(`  ${o.padEnd(20)} ${String(n).padStart(3)}   ${ids(o)}`);
  }
  lines.push('');

  // The distinction the whole ticket turns on.
  const modelFixable = by('model_axes').length;
  const tableGap = by('table_gap').length;
  lines.push(`Fixable by the rubric:  ${modelFixable}   (another axis pair on that provenance row reaches the label)`);
  lines.push(`Fixable only by the table: ${tableGap}   (no pair reaches it — an axis or a cell is wrong)`);
  lines.push('');

  // Per class, against the sheet.
  const classes = [...new Set(rows.map((r) => r['gold_ticket_type']).filter(Boolean))].sort();
  lines.push('Per class in the sheet:');
  for (const c of classes) {
    const of = rows.filter((r) => r['gold_ticket_type'] === c);
    const ok = of.filter((r) => r['outcome'] === 'correct').length;
    lines.push(`  ${String(c).padEnd(10)} ${String(ok).padStart(3)}/${String(of.length).padStart(3)}`);
  }
  lines.push('');

  // What the model answered, so a collapsed axis is visible immediately. An
  // axis the model never varies carries no information, whatever the accuracy.
  const classified = rows.filter((r) => r['route'] === 'classify' && r['predicted_actionability']);
  if (classified.length > 0) {
    lines.push('Axis distribution over the classified set (a constant axis is a dead axis):');
    for (const axis of ['predicted_actionability', 'predicted_subject_matter'] as const) {
      const counts = new Map<string, number>();
      for (const r of classified) counts.set(r[axis] ?? '', (counts.get(r[axis] ?? '') ?? 0) + 1);
      const shown = [...counts.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n}`).join('   ');
      lines.push(`  ${axis.replace('predicted_', '').padEnd(15)} ${shown}`);
    }
  }

  const text = lines.join('\n') + '\n';
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(REPORT, text, 'utf-8');
  console.log('');
  console.log(text);
  console.log(`Report written to ${REPORT}`);
}

main().catch((err: unknown) => {
  console.error('\nFatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
