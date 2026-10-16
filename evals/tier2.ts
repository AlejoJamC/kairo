import { resolve } from 'node:path';
import { createEvaluationRun, finishEvaluationRun, findEvaluationRun } from './results';
import { readPrivate, writePrivate } from './private-files';
import { captureSdkWarnings } from './warnings';
import { guardNetwork } from './network';
import { codeFingerprint } from './run';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';
import { withModelRouting } from '../packages/intelligence/src/config/model-context';
import { tier2Routing } from './tier2-routing';
import { loadHistoricalBaseline, selectHistoricalWindow, type HistoricalBaseline } from './tier2-scenario';
import { summarize, reviewTemplate, type Measurement, type Review } from './metrics';
import type { PipelineStep } from './onboarding-runtime';
import type { EvalCase } from './cases';
import { classificationQuality, proposalQuality, ticketClusters, qualityThresholds } from './quality';

export const tier2Steps = [
  { step: 'window_selection', executor: 'TIER_2_WINDOW_DAYS', condition: 'dated corpus messages inside virtual inbox window; exclude onboarding positions' },
  { step: 'routing', executor: 'preFilterEmail', condition: 'unprocessed historical message' },
  { step: 'classification', executor: 'classifyEmailWithMeta(backfill)', role: 'classification', condition: 'admitted by production routing' },
  { step: 'ticket_persistence', executor: 'tier2Background', condition: 'reuse existing thread or create ticket; preserve existing classification' },
  { step: 'historical_learning_evidence', executor: 'historical-analysis', role: 'evidence_analysis', condition: 'persisted source linked to ticket; available conversation and account context' },
  { step: 'historical_learning', executor: 'workflowQuestions(backfill)', role: 'knowledge_decision', condition: 'grounded evidence analysis succeeds' },
  { step: 'knowledge_candidate', executor: 'proposeEmailKnowledge(backfill)', role: 'knowledge_decision', condition: 'historical decision succeeds' },
  { step: 'knowledge_draft', executor: 'historical-knowledge-references', role: 'knowledge_draft', condition: 'candidate accepted for drafting' },
  { step: 'knowledge_validation', executor: 'source reference resolution and semantic validation', role: 'validation', condition: 'draft references existing source fragments' },
  { step: 'decision_history', executor: 'recordWorkflowResult', condition: 'conclusions, missing evidence and proposals remain reviewable' },
  { step: 'idempotency', executor: 'processDecisionWork replay', condition: 'completed work produces no additional effects or inference' },
] as const;

interface Tier2Deps {
  loadCorpus?: typeof import('./corpus').loadCorpus;
  loadBaseline?: typeof loadHistoricalBaseline;
  createRuntime?: typeof import('./tier2-runtime').createTier2Runtime;
}
export class HistoricalEvaluationError extends Error {
  readonly code: string;
  readonly runId?: string;
  constructor(code: string, runId?: string) { super(code); this.name = 'HistoricalEvaluationError'; this.code = code; this.runId = runId; }
}
const scenarioErrors = new Set([
  'EVAL_BASELINE_NOT_FOUND', 'EVAL_BASELINE_RUNNING', 'EVAL_BASELINE_INVALID', 'EVAL_BASELINE_ACCOUNT',
  'EVAL_BASELINE_KNOWLEDGE_STATE', 'EVAL_BASELINE_LINKAGE', 'EVAL_WINDOW_INVALID',
  'EVAL_BASELINE_CORPUS_MISMATCH', 'EVAL_BASELINE_CORPUS_CHANGED', 'EVAL_CORPUS_DATES_MISSING', 'EVAL_THREAD_BASELINE_CONFLICT',
]);

