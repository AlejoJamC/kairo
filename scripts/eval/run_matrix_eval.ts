/**
 * KAI-93 -- the whole bench in one process, one terminal.
 *
 * Every model, every variant, every email, resolved sequentially by a single
 * command. Running the bench from several terminals is what made the previous
 * results unusable: two runs against one inference endpoint share it, so their
 * latency measured contention rather than model speed. One process cannot
 * contend with itself.
 *
 * It is interruptible. Ctrl+C finishes the classification in flight, flushes,
 * and exits; re-running the same command continues from the ledger and does
 * only the delta. EVAL_MAX_MINUTES / EVAL_MAX_CALLS stop it on their own, so
 * the bench can be worked through in sessions instead of one long block.
 */
import { join } from 'path';
import { readdir, readFile } from 'fs/promises';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { classifyEmailWithMeta, stripQuotedThread } from '../../packages/intelligence/src/index';
import { parseEml } from './lib/parse-eml';
import { getPromptVersion, DEFAULT_LANG } from '../../packages/intelligence/src/classification/prompt';
import { BENCH, ONBOARDING_BENCH, VARIANTS, cellSlug, bodyRule, cellKey, totalCells, variantsFor } from './lib/matrix';
import { Ledger } from './lib/ledger';
import { LOCAL_OLLAMA } from './lib/run-label';

const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const INPUT_DIR = join(SCRIPT_DIR, 'data/input/eml');
const OUTPUT_ROOT = process.env['EVAL_OUTPUT_ROOT'] ?? join(SCRIPT_DIR, 'data/output');
const LEDGER_PATH = join(OUTPUT_ROOT, '.matrix-state', 'ledger.jsonl');
const RUN_LOG = join(OUTPUT_ROOT, '.matrix-state', 'matrix_run.log');
const BC_FILE = join(SCRIPT_DIR, 'data/input/business_context.txt');

const TEMPERATURE = 0;
const TENANT_MAILBOX = process.env['EVAL_TENANT_MAILBOX'] ?? 'servicioalcliente2@encargasas.com';
const MAX_MINUTES = Number(process.env['EVAL_MAX_MINUTES'] ?? '0');
const MAX_CALLS = Number(process.env['EVAL_MAX_CALLS'] ?? '0');
const DRY = process.env['EVAL_MATRIX_DRY'] === '1';

const CSV_COLUMNS = [
  'email_id', 'filename', 'provider', 'model', 'prompt_version', 'prompt_lang',
  'pipeline_stage', 'business_context', 'tenant_mailbox', 'endpoint', 'tokens_per_second',
  'predicted_ticket_type', 'predicted_priority', 'predicted_category',
  'predicted_tone', 'predicted_urgency', 'confidence', 'processing_tier',
  'processing_time_ms', 'raw_reasoning', 'error',
] as const;

type Row = Record<(typeof CSV_COLUMNS)[number], string | number>;

function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Rows are appended as they are produced, not buffered to the end. An
 * interrupted run then leaves every variant's file valid and partial, which
 * is what makes a stop-and-resume workflow safe.
 */
function appendRow(dir: string, row: Row): void {
  const file = join(dir, 'pipeline_output_50.csv');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(file)) {
    writeFileSync(file, CSV_COLUMNS.join(',') + '\n', 'utf-8');
  }
  appendFileSync(file, CSV_COLUMNS.map((c) => csvCell(row[c])).join(',') + '\n', 'utf-8');
}

function log(line: string): void {
  mkdirSync(join(OUTPUT_ROOT, '.matrix-state'), { recursive: true });
  appendFileSync(RUN_LOG, `[${new Date().toISOString()}] ${line}\n`, 'utf-8');
}

function hhmm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

let stopping = false;
function requestStop(signal: string): void {
  if (stopping) process.exit(130); // second Ctrl+C: leave now
  stopping = true;
  console.log(`\n${signal} received — finishing the classification in flight, then stopping.`);
  console.log('Re-run the same command to continue from where this leaves off.\n');
}

/**
 * A finished run's bookkeeping is spent. It records which of `total` cells are
 * already on disk, and once every one of them is, it can only do harm: the next
 * run reads it, finds nothing left to do, and reports success having written
 * nothing. It holds no measurement — the CSVs do — so it is deleted, not kept.
 *
 * An interrupted run is left exactly as it is. Resuming is the whole reason the
 * ledger exists, and a config that grew (a model added) also reads as short of
 * total and correctly resumes into the delta.
 */
