import { resolve } from 'node:path';
import { resolveModelRoute, type ModelRole, type ModelRoute } from '../packages/intelligence/src/config/model-roles';
import { GatewayClient, gatewayKey } from '../packages/intelligence/src/providers/gateway/client';
import { createEvaluationRun, findEvaluationRun, finishEvaluationRun } from './results';
import { readPrivate, writePrivate } from './private-files';
import { summarize, reviewTemplate, type Measurement, type Review } from './metrics';
import { qualityThresholds, proposalQuality } from './quality';
import { guardNetwork } from './network';
import { captureSdkWarnings } from './warnings';
import { codeFingerprint } from './run';
import { corpusScenarios, loadWorkflowMemory, workflowControls, workflowContracts, type Scenario, type WorkflowMode } from './workflow-scenarios';
import type { WorkflowStep } from './workflow-runtime';
import { workflowOutcomes } from './workflow-outcomes';
import { collectMemoryProposals, memoryDirectory, type MemoryProposal } from './enrichment-memory';

export const workflowSteps = {
  incoming: [
    { step: 'case_context', executor: 'saved source and available earlier conversation; prior case state', calls: 0 },
    { step: 'approved_knowledge_retrieval', executor: 'approvedWorkflowKnowledge; explicit memory fixture', calls: 0 },
    { step: 'incoming_email_decision_evidence', role: 'evidence_analysis', executor: 'incoming-analysis; exact source grounding', calls: 1 },
    { step: 'incoming_email_decision', role: 'classification', executor: 'incoming-decision or workflowQuestions(new_email); only affected priority/urgency', calls: 1 },
    { step: 'email_knowledge_decision', role: 'knowledge_decision', executor: 'proposeEmailKnowledge(new_email)', calls: 1 },
    { step: 'email_knowledge_extraction', role: 'knowledge_draft', executor: 'email-knowledge; only when candidate=yes', calls: 1 },
    { step: 'email_knowledge_validation', role: 'validation', executor: 'only for proposals with exact source quotes', calls: 1 },
    { step: 'decision_history', executor: 'recordWorkflowResult; proposal, authorization and missing evidence', calls: 0 },
    { step: 'idempotency', executor: 'replay completed work without inference or new effects', calls: 0 },
  ],
  enrichment: [
    { step: 'approval_fixture', executor: 'simulated active member approval; never approves real customer knowledge', calls: 0 },
    { step: 'candidate_selection_fixture', executor: 'knowledge_change; embedding and SQL explicit-link adapters', calls: 0 },
    { step: 'knowledge_impact', role: 'knowledge_decision', executor: 'knowledgeImpactQuestions; current approved version only', calls: 1 },
    { step: 'knowledge_impact_evidence', role: 'evidence_analysis', executor: 'knowledge-impact; only for solution, correction or action', calls: 1 },
    { step: 'enrichment_persistence', executor: 'record_ticket_enrichment fixture; recheck human intervention and revisions', calls: 0 },
    { step: 'idempotency', executor: 'replay completed work without inference or additional application', calls: 0 },
  ],
  reply: [
    { step: 'case_context', executor: 'current ticket and available conversation', calls: 0 },
    { step: 'approved_knowledge_retrieval', executor: 'approvedWorkflowKnowledge at request time; explicit memory fixture', calls: 0 },
    { step: 'reply_suggestion', role: 'reply', executor: 'suggestReply; source identifiers checked against retrieved approved versions', calls: 1 },
    { step: 'reply_support_validation', role: 'validation', executor: 'validate draft claims against case and cited approved knowledge', calls: 1 },
    { step: 'reply_proposal', executor: 'save_reply_decision fixture; permission, case and cited-version rechecks', calls: 0 },
    { step: 'fresh_request', executor: 'one additional suggestion only in the synthetic updated-memory control', calls: 1 },
    { step: 'idempotency', executor: 'replay the save, without repeating generation', calls: 0 },
  ],
} as const;

export class WorkflowPreflightError extends Error {
  run?: string;
  readonly route: ModelRoute;
  readonly code: 'EVAL_MODEL_CAPABILITY' | 'EVAL_MODEL_PREFLIGHT';
  constructor(route: ModelRoute, code: 'EVAL_MODEL_CAPABILITY' | 'EVAL_MODEL_PREFLIGHT') {
    super(code); this.name = 'WorkflowPreflightError'; this.route = route; this.code = code;
  }
}

