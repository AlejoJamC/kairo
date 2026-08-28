import { join } from 'path';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
// Relative import: scripts/eval is not a workspace package, so the
// `@kairo/intelligence` specifier does not resolve at runtime (the tsconfig
// `paths` alias only covers type-checking)
import { classifyEmailWithMeta, stripQuotedThread } from '../../packages/intelligence/src/index';
import { supportsTemperature } from '../../packages/intelligence/src/providers/anthropic/completion';
import { parseEml } from './lib/parse-eml';
import { writeCsv } from './lib/write-csv';
import { resolveRunLabel, STAGE_BODY_RULES, LOCAL_OLLAMA } from './lib/run-label';
import { getPromptVersion, DEFAULT_LANG } from '../../packages/intelligence/src/classification/prompt';

// Resolve paths relative to this file's directory
const SCRIPT_DIR = new URL('.', import.meta.url).pathname;
const INPUT_DIR = join(SCRIPT_DIR, 'data/input/eml');

// Each run writes into its own per-model directory so results from different
// providers/models never overwrite each other
const RUN = resolveRunLabel();
const OUTPUT_DIR = join(SCRIPT_DIR, 'data/output', RUN.slug);
const OUTPUT_CSV = join(OUTPUT_DIR, 'pipeline_output_50.csv');
const LOG_FILE = join(OUTPUT_DIR, 'pipeline_eval_run.log');

const TEMPERATURE = 0;

// How this run feeds the classifier, mirroring the production path named by
// EVAL_STAGE. The two tiers differ in both the cap and whether the quoted
// thread is stripped first, so measuring only one of them cannot answer which
// model serves which moment of the pipeline.
const BODY_RULE = STAGE_BODY_RULES[RUN.stage];

// Which rubric this run uses. Resolved once and written on every row, errors
// included: a failure belongs to a prompt as much as an answer does.
const PROMPT_LANG = DEFAULT_LANG;

// The mailbox this corpus was collected from. In production it comes from the
// connected Gmail account; here it has to be declared, because a classifier
// that does not know which side is the house cannot tell the tenant's own
// housekeeping from what it does for its customers.
const TENANT_MAILBOX = process.env['EVAL_TENANT_MAILBOX'] ?? '';

// One or two sentences on what the tenant does. Left empty until the account
// has one: the prompt then says the field is unavailable and asks for lower
// confidence, instead of the model inventing a line of business.
const BUSINESS_CONTEXT = process.env['EVAL_BUSINESS_CONTEXT'] ?? '';

// If this many emails fail consecutively from the very start, the model is
// systematically incompatible (wrong format, model not pulled, provider
// down) — abort instead of burning 15 minutes producing 50 identical errors
const FAIL_FAST_THRESHOLD = 5;

interface OutputRow {
  email_id: string;
  filename: string;
  provider: string;
  model: string;
  /**
   * Which rubric produced this row. Without it a stored run cannot be tied to
   * the prompt that made it, and comparing two runs says nothing.
   */
  prompt_version: string;
  prompt_lang: string;
  /** Which production path this row reproduces: onboarding or backfill. */
  pipeline_stage: string;
  /** Where inference ran. A latency figure means nothing without it. */
  endpoint: string;
  /**
   * Generation throughput reported by the provider. Wall-clock latency cannot
   * separate a slow model from a busy endpoint; this can.
   */
  tokens_per_second: number | string;
  predicted_ticket_type: string;
  predicted_priority: string;
  predicted_category: string;
  predicted_tone: string;
  predicted_urgency: string;
  confidence: number | string;
  processing_tier: number | string;
  processing_time_ms: number | string;
  raw_reasoning: string;
  error: string;
}

const CSV_COLUMNS: (keyof OutputRow)[] = [
  'email_id',
  'filename',
  'provider',
  'model',
  'prompt_version',
  'prompt_lang',
  'pipeline_stage',
  'endpoint',
  'tokens_per_second',
  'predicted_ticket_type',
  'predicted_priority',
  'predicted_category',
  'predicted_tone',
  'predicted_urgency',
  'confidence',
  'processing_tier',
  'processing_time_ms',
  'raw_reasoning',
  'error',
];