function dropFinishedLedger(total: number): boolean {
  if (!existsSync(LEDGER_PATH)) return false;
  if (new Ledger(LEDGER_PATH).completed < total) return false;
  rmSync(join(OUTPUT_ROOT, '.matrix-state'), { recursive: true, force: true });
  return true;
}

async function main(): Promise<void> {
  process.on('SIGINT', () => requestStop('SIGINT'));
  process.on('SIGTERM', () => requestStop('SIGTERM'));

  const promptVersion = (await getPromptVersion(DEFAULT_LANG)) ?? 'unknown';
  const businessContext = existsSync(BC_FILE) ? readFileSync(BC_FILE, 'utf-8').trim() : '';
  if (!businessContext) {
    console.error(`✗ ${BC_FILE} is missing or empty. Two of the four variants exist to`);
    console.error('  measure that field; without it they would silently repeat the other two.');
    process.exit(1);
  }

  const emails = (await readdir(INPUT_DIR)).filter((f) => f.endsWith('.eml')).sort();
  const total = totalCells(emails.length);

  if (dropFinishedLedger(total)) {
    console.log('Previous run was complete — its ledger is spent and was deleted. Starting fresh.');
    // Rows are appended, so a leftover CSV would be written a second time.
    const stale = BENCH.flatMap((m) => variantsFor(m).map((v) => cellSlug(m, v)))
      .filter((slug) => existsSync(join(OUTPUT_ROOT, slug, 'pipeline_output_50.csv')));
    if (stale.length > 0) {
      console.warn(`⚠  ${stale.length} run director(ies) still hold a CSV from that run ` +
        `(${stale[0]}${stale.length > 1 ? ', …' : ''}). Archive or delete them, or their rows will be duplicated.`);
    }
  }

  const ledger = new Ledger(LEDGER_PATH);

  console.log('Kairo Pipeline Eval — KAI-93 matrix');
  console.log(`Prompt: ${DEFAULT_LANG} v${promptVersion}   Temperature: ${TEMPERATURE}`);
  console.log(`Tenant mailbox: ${TENANT_MAILBOX} (sent in every variant, as production does)`);
  console.log(`Dataset: ${emails.length} emails`);
  console.log('─'.repeat(72));
  console.log('Variants per email, in this order:');
  for (const [i, v] of VARIANTS.entries()) {
    const r = bodyRule(v);
    console.log(`  ${i + 1}. ${v.id.padEnd(14)} body ${r.stripQuotes ? 'stripped' : 'raw     '} ` +
      `cap ${String(r.maxChars).padStart(6)}  businessContext ${v.businessContext ? 'yes' : 'no '}`);
    console.log(`     ${v.question}`);
  }
  console.log('─'.repeat(72));
  console.log('Models, in this order (fastest first, one finished before the next starts):');
  for (const [i, m] of BENCH.entries()) {
    const ids = variantsFor(m).map((v) => v.id).join(', ');
    console.log(`  ${i + 1}. ${m.label} — ${m.provider}/${m.model}   [${ids}]`);
  }
  console.log(`Tier 1 runs ${ONBOARDING_BENCH.length} of ${BENCH.length} models: ` +
    `${ONBOARDING_BENCH.map((m) => m.label).join(', ')} — the ones that cleared 0.80.`);
  console.log('─'.repeat(72));
  console.log(`Total cells: ${total}   already done: ${ledger.completed}   remaining: ${total - ledger.completed}`);
  if (MAX_MINUTES) console.log(`Will stop after ${MAX_MINUTES} minute(s).`);
  if (MAX_CALLS) console.log(`Will stop after ${MAX_CALLS} new call(s).`);
  console.log('Ctrl+C stops cleanly at any point; re-run to continue.');
  console.log('─'.repeat(72));

  log(`start — ${total} cells, ${ledger.completed} already done`);

  const startedAt = Date.now();
  let calls = 0;
  let failures = 0;

  // Model-major: switching models forces a reload on Ollama, so a model is
  // always finished before the next begins.
  for (const m of BENCH) {
    if (stopping) break;
    process.env['INTELLIGENCE_PROVIDER'] = m.provider;
    if (m.provider === 'ollama') process.env['OLLAMA_MODEL'] = m.model;
    else process.env['ANTHROPIC_MODEL'] = m.model;
    const endpoint = m.provider === 'ollama'
      ? (process.env['OLLAMA_BASE_URL'] ?? LOCAL_OLLAMA)
      : 'https://api.anthropic.com';

    console.log(`\n■ ${m.label}  (${m.provider}/${m.model})`);
    log(`model ${m.provider}/${m.model}`);

    // Email-major inside a model: the four variants of one email run back to
    // back. A run spanning hours drifts -- machine load, thermal state -- and
    // grouping by variant would measure variant 1 and variant 4 under
    // different conditions, contaminating the only comparison the matrix
    // exists to make. Interleaved, drift hits all four equally.
    for (const filename of emails) {
      if (stopping) break;
      const emailId = filename.replace(/\.eml$/, '');
      const parsed = parseEml(await readFile(join(INPUT_DIR, filename), 'utf-8'));

      for (const v of variantsFor(m)) {
        if (stopping) break;
        const key = cellKey(m, v, emailId);
        if (ledger.has(key)) continue;

        if (MAX_CALLS && calls >= MAX_CALLS) { stopping = true; break; }
        if (MAX_MINUTES && (Date.now() - startedAt) / 60000 >= MAX_MINUTES) { stopping = true; break; }

        const dir = join(OUTPUT_ROOT, cellSlug(m, v));
        const rule = bodyRule(v);
        const body = (rule.stripQuotes ? stripQuotedThread(parsed.body) : parsed.body)
          .slice(0, rule.maxChars);

        const base: Row = {
          email_id: emailId, filename, provider: m.provider, model: m.model,
          prompt_version: promptVersion, prompt_lang: DEFAULT_LANG,
          pipeline_stage: v.stage, business_context: v.businessContext ? 'yes' : 'no',
          tenant_mailbox: TENANT_MAILBOX, endpoint, tokens_per_second: '',
          predicted_ticket_type: '', predicted_priority: '', predicted_category: '',
          predicted_tone: '', predicted_urgency: '', confidence: '',
          processing_tier: '', processing_time_ms: '', raw_reasoning: '', error: '',
        };

        const t0 = performance.now();
        let ok = true;
        try {
          if (DRY) {
            appendRow(dir, { ...base, predicted_ticket_type: 'DRY', processing_time_ms: 0 });
          } else {
            const { result, meta } = await classifyEmailWithMeta({
              subject: parsed.subject, from: parsed.from, to: parsed.to, cc: parsed.cc,
              body, threadDepth: parsed.threadDepth, attachments: parsed.attachments,
              tenantMailbox: TENANT_MAILBOX,
              ...(v.businessContext ? { businessContext } : {}),
            }, { temperature: TEMPERATURE });
            const ms = Math.round(performance.now() - t0);
            appendRow(dir, {
              ...base, model: meta.model,
              tokens_per_second: meta.tokensPerSecond === null ? '' : Math.round(meta.tokensPerSecond * 10) / 10,
              predicted_ticket_type: result.type, predicted_priority: result.priority,
              predicted_category: result.category, predicted_tone: result.tone,
              predicted_urgency: result.urgency, confidence: result.confidence,
              processing_tier: 0, processing_time_ms: ms, raw_reasoning: result.reasoning,
            });
          }
        } catch (err: unknown) {
          ok = false;
          failures++;
          const message = err instanceof Error ? err.message : String(err);
          appendRow(dir, { ...base, processing_time_ms: Math.round(performance.now() - t0), error: message });
          log(`ERR ${key} — ${message}`);
        }

        // The row is on disk; only now is the cell considered done.
        const ms = Math.round(performance.now() - t0);
        ledger.record(key, ok, ms);
        calls++;

        const done = ledger.completed;
        const rate = (Date.now() - startedAt) / Math.max(calls, 1);
        const eta = hhmm(((total - done) * rate) / 1000);
        process.stdout.write(
          `\r  ${String(done).padStart(4)}/${total}  ${emailId} ${v.id.padEnd(14)} ` +
          `${ok ? '✓' : '✗'} ${String(ms).padStart(6)}ms   ETA ${eta}      `
        );
      }
    }
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log('\n' + '─'.repeat(72));
  console.log(`${stopping ? 'Stopped' : 'Complete'}: ${ledger.completed}/${total} cells done` +
    `  (${calls} this session, ${failures} failed)  elapsed ${hhmm(elapsed)}`);
  log(`stop — ${ledger.completed}/${total} done, ${calls} this session, ${failures} failed`);

  if (ledger.completed < total) {
    console.log('Re-run the same command to continue; finished cells are skipped.');
  } else {
    console.log('\nMetrics for each cell:');
    for (const m of BENCH) for (const v of variantsFor(m)) {
      console.log(`  bun run eval:metrics ${cellSlug(m, v)}`);
    }
  }
}

main().catch((err: unknown) => {
  console.error('\nFatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