/** Check every configured Gateway role against its catalog before any case can spend inference credits. */
export async function validateWorkflowRoutes(routes: ModelRoute[], injectedClient?: Pick<GatewayClient, 'requireModel'>) {
  const remote = routes.filter(route => route.provider === 'gateway');
  if (!remote.length) return;
  const client = injectedClient ?? new GatewayClient(gatewayKey());
  for (const route of remote) {
    try { await client.requireModel(route.model, route.capability); }
    catch (error) {
      throw new WorkflowPreflightError(route, error instanceof Error && error.name === 'ProviderConfigurationError'
        ? 'EVAL_MODEL_CAPABILITY' : 'EVAL_MODEL_PREFLIGHT');
    }
  }
}

export function workflowPlan(mode: WorkflowMode, dataset: string) {
  const roles: Record<WorkflowMode, ModelRole[]> = {
    incoming: ['evidence_analysis', 'classification', 'knowledge_decision', 'knowledge_draft', 'validation'],
    enrichment: ['knowledge_decision', 'evidence_analysis'], reply: ['reply', 'validation'],
  };
  const maximumCallsPerCase = mode === 'incoming' ? 5 : 2;
  return { mode, dataset, contract: workflowContracts[mode], routes: roles[mode].map(role => resolveModelRoute(role)),
    steps: workflowSteps[mode], maximumCallsPerCase,
    additionalCalls: mode === 'reply' ? 'two in the synthetic refreshed-memory control only' : 'none',
    selection: dataset === 'synthetic' ? 'invented workflow controls' : 'all corpus positions plus separately reported invented controls; no earlier run required',
    memory: 'optional private input/workflow-context/<dataset>.json; absent context remains missing',
    boundary: 'production intelligence services; persisted input, retrieval, embedding selection, approval and atomic SQL saves are fixtures; no Gmail, database, Inngest, HTTP authorization or outbound actions',
    qualityThresholds, requestLimit: 'sum of per-scenario maximum calls; all requests including retries count toward the hard cap', network: false };
}

function wilson(values: boolean[]) {
  if (!values.length) return null;
  const n = values.length, p = values.filter(Boolean).length / n, z = 1.959963984540054;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator;
  return { level: 0.95, lower: center - margin, upper: center + margin, method: 'Wilson interval over fully reviewed cases' };
}

export function workflowReport(mode: WorkflowMode, rows: Measurement[], steps: WorkflowStep[], reviews: Review[] = []) {
  const measured = rows.map(row => ({ ...row, abstain: mode === 'enrichment' && row.prediction['skipped'] === 'false'
    ? row.prediction['contribution'] === 'unknown' : null }));
  const cells = summarize(measured, reviews).filter(cell => cell.attempted > 0);
  return { mode, execution: { attempted: rows.length, completed: rows.filter(row => row.status === 'completed').length,
    failed: rows.filter(row => row.status === 'failed').length }, cells,
    quality: cells.map(cell => {
      const selected = rows.filter(row => row.case.dataset === cell.dataset && row.case.contract === cell.contract && row.status === 'completed');
      const keys = new Set(reviewTemplate(selected).map(row => row.key));
      const ratings = reviews.filter(row => keys.has(row.key)).flatMap(row => row.ratings).filter((value): value is boolean => typeof value === 'boolean');
      const caseRatings = reviews.filter(row => keys.has(row.key) && row.ratings.length > 0 && row.ratings.every(value => value !== null))
        .map(row => row.ratings.every(value => value === true));
      return { dataset: cell.dataset, contract: cell.contract,
        judgments: Object.fromEntries(Object.entries(cell.fields).map(([key, field]) => [key, { ...field,
          comparisons: qualityThresholds.map(threshold => ({ threshold, meetsThreshold: field.macro_f1 >= threshold })) }])),
        review: { rated: ratings.length, acceptedFraction: ratings.length ? ratings.filter(Boolean).length / ratings.length : null,
          fullyReviewedCases: caseRatings.length, caseAcceptanceFraction: caseRatings.length ? caseRatings.filter(Boolean).length / caseRatings.length : null,
          uncertainty: wilson(caseRatings), pending: cell.reviewPending },
        calibratedModelConfidence: null, sampling: cell.dataset === 'synthetic' ? 'controlled cases; not population accuracy' : 'corpus cases; no new workflow golden labels inferred',
      };
    }),
    outcomes: workflowOutcomes(mode, rows),
    proposals: proposalQuality(steps),
    safety: Object.fromEntries([...new Set(rows.flatMap(row => Object.keys(row.safety)))].map(key => [key, {
      checked: rows.filter(row => key in row.safety).length,
      failed: rows.filter(row => row.safety[key] === false).length,
    }])),
    memoryCoverage: { casesWithSuppliedApprovedMemory: rows.filter(row => row.case.knowledge?.some(item => item.status === 'approved')).length,
      corpusWithoutApprovedMemory: rows.filter(row => row.case.dataset !== 'synthetic' && !row.case.knowledge?.some(item => item.status === 'approved')).length },
    infrastructureVerified: false, semanticRetrievalMeasured: false,
    humanAcceptance: 'review ratings and accepted/confirmed outcomes remain unknown until independently reviewed',
  };
}

