import { resolve } from 'node:path';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';
import { evaluationRouting, codeFingerprint } from './run';
import { sampleCorpus, onboardingScanSize } from './sampling';
import { writePrivate, readPrivate } from './private-files';
import { createEvaluationRun, findEvaluationRun, finishEvaluationRun } from './results';
import { captureSdkWarnings } from './warnings';
import { guardNetwork } from './network';
import type { PipelineStep } from './onboarding-runtime';
import type { Measurement } from './metrics';
import { summarize, reviewTemplate, type Review } from './metrics';
import { BUSINESS_SYNTHESIS_CONTRACT } from '../packages/intelligence/src/knowledge/business-synthesis';

export const onboardingSteps = [
  { step: 'routing', executor: 'extractMailFacts + resolveRoute', condition: 'each sampled email' },
  { step: 'classification', executor: 'classifyEmailWithMeta', role: 'classification', condition: 'routing admits email' },
  { step: 'classification_proposal', executor: 'computePriorityScore + tier1ProposalStatus', condition: 'classification succeeds; ensemble abstention requires review' },
  { step: 'ticket_creation', executor: 'upsertConversationByThread + findOrCreateTicketForThread + linkMessageToTicket', condition: 'classification succeeds' },
  { step: 'first_delivery', executor: 'persisted ticket', condition: 'ticket and source are linked' },
  { step: 'classification_history_trigger', executor: 'capture_ticket_decision', condition: 'not executed by the storage fixture; requires database verification' },
  { step: 'enqueue_sample_learning', executor: 'enqueueOnboardingLearning', condition: 'after first delivery; same queue writer used by Tier 1' },
  { step: 'sample_learning', executor: 'processDecisionWork', condition: 'work queued from a saved initial-sample message' },
  { step: 'approved_knowledge_retrieval', executor: 'new account', condition: 'starts with no approved knowledge or supplied business context' },
  { step: 'historical_learning_evidence', executor: 'historical-analysis', role: 'evidence_analysis', condition: 'created ticket with available sample conversation' },
  { step: 'historical_learning', executor: 'workflowQuestions(backfill)', role: 'knowledge_decision', condition: 'evidence analysis succeeds' },
  { step: 'email_knowledge_decision', executor: 'buildEmailKnowledgeQuestions', role: 'knowledge_decision', condition: 'linked inbound source without previous proposal' },
  { step: 'email_knowledge_extraction', executor: 'historical-knowledge', role: 'knowledge_draft', condition: 'candidate=yes' },
  { step: 'source_grounding_result', executor: 'exact source quotation checks', condition: 'reported after proposal evaluation; invalid quotes block semantic validation' },
  { step: 'email_knowledge_validation', executor: 'buildEmailKnowledgeValidationQuestions', role: 'validation', condition: 'at least one grounded proposal; one call for all proposals in the email' },
  { step: 'knowledge_proposals', executor: 'save_email_knowledge', condition: 'new articles/facts/rules remain pending human review' },
  { step: 'decision_history', executor: 'recordWorkflowResult', condition: 'learning completes; conclusions and missing evidence are retained' },
  { step: 'idempotency', executor: 'processDecisionWork replay', condition: 'completed work must produce no additional model calls or writes' },
  { step: 'business_synthesis', executor: 'synthesizeBusiness', role: 'knowledge_draft', condition: 'after sample learning; reads the saved tier 1 tickets and proposes the business profile and recurring themes for review' },
] as const;

type OnboardingDeps = {
  loadCorpus?: typeof import('./corpus').loadCorpus;
  createRuntime?: typeof import('./onboarding-runtime').createOnboardingRuntime;
};
export class OnboardingEvaluationError extends Error {
  readonly code: string;
  readonly runId?: string;
  constructor(code: string, runId?: string) { super(code); this.name = 'OnboardingEvaluationError'; this.code = code; this.runId = runId; }
}

