import { join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
// Relative import: scripts/eval is not a workspace package, so the
// `@kairo/intelligence` specifier does not resolve at runtime (the tsconfig
// `paths` alias only covers type-checking)
import { classifyEmailWithJev, createDecisionProvider, stripQuotedThread } from '../../packages/intelligence/src/index';
import { extractMailFacts } from '../../apps/api/src/lib/email/mail-facts';
import { parseEml } from './lib/parse-eml';
import { readEmlHeaders, tenantMailboxes } from './lib/eml-headers';
import { STAGE_BODY_RULES, slugify, type PipelineStage } from './lib/run-label';
import { PIPELINE_OUTPUT } from './lib/run-files';
import { writeCsv } from './lib/write-csv';
import { resolveCorpus } from './lib/corpus';

// ---------------------------------------------------------------------------
// KAI-55 Fase 4 — JEV against the same corpus and ground truth the matrix
// bench measures Anthropic/Ollama against, with the same input: every message
// carries the envelope facts (provenance), the tenant mailbox, and — on the
// backfill stage — the tenant's business context, built exactly as
// run_matrix_eval.ts builds them. A run that withholds any of the three is
// not comparable to the bench: provenance is a coordinate of the derivation
// key, and the business context is what separates `service` from `admin`.
//
// Writes the same pipeline_output.csv shape (predicted_* + confidence +
// error) into its own run directory, so `eval:metrics jev` reads it with no
// changes to compute_metrics.ts.
//
// The slug never changes between runs (there is one JEV provider), so this
// script refuses to overwrite an existing run instead of silently replacing
// it. Archive the run directory before running again.
// ---------------------------------------------------------------------------

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const CORPUS = resolveCorpus();
const INPUT_DIR = join(SCRIPT_DIR, CORPUS.emlDir);
const BC_FILE = join(SCRIPT_DIR, 'data/input/business_context.txt');

const STAGE: PipelineStage = process.env['EVAL_STAGE'] === 'onboarding' ? 'onboarding' : 'backfill';
const BODY_RULE = STAGE_BODY_RULES[STAGE];

// Same cell naming as run_matrix_eval.ts's cellSlug: backfill always carries
// the business context, onboarding never does — the stage names the cell.
const SLUG = slugify('jev') + (STAGE === 'onboarding' ? '-onboarding' : '');
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output', CORPUS.outputSubdir, SLUG);
const OUTPUT_CSV = join(OUTPUT_DIR, PIPELINE_OUTPUT);
const LOG_FILE = join(OUTPUT_DIR, 'pipeline_eval_run.log');

function refuseIfRunExists(): void {
  if (!existsSync(OUTPUT_CSV)) return;
  console.error(`✗ ${OUTPUT_CSV} already exists.`);
  console.error('  Running again would overwrite it. Archive that directory first (scripts/eval/data/output/archive/).');
  process.exit(1);
}

// Provenance needs every mailbox the tenant reads; the rendered state carries
// the first, as production does.
const TENANT_MAILBOXES_FOR_FACTS = tenantMailboxes();
const TENANT_MAILBOX = TENANT_MAILBOXES_FOR_FACTS[0]!;

/** backfill: the file's content, required. onboarding: never sent, as classifier-input.ts enforces. */
function resolveBusinessContext(): string | undefined {
  if (STAGE === 'onboarding') return undefined;
  const text = existsSync(BC_FILE) ? readFileSync(BC_FILE, 'utf-8').trim() : '';
  if (!text) {
    console.error(`✗ ${BC_FILE} is missing or empty. The backfill stage always carries the business context.`);
    process.exit(1);
  }
  return text;
}

// If this many emails fail consecutively from the very start, the provider is
// systematically unreachable (bad key, model name, outage) — abort instead of
// burning the whole corpus producing identical errors.
const FAIL_FAST_THRESHOLD = 5;

interface OutputRow {
  email_id: string;
  filename: string;
  provider: string;
  model: string;
  pipeline_stage: string;
  predicted_ticket_type: string;
  predicted_priority: string;
  predicted_category: string;
  predicted_tone: string;
  predicted_urgency: string;
  /**
   * min(actionability.confidence, subject_matter.confidence) — the two answers
   * derive.ts's TYPE_DERIVATION actually uses to produce `predicted_ticket_type`
   * (derive.ts:71). eval:metrics' calibration table buckets this column against
   * ticket_type correctness only (lib/calibration.ts), so this is the confidence
   * that question is actually asking about — the six-axis verdict confidence
   * (below) would fold in category/priority/tone/urgency, which ticket_type does
   * not depend on, and made the calibration table meaningless.
   */
  confidence: number | string;
  /** min across all six axes — the same number `logLlmCall` records in production shadow mode. Not read by eval:metrics; kept for reference. */
  verdict_confidence: number | string;
  processing_tier: number | string;
  processing_time_ms: number | string;
  raw_reasoning: string;
  error: string;
}

const CSV_COLUMNS: (keyof OutputRow)[] = [
  'email_id', 'filename', 'provider', 'model', 'pipeline_stage',
  'predicted_ticket_type', 'predicted_priority', 'predicted_category',
  'predicted_tone', 'predicted_urgency', 'confidence', 'verdict_confidence',
  'processing_tier', 'processing_time_ms', 'raw_reasoning', 'error',
];

/** The raw per-question answer shape `decision.value` actually carries at runtime — see classify-with-jev.ts's own `as unknown as` cast for the same fact. */
interface RawChoiceAnswer {
  confidence: number;
}

/**
 * The confidence of the two answers that determine `predicted_ticket_type`,
 * not the six-axis verdict confidence `result.confidence` folds every field
 * into. See the `confidence` field doc above for why this is the number
 * eval:metrics' calibration table needs.
 */
function ticketTypeConfidence(decisionValue: unknown): number {
  const answers = decisionValue as Record<string, RawChoiceAnswer>;
  const actionability = answers['actionability']?.confidence ?? 0;
  const subjectMatter = answers['subject_matter']?.confidence ?? 0;
  return Math.min(actionability, subjectMatter);
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function formatDuration(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function main(): Promise<void> {
  refuseIfRunExists();
  const businessContext = resolveBusinessContext();
  await mkdir(OUTPUT_DIR, { recursive: true });

  const provider = createDecisionProvider('jev');

  const allFiles = await readdir(INPUT_DIR);
  const emlFiles = allFiles.filter((f: string) => f.endsWith('.eml')).sort();

  const total = emlFiles.length;
  const padWidth = String(total).length;

  console.log('Kairo Pipeline Eval — JEV');
  console.log(`Run: jev / ${provider.model} → ${OUTPUT_DIR}`);
  console.log(
    `Stage:  ${STAGE} — body ${BODY_RULE.stripQuotes ? 'stripped of quoted thread' : 'raw, quotes intact'}, ` +
    `capped at ${BODY_RULE.maxChars.toLocaleString()} chars`
  );
  console.log(`Context: envelope facts yes · tenant mailbox yes · business context ${businessContext ? 'yes' : 'no'}`);
  console.log(`Dataset: ${INPUT_DIR} (${total} files)`);
  console.log('─'.repeat(44));

  const rows: OutputRow[] = [];
  const logLines: string[] = [
    `[${new Date().toISOString()}] Kairo Pipeline Eval — JEV`,
    `Run: jev / ${provider.model}`,
    `Stage: ${STAGE} (strip=${BODY_RULE.stripQuotes}, cap=${BODY_RULE.maxChars})`,
    `Context: facts=yes tenant_mailbox=yes business_context=${businessContext ? 'yes' : 'no'}`,
    `Dataset: ${INPUT_DIR} (${total} files)`,
    '',
  ];

  let errorCount = 0;
  const runStart = performance.now();

  for (let i = 0; i < emlFiles.length; i++) {
    const filename = emlFiles[i] as string;
    const idx = i + 1;
    const emailId = filename.replace(/\.eml$/, '');
    const label = `[${pad(idx, padWidth)}/${pad(total, padWidth)}]`;

    const emailStart = performance.now();

    try {
      const rawContent = await readFile(join(INPUT_DIR, filename), 'utf-8');
      const parsed = parseEml(rawContent);

      const classifierBody = (
        BODY_RULE.stripQuotes ? stripQuotedThread(parsed.body) : parsed.body
      ).slice(0, BODY_RULE.maxChars);

      // The envelope facts production computes before classifying, built as
      // run_matrix_eval.ts builds them. Without them deriveClassification
      // falls back to external provenance for every message.
      const facts = extractMailFacts({
        from: parsed.from,
        subject: parsed.subject,
        headers: readEmlHeaders(rawContent),
        tenantMailbox: TENANT_MAILBOXES_FOR_FACTS,
      });

      const message = {
        subject: parsed.subject,
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        body: classifierBody,
        threadDepth: parsed.threadDepth,
        attachments: parsed.attachments,
        tenantMailbox: TENANT_MAILBOX,
        facts,
        ...(businessContext ? { businessContext } : {}),
      };

      const { result, decision } = await classifyEmailWithJev(message, provider);
      const elapsed = Math.round(performance.now() - emailStart);

      const typeLabel = result.type.padEnd(10);
      const catLabel = result.category.padEnd(14);
      console.log(
        `${label} ✓  ${elapsed}ms — ${typeLabel} / ${result.priority} / ${catLabel} (confidence: ${result.confidence.toFixed(2)})`
      );
      logLines.push(`[OK] ${filename} — ${elapsed}ms — ${result.type}/${result.priority}/${result.category}`);

      rows.push({
        email_id: emailId,
        filename,
        provider: decision.provider,
        model: decision.modelVersion,
        pipeline_stage: STAGE,
        predicted_ticket_type: result.type,
        predicted_priority: result.priority,
        predicted_category: result.category,
        predicted_tone: result.tone,
        predicted_urgency: result.urgency,
        confidence: ticketTypeConfidence(decision.value),
        verdict_confidence: result.confidence,
        processing_tier: 0,
        processing_time_ms: elapsed,
        raw_reasoning: result.reasoning,
        error: '',
      });
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - emailStart);
      const message = err instanceof Error ? err.message : String(err);

      console.log(`${label} ✗  ERROR — ${message}`);
      logLines.push(`[ERR] ${filename} — ${elapsed}ms — ${message}`);

      rows.push({
        email_id: emailId,
        filename,
        provider: 'jev',
        model: provider.model,
        pipeline_stage: STAGE,
        predicted_ticket_type: '',
        predicted_priority: '',
        predicted_category: '',
        predicted_tone: '',
        predicted_urgency: '',
        confidence: '',
        verdict_confidence: '',
        processing_tier: '',
        processing_time_ms: elapsed,
        raw_reasoning: '',
        error: message,
      });

      errorCount++;
    }

    if (errorCount === idx && idx >= FAIL_FAST_THRESHOLD) {
      const abortMsg =
        `First ${idx} emails ALL failed — aborting run. The provider is ` +
        `systematically unreachable; fix that before re-running (see errors above).`;
      console.error('─'.repeat(44));
      console.error(`✗ ${abortMsg}`);
      logLines.push('', `ABORTED: ${abortMsg}`);
      await writeFile(LOG_FILE, logLines.join('\n') + '\n', 'utf-8');
      process.exit(1);
    }
  }

  console.log('─'.repeat(44));

  const totalDuration = Math.round(performance.now() - runStart);
  const successCount = total - errorCount;

  await writeFile(OUTPUT_CSV, writeCsv(rows, CSV_COLUMNS), 'utf-8');

  logLines.push('');
  logLines.push(`Completed: ${successCount}/${total} — ${errorCount} error(s)`);
  logLines.push(`Duration: ${formatDuration(totalDuration)}`);
  await writeFile(LOG_FILE, logLines.join('\n') + '\n', 'utf-8');

  const errorSuffix = errorCount > 0 ? ` — ${errorCount} error(s). See ${LOG_FILE}` : '';
  console.log(`Completed: ${successCount}/${total}${errorSuffix}`);
  console.log(`Output:    ${OUTPUT_CSV}`);
  console.log(`Log:       ${LOG_FILE}`);
  console.log(`Duration:  ${formatDuration(totalDuration)}`);
  console.log(`\nMetrics: bun run eval:metrics ${SLUG}`);
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