interface WorkflowEvalDeps {
  loadCorpus?: typeof import('./corpus').loadCorpus;
  loadMemory?: typeof loadWorkflowMemory;
  createRuntime?: typeof import('./workflow-runtime').createWorkflowRuntime;
  preflight?: typeof validateWorkflowRoutes;
}

export function reviewedKnowledgeSummary(original: MemoryProposal[], reviewed: MemoryProposal[]) {
  if (reviewed.length !== original.length || new Set(reviewed.map(item => item.id)).size !== original.length) throw new Error('EVAL_REVIEW_SOURCE_CHANGED');
  for (const item of reviewed) {
    const source = original.find(value => value.id === item.id);
    if (!source || source.content !== item.content || source.sourcePosition !== item.sourcePosition ||
      source.sourceText !== item.sourceText || source.title !== item.title || JSON.stringify(source.evidence) !== JSON.stringify(item.evidence) ||
      !['approved','rejected','pending_review'].includes(item.decision) ||
      (item.decision !== 'pending_review' && !item.reviewer?.trim())) throw new Error('EVAL_REVIEW_SOURCE_CHANGED');
  }
  const approved = reviewed.filter(item => item.decision === 'approved').length;
  const rejected = reviewed.filter(item => item.decision === 'rejected').length;
  return { proposals: original.length, approved, rejected, pending: original.length - approved - rejected,
    acceptanceRate: approved + rejected ? approved / (approved + rejected) : null,
    scope: 'human review of knowledge proposals; not approval of case decisions or generated replies' };
}