export async function onboardingMain(args: string[], deps: OnboardingDeps = {}) {
  const [command = 'plan', dataset = 'main', rawBudget, suppliedSeed] = args;
  if (command === 'report') {
    const selected = await findEvaluationRun('onboarding', dataset as 'main' | 'coverage', rawBudget ?? 'latest');
    const dir = selected.directory;
    const measurements = JSON.parse(await readPrivate(resolve(dir, 'measurements.json'))) as Measurement[];
    const reviews = JSON.parse(await readPrivate(resolve(dir, 'reviews.json'))) as Review[];
    const report = JSON.parse(await readPrivate(resolve(dir, 'report.json'))) as Record<string, unknown>;
    await writePrivate(resolve(dir, 'report.json'), { ...report, reviewedMetrics: summarize(measurements, reviews) });
    return { run: selected.name, directory: dir, reportUpdated: true };
  }
  if (!['plan', 'execute'].includes(command) || !['main', 'coverage'].includes(dataset)) throw new Error('Unsupported evaluation command');
  let sampleSize: number;
  let classification: ReturnType<typeof evaluationRouting>;
  let routes: ReturnType<typeof resolveModelRoute>[];
  try {
    sampleSize = await onboardingScanSize();
    classification = evaluationRouting(dataset);
    routes = [...classification.routes, ...(['evidence_analysis', 'knowledge_decision', 'knowledge_draft', 'validation'] as const).map(role => resolveModelRoute(role))];
  } catch { throw new OnboardingEvaluationError('EVAL_MODEL_CONFIGURATION'); }
  const maximumCallsPerEmail = classification.classificationCallsPerEmail + 5;
  // One synthesis per account: each agent step is a model call and may ask one set of typed judgments.
  const synthesisCalls = BUSINESS_SYNTHESIS_CONTRACT.maxSteps * 2;
  const requestLimit = rawBudget === undefined ? sampleSize * maximumCallsPerEmail + synthesisCalls : Number(rawBudget);
  if (!Number.isSafeInteger(requestLimit) || requestLimit < 1) throw new Error('Positive request limit required');
  const plan = { dataset, sampleSize, sampling: 'random without replacement', routes, ensemble: classification.ensemble,
    callsPerAdmittedEmail: { classification: classification.classificationCallsPerEmail, evidence: 1, historicalDecision: 1,
      knowledgeCandidate: 1, draftIfCandidate: 1, validationIfGrounded: 1, maximum: maximumCallsPerEmail },
    callsPerAccount: { synthesis: synthesisCalls },
    maximumLogicalCalls: sampleSize * maximumCallsPerEmail + synthesisCalls, requestLimit, steps: onboardingSteps,
    boundary: 'production services with isolated storage and empty approved-knowledge retrieval; no Gmail, SQL triggers, Inngest or human approval',
    productionDispatch: 'Tier 1 -> enqueueOnboardingLearning -> decision_work_items -> decisionWorkflows; worker honors enable_email_knowledge' };
  if (command === 'plan') return { ...plan, network: false };

  const savedRun = await createEvaluationRun('onboarding', dataset as 'main' | 'coverage');
  const runId = savedRun.name;
  const dir = savedRun.directory;
  const network = guardNetwork(requestLimit);
  const originalFetch = globalThis.fetch;
  const originalConsole = { ...console };
  const sdkWarnings = captureSdkWarnings();
  const diagnostics: unknown[][] = [];
  globalThis.fetch = network.fetch;
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => {
    diagnostics.push(values.map(value => value instanceof Error ? { name: value.name, message: value.message } : value));
  };
  let checkpoint = Promise.resolve();
  const trace: PipelineStep[] = [];
  let phase = 'EVAL_CORPUS_LOAD';
  try {
    const corpus = await (deps.loadCorpus ?? (await import('./corpus')).loadCorpus)(dataset as 'main' | 'coverage');
    const sample = sampleCorpus(corpus, sampleSize, suppliedSeed);
    const manifest = { ...plan, ...await codeFingerprint(), runId, seed: sample.seed, positions: sample.cases.map(row => row.id),
      population: sample.population, selected: sample.cases.length, createdAt: new Date().toISOString() };
    phase = 'EVAL_PRIVATE_WRITE';
    await writePrivate(resolve(dir, 'manifest.json'), manifest);
    originalConsole.log(JSON.stringify({ run: runId, directory: dir, sampleSize: sample.cases.length, seed: sample.seed, routes, requestLimit }));
    originalConsole.log(JSON.stringify({ steps: onboardingSteps }));
    phase = 'EVAL_RUNTIME_SETUP';
    const runtime = await (deps.createRuntime ?? (await import('./onboarding-runtime')).createOnboardingRuntime)(sample.cases, {}, step => {
      trace.push(step);
      if (['first_delivery', 'sample_learning', 'idempotency'].includes(step.step) || step.status === 'failed') {
        const snapshot = structuredClone(trace);
        checkpoint = checkpoint.then(() => writePrivate(resolve(dir, 'trace.json'), snapshot));
      }
      // Only numeric positions, fixed step names and statuses may leave private storage.
      originalConsole.log(JSON.stringify({ case: step.case, step: step.step, status: step.status }));
    }, () => network.stopped);
    phase = 'EVAL_EXECUTION';
    const result = await runtime.execute();
    phase = 'EVAL_PRIVATE_WRITE';
    await checkpoint;
    await writePrivate(resolve(dir, 'trace.json'), trace);
    await writePrivate(resolve(dir, 'run.json'), { manifest, ...result, requests: network.requests, responses: network.responses });
    const rows: Measurement[] = result.classified.map(({ example, result: classificationResult }) => ({
      case: example, status: 'completed', prediction: { type: classificationResult.result.type,
        priority: classificationResult.verdict.priority, urgency: classificationResult.verdict.urgency,
        category: classificationResult.verdict.category, tone: classificationResult.verdict.tone },
      abstain: classificationResult.abstain, latencyMs: result.steps.find(step => step.case === example.id && step.step === 'classification')?.latencyMs ?? 0,
      requests: [], calls: [], output: classificationResult, safety: result.safety,
    }));
    for (const example of sample.cases.filter(example => !rows.some(row => row.case.id === example.id))) {
      const route = result.steps.find(step => step.case === example.id && step.step === 'routing')?.output as { kind?: string; reason?: string } | undefined;
      rows.push({ case: example, status: route?.kind === 'skip' ? 'completed' : 'failed',
        prediction: route?.reason === 'spam_filtered' ? { type: 'spam' } : {}, abstain: null,
        latencyMs: 0, requests: [], calls: [], output: route ?? null, safety: {} });
    }
    const knowledgeReviews = result.classified.map(({ example, ticketId }) => ({
      case: { ...example, contract: 'historical_learning' as const, expected: {}, rubric: [
        'Conclusions cite available sample evidence and preserve unknowns.',
        'Claims about business rules remain unverified proposals.',
        'Attempts are distinguished from confirmed resolutions.',
        'Proposals are reusable, grounded and nonredundant.',
      ] }, status: 'completed' as const, prediction: {}, abstain: null, latencyMs: 0, requests: [], calls: [],
      output: result.tables['ticket_decision_history']!.filter(row => row['ticket_id'] === ticketId && row['message_id'] === `acme-message-${example.id}`), safety: result.safety,
    }));
    for (const row of knowledgeReviews) {
      const step = result.steps.find(step => step.case === row.case.id && step.step === 'sample_learning');
      Object.assign(row, { status: step?.status === 'completed' ? 'completed' : 'failed', latencyMs: step?.latencyMs ?? 0 });
    }
    await writePrivate(resolve(dir, 'measurements.json'), [...rows, ...knowledgeReviews]);
    await writePrivate(resolve(dir, 'reviews.json'), reviewTemplate([...rows, ...knowledgeReviews]));
    const failed = result.steps.filter(step => step.status === 'failed').length;
    const learningCompleted = result.steps.filter(step => step.step === 'sample_learning' && step.status === 'completed').length;
    const report = { run: runId, sampled: sample.cases.length, tickets: result.tables['tickets']!.length,
      learningCompleted, articles: result.tables['kb_articles']!.length, learnings: result.tables['operational_learning']!.length,
      requests: network.requests.length, failedSteps: failed, stopped: network.stopped, safety: result.safety,
      synthesis: synthesisReport(result.tables),
      warningCount: sdkWarnings.count(),
      productionDispatch: plan.productionDispatch, infrastructureVerified: false, knowledgeQuality: 'pending human review',
      classification: summarize(rows), costUsd: network.requests.every(row => row.costUsd !== null)
        ? network.requests.reduce((sum, row) => sum + row.costUsd!, 0) : null };
    await writePrivate(resolve(dir, 'report.json'), report);
    const unsuccessful = !!failed || network.stopped || Object.values(result.safety).some(value => !value);
    if (unsuccessful) process.exitCode = 1;
    await finishEvaluationRun(savedRun, unsuccessful ? 'failed' : 'completed');
    return { run: runId, directory: dir, sampled: sample.cases.length, tickets: report.tickets, learningCompleted,
      pendingProposals: report.articles + report.learnings, failedSteps: failed, requests: network.requests.length,
      warningCount: sdkWarnings.count(),
      productionDispatch: plan.productionDispatch };
  } catch (error) {
    diagnostics.push([error instanceof Error ? { name: error.name, message: error.message } : { failed: true }]);
    await finishEvaluationRun(savedRun, 'failed');
    throw new OnboardingEvaluationError(phase, runId);
  } finally {
    Object.assign(console, originalConsole);
    globalThis.fetch = originalFetch;
    sdkWarnings.restore();
    await checkpoint;
    await writePrivate(resolve(dir, 'diagnostics.json'), diagnostics);
    await writePrivate(resolve(dir, 'warnings.json'), sdkWarnings.events);
  }
}

/** What the owner receives from the synthesis, and how much of the sample its themes explain. */
export function synthesisReport(tables: Record<string, Record<string, unknown>[]>) {
  const proposals = (tables['operational_learning'] ?? []).filter(row => row['source_key'] === 'business-profile' || String(row['source_key']).startsWith('theme:'));
  const themes = proposals.filter(row => String(row['source_key']).startsWith('theme:'));
  const covered = new Set(themes.flatMap(row => row['ticket_ids'] as string[]));
  const tickets = (tables['tickets'] ?? []).length;
  return { profile: proposals.some(row => row['source_key'] === 'business-profile'), themes: themes.length,
    reviewItems: proposals.length, themeCoverage: tickets ? covered.size / tickets : null };
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await onboardingMain(process.argv.slice(2)), null, 2)); }
  catch (error) {
    const code = error instanceof OnboardingEvaluationError ? error.code : 'EVAL_SETUP';
    const run = error instanceof OnboardingEvaluationError && error.runId ? ` Run: ${error.runId}.` : '';
    console.error(`Onboarding evaluation stopped: ${code}.${run} Raw diagnostics remain private.`);
    process.exitCode = 1;
  }
}