/**
 * A second run against the same inference endpoint does not fail — it shares
 * it. Both runs then measure an endpoint serving two clients, and their
 * latency roughly doubles while the model is unchanged, which silently turns
 * every timing in the output into a figure about the machine rather than the
 * model. Ollama reports what it is currently serving, so the condition is
 * detectable before a run starts rather than after the numbers are published.
 *
 * This warns and continues: sharing an endpoint is legitimate when only
 * quality is being measured. It must not be silent.
 */
async function warnIfEndpointBusy(): Promise<string | null> {
  if (RUN.provider !== 'ollama') return null;
  try {
    const res = await fetch(`${RUN.endpoint}/api/ps`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const { models } = (await res.json()) as { models?: { name?: string }[] };
    const loaded = (models ?? []).map((m) => m.name).filter(Boolean);
    if (loaded.length === 0) return null;
    return (
      `${RUN.endpoint} is already serving ${loaded.join(', ')}. ` +
      'If another eval is running against it, both runs share the endpoint and ' +
      'their latency measures contention, not model speed. Quality metrics stay valid.'
    );
  } catch {
    // The endpoint may not expose /api/ps, or may be remote and slow to
    // answer. Not being able to check is not a reason to block a run.
    return null;
  }
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
  await mkdir(OUTPUT_DIR, { recursive: true });

  const promptVersion = (await getPromptVersion(PROMPT_LANG)) ?? 'unknown';
  RUN.promptVersion = promptVersion;

  const allFiles = await readdir(INPUT_DIR);
  const emlFiles = allFiles
    .filter((f: string) => f.endsWith('.eml'))
    .sort();

  const total = emlFiles.length;
  const padWidth = String(total).length;

  // Claude 5-line models (Fable/Mythos/Opus/Sonnet 5) reject `temperature`
  // outright — the completion provider omits it for them, so run-to-run
  // reproducibility for those runs relies on the model's own default
  // sampling, not on the enforced temperature=0 used for every other model.
  const temperatureEnforced = RUN.provider !== 'anthropic' || supportsTemperature(RUN.model);
  const temperatureLabel = temperatureEnforced
    ? `${TEMPERATURE} (enforced)`
    : `n/a — not sent (removed param on ${RUN.model}); reproducibility not guaranteed`;

  const contextLabel = RUN.withoutContext
    ? 'WITHHELD (ablation — recipients, thread depth and attachments sent as unavailable)'
    : 'full (recipients, thread depth, attachments)';

  console.log('Kairo Pipeline Eval — KAI-106');
  console.log(`Run: ${RUN.provider} / ${RUN.model} → ${OUTPUT_DIR}`);
  console.log(`Prompt: ${PROMPT_LANG} v${promptVersion}`);
  console.log(
    `Stage:  ${RUN.stage} — body ${BODY_RULE.stripQuotes ? 'stripped of quoted thread' : 'raw, quotes intact'}, ` +
    `capped at ${BODY_RULE.maxChars.toLocaleString()} chars`
  );
  console.log(`Context: ${contextLabel}`);
  console.log(`Dataset: ${INPUT_DIR} (${total} files)`);
  console.log(`Temperature: ${temperatureLabel}`);
  console.log(`Endpoint: ${RUN.endpoint}${RUN.endpoint === LOCAL_OLLAMA ? ' (local default)' : ''}`);
  const busyWarning = await warnIfEndpointBusy();
  if (busyWarning) console.warn(`\n⚠  ${busyWarning}\n`);
  console.log('─'.repeat(44));

  const rows: OutputRow[] = [];
  const logLines: string[] = [
    `[${new Date().toISOString()}] Kairo Pipeline Eval — KAI-106`,
    `Run: ${RUN.provider} / ${RUN.model}`,
    `Prompt: ${PROMPT_LANG} v${promptVersion}`,
    `Stage: ${RUN.stage} (strip=${BODY_RULE.stripQuotes}, cap=${BODY_RULE.maxChars})`,
    `Context: ${contextLabel}`,
    `Dataset: ${INPUT_DIR} (${total} files)`,
    `Temperature: ${temperatureLabel}`,
    `Endpoint: ${RUN.endpoint}`,
    ...(busyWarning ? [`WARNING: ${busyWarning}`] : []),
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

      // Ablation: withholding the fields is not a second prompt — the template
      // is identical and buildPrompt renders the gaps as unavailable, which is
      // exactly what production sends from the call sites that lack them
      const classifierBody = (
        BODY_RULE.stripQuotes ? stripQuotedThread(parsed.body) : parsed.body
      ).slice(0, BODY_RULE.maxChars);

      const message = RUN.withoutContext
        ? { subject: parsed.subject, from: parsed.from, body: classifierBody }
        : {
            subject: parsed.subject,
            from: parsed.from,
            to: parsed.to,
            cc: parsed.cc,
            body: classifierBody,
            threadDepth: parsed.threadDepth,
            attachments: parsed.attachments,
            ...(TENANT_MAILBOX ? { tenantMailbox: TENANT_MAILBOX } : {}),
            ...(BUSINESS_CONTEXT ? { businessContext: BUSINESS_CONTEXT } : {}),
          };

      const { result, meta } = await classifyEmailWithMeta(message, {
        temperature: TEMPERATURE,
      });

      const elapsed = Math.round(performance.now() - emailStart);

      const typeLabel = result.type.padEnd(10);
      const catLabel = result.category.padEnd(14);
      console.log(
        `${label} ✓  ${elapsed}ms — ${typeLabel} / ${result.priority} / ${catLabel} (confidence: ${result.confidence.toFixed(2)})`
      );

      logLines.push(
        `[OK] ${filename} — ${elapsed}ms — ${result.type}/${result.priority}/${result.category}`
      );

      rows.push({
        email_id: emailId,
        filename,
        provider: RUN.provider,
        model: meta.model,
        prompt_version: RUN.promptVersion,
        prompt_lang: PROMPT_LANG,
        pipeline_stage: RUN.stage,
        endpoint: RUN.endpoint,
        tokens_per_second: meta.tokensPerSecond === null ? '' : Math.round(meta.tokensPerSecond * 10) / 10,
        predicted_ticket_type: result.type,
        predicted_priority: result.priority,
        predicted_category: result.category,
        predicted_tone: result.tone,
        predicted_urgency: result.urgency,
        confidence: result.confidence,
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
        provider: RUN.provider,
        model: RUN.model,
        prompt_version: RUN.promptVersion,
        prompt_lang: PROMPT_LANG,
        pipeline_stage: RUN.stage,
        endpoint: RUN.endpoint,
        tokens_per_second: '',
        predicted_ticket_type: '',
        predicted_priority: '',
        predicted_category: '',
        predicted_tone: '',
        predicted_urgency: '',
        confidence: '',
        processing_tier: '',
        processing_time_ms: elapsed,
        raw_reasoning: '',
        error: message,
      });

      errorCount++;
    }

    if (errorCount === idx && idx >= FAIL_FAST_THRESHOLD) {
      const abortMsg =
        `First ${idx} emails ALL failed — aborting run. The model/provider is ` +
        `systematically incompatible; fix that before re-running (see errors above).`;
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

  const errorSuffix =
    errorCount > 0 ? ` — ${errorCount} error(s). See ${LOG_FILE}` : '';
  console.log(`Completed: ${successCount}/${total}${errorSuffix}`);
  console.log(`Output:    ${OUTPUT_CSV}`);
  console.log(`Log:       ${LOG_FILE}`);
  console.log(`Duration:  ${formatDuration(totalDuration)}`);
}

main().catch((err: unknown) => {
  console.error(
    'Fatal error:',
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