async function savedKnowledgeReview(mode: WorkflowMode, dataset: string, run: string, rows: Measurement[]) {
  if (mode !== 'incoming' || (dataset !== 'main' && dataset !== 'coverage')) return null;
  let saved: { sourceRun: string; sourceMode: string; proposals: MemoryProposal[] };
  try { saved = JSON.parse(await readPrivate(resolve(memoryDirectory(dataset), 'review.json'))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (saved.sourceRun !== run || saved.sourceMode !== mode) return null;
  return reviewedKnowledgeSummary(collectMemoryProposals({ rows }, dataset), saved.proposals);
}

export function failedWorkflowScenarios(rows: Measurement[]): Scenario[] {
  return rows.filter(row => row.status === 'failed').map(row => structuredClone(row.case) as Scenario);
}

export async function workflowMain(mode: WorkflowMode, args: string[], deps: WorkflowEvalDeps = {}) {
  const [command = 'plan', dataset = mode === 'enrichment' ? 'synthetic' : 'main', rawLimit] = args;
  if (args.length > 3 || !['plan', 'execute', 'report', 'retry-failed'].includes(command) || !['main', 'coverage', 'synthetic'].includes(dataset)) throw new Error('EVAL_ARGUMENTS');
  const selectedDataset = dataset as 'main' | 'coverage' | 'synthetic';
  if (command === 'report') {
    const saved = await findEvaluationRun(mode, selectedDataset, rawLimit ?? 'latest');
    const rows = JSON.parse(await readPrivate(resolve(saved.directory, 'measurements.json'))) as Measurement[];
    const steps = JSON.parse(await readPrivate(resolve(saved.directory, 'trace.json'))) as WorkflowStep[];
    const reviews = JSON.parse(await readPrivate(resolve(saved.directory, 'reviews.json'))) as Review[];
    const previous = JSON.parse(await readPrivate(resolve(saved.directory, 'report.json'))) as Record<string, unknown>;
    const report = { ...previous, ...workflowReport(mode, rows, steps, reviews),
      reviewedKnowledge: await savedKnowledgeReview(mode, selectedDataset, saved.name, rows) };
    await writePrivate(resolve(saved.directory, 'report.json'), report);
    return { run: saved.name, directory: saved.directory, reportUpdated: true, outcomes: report.outcomes,
      reviewedKnowledge: report.reviewedKnowledge, safety: report.safety,
      qualityReviewPending: report.cells.reduce((sum, cell) => sum + cell.reviewPending, 0) };
  }
  const retrySource = command === 'retry-failed' ? await findEvaluationRun(mode, selectedDataset, rawLimit ?? 'latest') : null;
  const retryCases = retrySource ? failedWorkflowScenarios(JSON.parse(await readPrivate(resolve(retrySource.directory, 'measurements.json')))) : null;
  if (retryCases?.length === 0) return { mode, dataset, sourceRun: retrySource!.name, retried: 0, requests: 0 };
  const budget = rawLimit === undefined || retrySource ? null : Number(rawLimit);
  if (budget !== null && (!Number.isSafeInteger(budget) || budget < 1)) throw new Error('EVAL_REQUEST_LIMIT');
  const plan = workflowPlan(mode, dataset);
  if (command === 'plan') return { ...plan, requestLimit: budget ?? plan.requestLimit };
  const saved = await createEvaluationRun(mode, selectedDataset);
  const originalConsole = { ...console }, originalFetch = globalThis.fetch;
  const warnings = captureSdkWarnings(), diagnostics: unknown[] = [], steps: WorkflowStep[] = [], rows: Measurement[] = [];
  let network: ReturnType<typeof guardNetwork> | undefined;
  let checkpoint = Promise.resolve();
  let phase = 'EVAL_CORPUS_LOAD';
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => {
    diagnostics.push(values.map(value => value instanceof Error ? { name: value.name, message: value.message } : value));
  };
  globalThis.fetch = Object.assign(async () => { throw new Error('Evaluation setup network rejected'); }, originalFetch) as typeof fetch;
  try {
    const controls = retryCases ? retryCases.filter(row => row.dataset === 'synthetic') : workflowControls(mode);
    const corpus = retryCases ? retryCases.filter(row => row.dataset !== 'synthetic') : selectedDataset === 'synthetic' ? [] : corpusScenarios(mode,
      await (deps.loadCorpus ?? (await import('./corpus')).loadCorpus)(selectedDataset),
      await (deps.loadMemory ?? loadWorkflowMemory)(selectedDataset));
    if (mode === 'enrichment' && selectedDataset !== 'synthetic' && !retryCases && !corpus.some(row => row.knowledge?.some(item => item.status === 'approved'))) throw new Error('EVAL_APPROVED_MEMORY_MISSING');
    const scenarios: Scenario[] = [...corpus, ...controls];
    const allowance = scenarios.map(row => ({ dataset: row.dataset, case: row.id,
      maximum: mode === 'enrichment' && (row.member === 'suspended' || row.knowledge?.[row.targetKnowledge ?? 0]?.status !== 'approved') ? 0
        : plan.maximumCallsPerCase + (row.refresh ? 2 : 0) }));
    const requestLimit = budget ?? Math.max(1, allowance.reduce((sum, row) => sum + row.maximum, 0));
    const manifest = { ...plan, network: undefined, requestLimit, allowance, run: saved.name, createdAt: saved.startedAt,
      ...(retrySource ? { sourceRun: retrySource.name, selection: 'failed cases only; original saved inputs; completed cases and controls are not repeated' } : {}),
      ...await codeFingerprint(), positions: corpus.map(row => row.id), controls: controls.map(row => row.id) };
    await writePrivate(resolve(saved.directory, 'manifest.json'), manifest);
    originalConsole.log(JSON.stringify({ run: saved.name, mode, directory: saved.directory,
      corpusCases: corpus.length, controlCases: controls.length, routes: plan.routes, requestLimit, calls: allowance }));
    network = guardNetwork(requestLimit, originalFetch); globalThis.fetch = network.fetch;
    phase = 'EVAL_MODEL_PREFLIGHT';
    await (deps.preflight ?? validateWorkflowRoutes)(plan.routes);
    phase = 'EVAL_RUNTIME_SETUP';
    const runtime = await (deps.createRuntime ?? (await import('./workflow-runtime')).createWorkflowRuntime)(step => {
      steps.push(step);
      originalConsole.log(JSON.stringify({ dataset: step.dataset, case: step.case, step: step.step, status: step.status }));
      if (step.step === 'idempotency' || step.status === 'failed' || step.status === 'blocked') {
        const snapshot = structuredClone(steps);
        checkpoint = checkpoint.then(() => writePrivate(resolve(saved.directory, 'trace.json'), snapshot));
      }
    });
    phase = 'EVAL_EXECUTION';
    for (const scenario of scenarios) {
      if (network.stopped) break;
      const start = performance.now(), requestOffset = network.requests.length, responseOffset = network.responses.length;
      let result: Awaited<ReturnType<typeof runtime>> | undefined;
      try { result = await runtime(mode, scenario); }
      catch (error) { diagnostics.push(error instanceof Error ? { name: error.name, message: error.message } : { failed: true }); }
      rows.push({ case: scenario, status: result?.completed ? 'completed' : 'failed',
        prediction: result?.prediction ?? {}, abstain: result?.abstain ?? null,
        latencyMs: performance.now() - start, requests: network.requests.slice(requestOffset), responses: network.responses.slice(responseOffset),
        output: result?.output ?? { failed: true }, calls: result?.calls ?? [], safety: result?.safety ?? {} });
      await writePrivate(resolve(saved.directory, 'measurements.json'), rows);
      await writePrivate(resolve(saved.directory, 'run.json'), { manifest, planned: scenarios.length, rows, requests: network.requests, responses: network.responses });
      const failure = result?.output.failure;
      if (failure && typeof failure === 'object' && 'name' in failure && failure.name === 'ProviderConfigurationError') break;
    }
    await checkpoint;
    const report = { ...workflowReport(mode, rows, steps), planned: scenarios.length, stopped: network.stopped, warningCount: warnings.count() };
    await writePrivate(resolve(saved.directory, 'reviews.json'), reviewTemplate(rows));
    await writePrivate(resolve(saved.directory, 'report.json'), report);
    const failed = network.stopped || rows.length !== scenarios.length || rows.some(row => row.status === 'failed' || Object.values(row.safety).some(value => !value));
    await finishEvaluationRun(saved, failed ? 'failed' : 'completed');
    if (failed) process.exitCode = 1;
    return { run: saved.name, mode, directory: saved.directory, ...report.execution,
      ...(retrySource ? { sourceRun: retrySource.name } : {}),
      corpusCases: corpus.length, controlCases: controls.length, requests: network.requests.length,
      safetyFailures: Object.values(report.safety).reduce((sum, value) => sum + value.failed, 0), qualityReviewPending: report.cells.reduce((sum, cell) => sum + cell.reviewPending, 0) };
  } catch (error) {
    diagnostics.push(error instanceof Error ? { name: error.name, message: error.message } : { failed: true });
    await finishEvaluationRun(saved, 'failed');
    if (phase === 'EVAL_MODEL_PREFLIGHT') {
      await writePrivate(resolve(saved.directory, 'report.json'), { mode,
        execution: { attempted: 0, completed: 0, failed: 0 }, setup: { status: 'failed',
          reason: error instanceof WorkflowPreflightError ? error.code : phase,
          route: error instanceof WorkflowPreflightError ? error.route : null }, requests: network?.requests.length ?? 0 });
    }
    if (error instanceof WorkflowPreflightError) { error.run = saved.name; throw error; }
    const code = error instanceof Error && ['EVAL_APPROVED_MEMORY_MISSING', 'EVAL_WORKFLOW_MEMORY', 'EVAL_CORPUS_EMPTY'].includes(error.message) ? error.message : phase;
    throw new Error(`${code}; run ${saved.name}`);
  } finally {
    Object.assign(console, originalConsole); globalThis.fetch = originalFetch; warnings.restore();
    await checkpoint;
    await writePrivate(resolve(saved.directory, 'trace.json'), steps);
    await writePrivate(resolve(saved.directory, 'diagnostics.json'), diagnostics);
    await writePrivate(resolve(saved.directory, 'warnings.json'), warnings.events);
  }
}

export async function workflowCli(mode: WorkflowMode) {
  try { console.log(JSON.stringify(await workflowMain(mode, process.argv.slice(2)), null, 2)); }
  catch (error) {
    if (error instanceof WorkflowPreflightError) {
      const { role, model, capability } = error.route;
      console.error(`${error.code}: ${role} requires ${capability}; configured model: ${model}. Evaluation stopped before inference. Run: ${error.run ?? 'not started'}.`);
      process.exitCode = 1; return;
    }
    const safe = error instanceof Error && /^EVAL_[A-Z_]+(?:; run [\d_Z-]+)?$/.test(error.message) ? error.message : 'EVAL_SETUP';
    console.error(`Workflow evaluation stopped: ${safe}. Diagnostics remain private.`); process.exitCode = 1;
  }
}
