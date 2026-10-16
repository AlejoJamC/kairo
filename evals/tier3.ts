import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createEvaluationRun, finishEvaluationRun, findEvaluationRun } from './results';
import { readPrivate, writePrivate } from './private-files';
import { captureSdkWarnings } from './warnings';
import { guardNetwork } from './network';
import { codeFingerprint } from './run';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';
import { withModelRouting } from '../packages/intelligence/src/config/model-context';
import { tier3Routing } from './tier3-routing';
import { createDeferredScenario, selectDeferredCorpus, type DeferredScenario } from './tier3-scenario';
import { summarize, reviewTemplate, type Measurement, type Review } from './metrics';
import type { PipelineStep } from './onboarding-runtime';
import type { EvalCase } from './cases';
import { classificationQuality, proposalQuality, ticketClusters, qualityThresholds } from './quality';

export const tier3Steps = [
  { step: 'corpus_selection', executor: 'supplied corpus', condition: 'all corpus messages, independent of age and previous evaluations' },
  { step: 'routing', executor: 'preFilterEmail', condition: 'unprocessed historical message' },
  { step: 'classification', executor: 'classifyEmailWithMeta(backfill)', role: 'classification', condition: 'admitted by production routing' },
  { step: 'ticket_persistence', executor: 'processTier3Messages', condition: 'reuse existing thread or create ticket; preserve existing classification' },
  { step: 'historical_learning_evidence', executor: 'historical-analysis', role: 'evidence_analysis', condition: 'persisted source linked to ticket; available conversation and account context' },
  { step: 'historical_learning', executor: 'workflowQuestions(backfill)', role: 'knowledge_decision', condition: 'grounded evidence analysis succeeds' },
  { step: 'knowledge_candidate', executor: 'proposeEmailKnowledge(backfill)', role: 'knowledge_decision', condition: 'historical decision succeeds' },
  { step: 'knowledge_draft', executor: 'historical-knowledge', role: 'knowledge_draft', condition: 'candidate accepted for drafting' },
  { step: 'knowledge_validation', executor: 'exact source quotations and semantic validation', role: 'validation', condition: 'draft has valid exact source quotations' },
  { step: 'decision_history', executor: 'recordWorkflowResult', condition: 'conclusions, missing evidence and proposals remain reviewable' },
  { step: 'historical_closure', executor: 'enqueue_pending_knowledge fixture', condition: 'enabled end-of-history check; no approved versions means no enrichment work' },
  { step: 'idempotency', executor: 'processDecisionWork replay', condition: 'completed work produces no additional effects or inference' },
] as const;

interface Tier3Deps {
  loadCorpus?: typeof import('./corpus').loadCorpus;
  createScenario?: typeof createDeferredScenario;
  createRuntime?: typeof import('./tier3-runtime').createTier3Runtime;
}
export class HistoricalEvaluationError extends Error {
  readonly code: string;
  readonly runId?: string;
  constructor(code: string, runId?: string) { super(code); this.name = 'HistoricalEvaluationError'; this.code = code; this.runId = runId; }
}
const scenarioErrors = new Set([
  'EVAL_CORPUS_EMPTY', 'EVAL_NO_UNPROCESSED_CASES', 'EVAL_THREAD_BASELINE_CONFLICT',
  'EVAL_SCENARIO_INVALID', 'EVAL_SCENARIO_KNOWLEDGE_STATE', 'EVAL_SCENARIO_SOURCE_CHANGED',
  'EVAL_SCENARIO_LINKAGE', 'EVAL_CORPUS_POSITION_INVALID',
]);