function measurements(result: Awaited<ReturnType<Awaited<ReturnType<typeof import('./tier2-runtime').createTier2Runtime>>['execute']>>,
  cases: EvalCase[]) {
  const common = { abstain: null, requests: [], calls: [], safety: result.safety, prediction: {}, latencyMs: 0 };
  const classification: Measurement[] = cases.map((example): Measurement => {
    const found = result.classified.find(item => item.example.id === example.id);
    const message = result.tables['messages']!.find(row => row['external_id'] === `acme-message-${example.id}`);
    const filtered = message?.['classification_status'] === 'skipped' && message['skip_reason'] !== 'circuit_breaker_open';
    const classificationCase: EvalCase = { ...example, contract: 'historical_learning', rubric: [
      'Classification follows the backfill contract and preserves missing business context.',
      'Existing tickets retain human decisions and classification.',
    ] };
    return { ...common, case: classificationCase, status: found || filtered ? 'completed' : 'failed',
      prediction: found ? { type: found.result.result.type, priority: found.result.verdict.priority,
        urgency: found.result.verdict.urgency, category: found.result.verdict.category, tone: found.result.verdict.tone }
        : message?.['skip_reason'] === 'spam_filtered' ? { type: 'spam' } : {},
      abstain: found?.result.abstain ?? null,
      latencyMs: result.steps.filter(step => step.case === example.id && step.step === 'classification').reduce((sum, step) => sum + (step.latencyMs ?? 0), 0),
      output: found?.result ?? message ?? null };
  });
  const learning: Measurement[] = result.learning.map(item => {
    const history = result.tables['ticket_decision_history']!.filter(row => row['ticket_id'] === item.ticketId && row['message_id'] === item.messageId);
    const value = history.at(-1)?.['result'] as { judgments?: Record<string, string>; analysis?: { missing?: string[]; observations?: unknown[] } } | undefined;
    return { ...common, case: { ...cases.find(row => row.id === item.case)!, contract: 'historical_learning', expected: {}, rubric: [
      'Every material conclusion is supported by the cited conversation evidence.',
      'Attempted actions are distinguished from confirmed outcomes; silence does not prove resolution.',
      'Business facts, rules and exceptions preserve their scope and remain proposals.',
      'Contradictions, missing history and unavailable context remain explicit.',
      'Proposals add reusable information rather than restating or duplicating the case.',
    ] }, status: item.status, prediction: value?.judgments ?? {},
      latencyMs: [...result.steps].reverse().find(step => step.case === item.case && step.step === 'historical_learning' && !step.model)?.latencyMs ?? 0,
      output: { history, proposals: result.steps.filter(step => step.case === item.case && step.step === 'knowledge_proposals').map(step => step.output) } };
  });
  return { classification, learning };
}

export async function tier2Main(args: string[], deps: Tier2Deps = {}) {
  if (args[0] === 'report' || args[0] === 'report-classification') return tier2Command(args, deps);
  let routing: ReturnType<typeof tier2Routing>;
  try { routing = tier2Routing(); }
  catch { throw new HistoricalEvaluationError('EVAL_MODEL_CONFIGURATION'); }
  return withModelRouting(routing.context, () => tier2Command(args, deps, routing));
}

async function tier2Command(args: string[], deps: Tier2Deps, policy?: ReturnType<typeof tier2Routing>) {
  const [command = 'plan', dataset = 'main', rawBudget, baselineSelector = 'latest'] = args;
  if (!['main', 'coverage'].includes(dataset)) throw new HistoricalEvaluationError('EVAL_DATASET');
  const corpusId = dataset as 'main' | 'coverage';
  const classificationOnly = ['classify', 'plan-classification', 'report-classification'].includes(command);
  const mode = classificationOnly ? 'tier2-classification' : 'tier2';
  if (command === 'report' || command === 'report-classification') {
    const saved = await findEvaluationRun(mode, corpusId, rawBudget ?? 'latest');
    const rows = JSON.parse(await readPrivate(resolve(saved.directory, 'measurements.json'))) as { classification: Measurement[]; learning: Measurement[] };
    const reviews = JSON.parse(await readPrivate(resolve(saved.directory, 'reviews.json'))) as Review[];
    const report = JSON.parse(await readPrivate(resolve(saved.directory, 'report.json'))) as Record<string, unknown>;
    const run = JSON.parse(await readPrivate(resolve(saved.directory, 'run.json'))) as { tables: Record<string, Record<string, unknown>[]>; steps: PipelineStep[] };
    await writePrivate(resolve(saved.directory, 'report.json'), { ...report,
      quality: { classification: classificationQuality(rows.classification, ticketClusters(run.tables)),
        proposals: proposalQuality(run.steps) }, reviewedMetrics: summarize([...rows.classification, ...rows.learning], reviews) });
    return { run: saved.name, directory: saved.directory, reportUpdated: true };
  }
  if (!['plan', 'execute', 'classify', 'plan-classification'].includes(command)) throw new HistoricalEvaluationError('EVAL_COMMAND');
  if (baselineSelector !== 'latest' && !/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/.test(baselineSelector)) throw new HistoricalEvaluationError('EVAL_BASELINE_SELECTOR');
  let config: typeof import('../packages/env').env;
  let routing: ReturnType<typeof tier2Routing>;
  let routes: ReturnType<typeof resolveModelRoute>[];
  let auxiliary: { shadow: boolean; canary: boolean; model: string | null };
  try {
    process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
    config = (await import('../packages/env')).env;
    routing = policy ?? tier2Routing();
    routes = routing.routes;
    const { getFlag } = await import('../packages/feature-flags/src/index');
    const shadow = getFlag('enable_jev_shadow_classification');
    const canary = getFlag('enable_jev_canary');
    const legacyModel = process.env['JEV_MODEL'] ?? 'typesafe-ai/jev';
    auxiliary = { shadow, canary, model: shadow || canary ? legacyModel === 'jev-latest' ? 'typesafe-ai/jev' : legacyModel : null };
  } catch { throw new HistoricalEvaluationError('EVAL_MODEL_CONFIGURATION'); }
  const maximum = routing.classificationCallsPerEmail + (classificationOnly ? 0 : 5) + Number(auxiliary.shadow) + Number(auxiliary.canary);
  const explicitBudget = rawBudget === undefined ? null : Number(rawBudget);
  if (explicitBudget !== null && (!Number.isSafeInteger(explicitBudget) || explicitBudget < 1)) throw new HistoricalEvaluationError('EVAL_REQUEST_LIMIT');
  const plan = { dataset, mode, scope: classificationOnly ? 'classification and ticket ingestion only' : 'historical knowledge workflow', contract: 'historical_learning', windowDays: config.TIER_2_WINDOW_DAYS,
    baseline: baselineSelector, selection: 'all dated messages in the configured window, excluding the saved onboarding positions',
    clock: 'newest corpus message; UTC calendar-day cutoff', routes, ensemble: routing.ensemble, auxiliary,
    modelPolicy: { scope: routing.scope, classificationMode: routing.classificationMode, tasks: routing.tasks },
    callsPerAdmittedEmail: { classification: routing.classificationCallsPerEmail, evidence: classificationOnly ? 0 : 1, historicalDecision: classificationOnly ? 0 : 1,
      knowledgeCandidate: classificationOnly ? 0 : 1, draftIfCandidate: classificationOnly ? 0 : 1, validationIfGrounded: classificationOnly ? 0 : 1,
      shadowIfEnabledAndNewTicket: Number(auxiliary.shadow), canaryIfEnabledAndEligible: Number(auxiliary.canary), maximum },
    requestLimit: explicitBudget ?? 'eligible messages × maximum calls per message', qualityThresholds,
    steps: classificationOnly ? tier2Steps.slice(0, 4) : tier2Steps,
    boundary: 'production Tier 2 handler and learning services; replayed Gmail reads, in-memory storage and enqueue trigger fixture; no live Gmail, database, Inngest, human approval or Tier 3 execution' };
  if (command === 'plan' || command === 'plan-classification') return { ...plan, network: false };

  const saved = await createEvaluationRun(mode, corpusId);
  const originalFetch = globalThis.fetch;
  const originalConsole = { ...console };
  const warnings = captureSdkWarnings();
  const diagnostics: unknown[][] = [];
  const trace: PipelineStep[] = [];
  let checkpoint = Promise.resolve();
  let phase = 'EVAL_BASELINE_LOAD';
  let network: ReturnType<typeof guardNetwork> | undefined;
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => {
    diagnostics.push(values.map(value => value instanceof Error ? { name: value.name, message: value.message } : value));
  };
  // Setup and corpus reads have no network permission either.
  globalThis.fetch = Object.assign(async () => { throw new Error('Evaluation setup network rejected'); }, originalFetch) as typeof fetch;
  try {
    const baseline: HistoricalBaseline = await (deps.loadBaseline ?? loadHistoricalBaseline)(corpusId, baselineSelector);
    phase = 'EVAL_CORPUS_LOAD';
    const corpus = await (deps.loadCorpus ?? (await import('./corpus')).loadCorpus)(corpusId);
    const selection = selectHistoricalWindow(corpus, baseline, config.TIER_2_WINDOW_DAYS);
    const requestLimit = explicitBudget ?? Math.max(1, selection.cases.length * maximum);
    network = guardNetwork(requestLimit, originalFetch);
    globalThis.fetch = network.fetch;
    const manifest = { ...plan, requestLimit, maximumLogicalCalls: selection.cases.length * maximum,
      ...await codeFingerprint(), run: saved.name, createdAt: saved.startedAt, baseline: baseline.run,
      anchor: selection.anchor, after: selection.after, positions: selection.cases.map(row => row.id),
      population: corpus.length, selected: selection.cases.length, exclusions: selection.exclusions };
    await writePrivate(resolve(saved.directory, 'manifest.json'), manifest);
    originalConsole.log(JSON.stringify({ run: saved.name, directory: saved.directory, eligible: selection.cases.length,
      baseline: baseline.run, windowDays: config.TIER_2_WINDOW_DAYS, routes, auxiliary, callsPerAdmittedEmail: plan.callsPerAdmittedEmail, requestLimit }));
    phase = 'EVAL_RUNTIME_SETUP';
    const runtime = await (deps.createRuntime ?? (await import('./tier2-runtime')).createTier2Runtime)(selection, baseline, {}, step => {
      trace.push(step);
      if (['classify-batch', 'historical_learning', 'idempotency'].includes(step.step) || step.status === 'failed') {
        const snapshot = structuredClone(trace);
        checkpoint = checkpoint.then(() => writePrivate(resolve(saved.directory, 'trace.json'), snapshot));
      }
      originalConsole.log(JSON.stringify({ case: step.case, step: step.step, status: step.status }));
    }, () => network!.stopped);
    phase = 'EVAL_EXECUTION';
    const result = await runtime.execute({ learning: !classificationOnly });
    phase = 'EVAL_PRIVATE_WRITE';
    const rows = measurements(result, selection.cases);
    await checkpoint;
    await writePrivate(resolve(saved.directory, 'trace.json'), trace);
    await writePrivate(resolve(saved.directory, 'run.json'), { manifest, ...result, requests: network.requests, responses: network.responses });
    await writePrivate(resolve(saved.directory, 'measurements.json'), rows);
    await writePrivate(resolve(saved.directory, 'reviews.json'), reviewTemplate([...rows.classification, ...rows.learning]));
    const baselineArticles = new Set(result.initial['kb_articles']!.map(row => row['id']));
    const baselineLearnings = new Set(result.initial['operational_learning']!.map(row => row['id']));
    const report = { run: saved.name, mode, baseline: baseline.run, selected: selection.cases.length,
      classified: result.classified.length, learningAttempted: result.learning.length,
      learningCompleted: result.learning.filter(item => item.status === 'completed').length,
      articles: result.tables['kb_articles']!.filter(row => !baselineArticles.has(row['id'])).length,
      learnings: result.tables['operational_learning']!.filter(row => !baselineLearnings.has(row['id'])).length,
      ticketsCreated: result.tables['tickets']!.length - result.initial['tickets']!.length,
      failedCases: rows.classification.filter(row => row.status === 'failed').length + rows.learning.filter(row => row.status === 'failed').length,
      failedSteps: trace.filter(step => step.status === 'failed').length, stopped: network.stopped,
      safety: result.safety, warningCount: warnings.count(), requests: network.requests.length,
      costUsd: network.requests.length && network.requests.every(row => row.costUsd !== null) ? network.requests.reduce((sum, row) => sum + row.costUsd!, 0) : null,
      classification: summarize(rows.classification), knowledge: summarize(rows.learning),
      quality: { classification: classificationQuality(rows.classification, ticketClusters(result.tables)),
        proposals: proposalQuality(result.steps) },
      knowledgeQuality: classificationOnly ? 'not evaluated' : 'pending human review', infrastructureVerified: false, emptyWindow: selection.cases.length === 0 };
    await writePrivate(resolve(saved.directory, 'report.json'), report);
    const failed = report.failedCases > 0 || report.failedSteps > 0 || network.stopped || Object.values(result.safety).some(value => !value);
    if (failed) process.exitCode = 1;
    await finishEvaluationRun(saved, failed ? 'failed' : 'completed');
    return { run: saved.name, mode, directory: saved.directory, selected: report.selected, classified: report.classified,
      learningCompleted: report.learningCompleted, pendingProposals: report.articles + report.learnings,
      failedCases: report.failedCases, requests: report.requests, emptyWindow: report.emptyWindow };
  } catch (error) {
    diagnostics.push([error instanceof Error ? { name: error.name, message: error.message } : { failed: true }]);
    await finishEvaluationRun(saved, 'failed');
    const known = error instanceof Error && scenarioErrors.has(error.message) ? error.message : phase;
    throw new HistoricalEvaluationError(known, saved.name);
  } finally {
    Object.assign(console, originalConsole);
    globalThis.fetch = originalFetch;
    warnings.restore();
    await checkpoint;
    await writePrivate(resolve(saved.directory, 'trace.json'), trace);
    await writePrivate(resolve(saved.directory, 'diagnostics.json'), diagnostics);
    await writePrivate(resolve(saved.directory, 'warnings.json'), warnings.events);
  }
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await tier2Main(process.argv.slice(2)), null, 2)); }
  catch (error) {
    const code = error instanceof HistoricalEvaluationError ? error.code : 'EVAL_SETUP';
    const run = error instanceof HistoricalEvaluationError && error.runId ? ` Run: ${error.runId}.` : '';
    console.error(`Historical evaluation stopped: ${code}.${run} Raw diagnostics remain private.`);
    process.exitCode = 1;
  }
}