function measurements(result: Awaited<ReturnType<Awaited<ReturnType<typeof import('./tier3-runtime').createTier3Runtime>>['execute']>>,
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

export async function tier3Main(args: string[], deps: Tier3Deps = {}) {
  if (args[0] === 'report') return tier3Command(args, deps);
  let routing: ReturnType<typeof tier3Routing>;
  try { routing = tier3Routing(); }
  catch { throw new HistoricalEvaluationError('EVAL_MODEL_CONFIGURATION'); }
  return withModelRouting(routing.context, () => tier3Command(args, deps, routing));
}

async function tier3Command(args: string[], deps: Tier3Deps, policy?: ReturnType<typeof tier3Routing>) {
  const [command = 'plan', dataset = 'main', rawBudget] = args;
  if (args.length > 3) throw new HistoricalEvaluationError('EVAL_ARGUMENTS');
  if (!['main', 'coverage'].includes(dataset)) throw new HistoricalEvaluationError('EVAL_DATASET');
  const corpusId = dataset as 'main' | 'coverage';
  const mode = 'tier3';
  if (command === 'report') {
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
  if (!['plan', 'execute'].includes(command)) throw new HistoricalEvaluationError('EVAL_COMMAND');
  let routing: ReturnType<typeof tier3Routing>;
  let routes: ReturnType<typeof resolveModelRoute>[];
  let auxiliary: { shadow: boolean; canary: boolean; model: string | null };
  try {
    process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
    routing = policy ?? tier3Routing();
    routes = routing.routes;
    const { getFlag } = await import('../packages/feature-flags/src/index');
    const shadow = getFlag('enable_jev_shadow_classification');
    const canary = getFlag('enable_jev_canary');
    const legacyModel = process.env['JEV_MODEL'] ?? 'typesafe-ai/jev';
    auxiliary = { shadow, canary, model: shadow || canary ? legacyModel === 'jev-latest' ? 'typesafe-ai/jev' : legacyModel : null };
  } catch { throw new HistoricalEvaluationError('EVAL_MODEL_CONFIGURATION'); }
  const maximum = routing.classificationCallsPerEmail + 5 + Number(auxiliary.shadow) + Number(auxiliary.canary);
  const explicitBudget = rawBudget === undefined ? null : Number(rawBudget);
  if (explicitBudget !== null && (!Number.isSafeInteger(explicitBudget) || explicitBudget < 1)) throw new HistoricalEvaluationError('EVAL_REQUEST_LIMIT');
  const plan = { dataset, mode, scope: 'historical knowledge workflow', contract: 'historical_learning',
    scenario: 'isolated corpus; no previous evaluation required', selection: 'all supplied corpus messages; source dates unchanged',
    clock: 'newest corpus message, or execution time if no dated sources; no age eligibility filter', routes, ensemble: routing.ensemble, auxiliary,
    modelPolicy: { scope: routing.scope, classificationMode: routing.classificationMode, tasks: routing.tasks },
    callsPerAdmittedEmail: { classification: routing.classificationCallsPerEmail, evidence: 1, historicalDecision: 1,
      knowledgeCandidate: 1, draftIfCandidate: 1, validationIfGrounded: 1,
      shadowIfEnabledAndNewTicket: Number(auxiliary.shadow), canaryIfEnabledAndEligible: Number(auxiliary.canary), maximum },
    requestLimit: explicitBudget ?? 'eligible messages × maximum calls per message', qualityThresholds,
    steps: tier3Steps,
    boundary: 'production Tier 3 message processor and historical learning services; isolated storage and SQL enqueue fixtures; mailbox calendar selection, live Gmail, database, Inngest and human approval are not evaluated' };
  if (command === 'plan') return { ...plan, network: false };

  const saved = await createEvaluationRun(mode, corpusId);
  const originalFetch = globalThis.fetch;
  const originalConsole = { ...console };
  const warnings = captureSdkWarnings();
  const diagnostics: unknown[][] = [];
  const trace: PipelineStep[] = [];
  let checkpoint = Promise.resolve();
  let phase = 'EVAL_CORPUS_LOAD';
  let network: ReturnType<typeof guardNetwork> | undefined;
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => {
    diagnostics.push(values.map(value => value instanceof Error ? { name: value.name, message: value.message } : value));
  };
  // Setup and corpus reads have no network permission either.
  globalThis.fetch = Object.assign(async () => { throw new Error('Evaluation setup network rejected'); }, originalFetch) as typeof fetch;
  try {
    const corpus = await (deps.loadCorpus ?? (await import('./corpus')).loadCorpus)(corpusId);
    const scenario: DeferredScenario = (deps.createScenario ?? createDeferredScenario)(corpus);
    const selection = selectDeferredCorpus(corpus, scenario);
    const requestLimit = explicitBudget ?? Math.max(1, selection.cases.length * maximum);
    network = guardNetwork(requestLimit, originalFetch);
    globalThis.fetch = network.fetch;
    const manifest = { ...plan, requestLimit, maximumLogicalCalls: selection.cases.length * maximum,
      ...await codeFingerprint(), handlerHash: createHash('sha256').update(await readFile(new URL('../apps/api/src/functions/pipeline/tier3-deferred.ts', import.meta.url))).digest('hex'), run: saved.name, createdAt: saved.startedAt, scenario: 'isolated',
      anchor: selection.anchor, positions: selection.cases.map(row => row.id),
      population: corpus.length, selected: selection.cases.length, exclusions: selection.exclusions };
    await writePrivate(resolve(saved.directory, 'manifest.json'), manifest);
    originalConsole.log(JSON.stringify({ run: saved.name, directory: saved.directory, eligible: selection.cases.length,
      scenario: 'isolated', routes, auxiliary, callsPerAdmittedEmail: plan.callsPerAdmittedEmail, requestLimit }));
    phase = 'EVAL_RUNTIME_SETUP';
    const runtime = await (deps.createRuntime ?? (await import('./tier3-runtime')).createTier3Runtime)(selection, scenario, {}, step => {
      trace.push(step);
      if (['classify-batch', 'historical_learning', 'idempotency'].includes(step.step) || step.status === 'failed') {
        const snapshot = structuredClone(trace);
        checkpoint = checkpoint.then(() => writePrivate(resolve(saved.directory, 'trace.json'), snapshot));
      }
      originalConsole.log(JSON.stringify({ case: step.case, step: step.step, status: step.status }));
    }, () => network!.stopped);
    phase = 'EVAL_EXECUTION';
    const result = await runtime.execute();
    phase = 'EVAL_PRIVATE_WRITE';
    const rows = measurements(result, selection.cases);
    await checkpoint;
    await writePrivate(resolve(saved.directory, 'trace.json'), trace);
    await writePrivate(resolve(saved.directory, 'run.json'), { manifest, ...result, requests: network.requests, responses: network.responses });
    await writePrivate(resolve(saved.directory, 'measurements.json'), rows);
    await writePrivate(resolve(saved.directory, 'reviews.json'), reviewTemplate([...rows.classification, ...rows.learning]));
    const baselineArticles = new Set(result.initial['kb_articles']!.map(row => row['id']));
    const baselineLearnings = new Set(result.initial['operational_learning']!.map(row => row['id']));
    const report = { run: saved.name, mode, scenario: 'isolated', selected: selection.cases.length,
      classified: result.classified.length, learningAttempted: result.learning.length,
      learningCompleted: result.learning.filter(item => item.status === 'completed').length,
      articles: result.tables['kb_articles']!.filter(row => !baselineArticles.has(row['id'])).length,
      learnings: result.tables['operational_learning']!.filter(row => !baselineLearnings.has(row['id'])).length,
      historicalClosure: result.historicalClosure,
      ticketsCreated: result.tables['tickets']!.length - result.initial['tickets']!.length,
      failedCases: rows.classification.filter(row => row.status === 'failed').length + rows.learning.filter(row => row.status === 'failed').length,
      failedSteps: trace.filter(step => step.status === 'failed').length, stopped: network.stopped,
      safety: result.safety, warningCount: warnings.count(), requests: network.requests.length,
      costUsd: network.requests.length && network.requests.every(row => row.costUsd !== null) ? network.requests.reduce((sum, row) => sum + row.costUsd!, 0) : null,
      classification: summarize(rows.classification), knowledge: summarize(rows.learning),
      quality: { classification: classificationQuality(rows.classification, ticketClusters(result.tables)),
        proposals: proposalQuality(result.steps) },
      knowledgeQuality: 'pending human review', infrastructureVerified: false };
    await writePrivate(resolve(saved.directory, 'report.json'), report);
    const failed = report.failedCases > 0 || report.failedSteps > 0 || network.stopped || Object.values(result.safety).some(value => !value);
    if (failed) process.exitCode = 1;
    await finishEvaluationRun(saved, failed ? 'failed' : 'completed');
    return { run: saved.name, mode, directory: saved.directory, selected: report.selected, classified: report.classified,
      learningCompleted: report.learningCompleted, pendingProposals: report.articles + report.learnings,
      failedCases: report.failedCases, requests: report.requests };
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
  try { console.log(JSON.stringify(await tier3Main(process.argv.slice(2)), null, 2)); }
  catch (error) {
    const code = error instanceof HistoricalEvaluationError ? error.code : 'EVAL_SETUP';
    const run = error instanceof HistoricalEvaluationError && error.runId ? ` Run: ${error.runId}.` : '';
    console.error(`Historical evaluation stopped: ${code}.${run} Raw diagnostics remain private.`);
    process.exitCode = 1;
  }
}
