import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';
import { evaluationRouting, codeFingerprint } from './run';
import { sampleCorpus, onboardingScanSize } from './sampling';
import { privateRoot, writePrivate, readPrivate } from './private-files';
import { guardNetwork } from './network';
import type { PipelineStep } from './onboarding-runtime';
import type { Measurement } from './metrics';
import { summarize, reviewTemplate, type Review } from './metrics';

export const onboardingSteps = [
  { step: 'routing', executor: 'extractMailFacts + resolveRoute', condition: 'each sampled email' },
  { step: 'classification', executor: 'classifyEmailWithMeta', role: 'classification', condition: 'routing admits email' },
  { step: 'classification_proposal', executor: 'computePriorityScore + tier1ProposalStatus', condition: 'classification succeeds; ensemble abstention requires review' },
  { step: 'ticket_creation', executor: 'upsertConversationByThread + findOrCreateTicketForThread + linkMessageToTicket', condition: 'classification succeeds' },
  { step: 'first_delivery', executor: 'persisted ticket', condition: 'ticket and source are linked' },
  { step: 'classification_history_trigger', executor: 'capture_ticket_decision', condition: 'not executed by the storage fixture; requires database verification' },
  { step: 'sample_learning', executor: 'processDecisionWork', condition: 'explicit evaluation dispatch after first delivery; not dispatched by Tier 1' },
  { step: 'approved_knowledge_retrieval', executor: 'empty new-account fixture', condition: 'no approved knowledge or business context is invented' },
  { step: 'historical_learning_evidence', executor: 'historical-analysis', role: 'evidence_analysis', condition: 'created ticket with available sample conversation' },
  { step: 'historical_learning', executor: 'workflowQuestions(backfill)', role: 'knowledge_decision', condition: 'evidence analysis succeeds' },
  { step: 'email_knowledge_decision', executor: 'buildEmailKnowledgeQuestions', role: 'knowledge_decision', condition: 'linked inbound source without previous proposal' },
  { step: 'email_knowledge_extraction', executor: 'historical-knowledge', role: 'knowledge_draft', condition: 'candidate=yes' },
  { step: 'source_grounding_result', executor: 'exact source quotation checks', condition: 'reported after proposal evaluation; invalid quotes block semantic validation' },
  { step: 'email_knowledge_validation', executor: 'buildEmailKnowledgeValidationQuestions', role: 'validation', condition: 'at least one grounded proposal; one call for all proposals in the email' },
  { step: 'knowledge_proposals', executor: 'save_email_knowledge', condition: 'new articles/facts/rules remain pending human review' },
  { step: 'decision_history', executor: 'recordWorkflowResult', condition: 'learning completes; conclusions and missing evidence are retained' },
  { step: 'idempotency', executor: 'processDecisionWork replay', condition: 'completed work must produce no additional model calls or writes' },
  { step: 'approval_and_enrichment', executor: 'human review required', condition: 'not executed; generated proposals are never auto-approved by this evaluation' },
] as const;

export async function onboardingMain(args: string[]) {
  const [command = 'plan', dataset = 'main', rawBudget, suppliedSeed] = args;
  if (command === 'report') {
    if (!/^[a-f0-9-]{36}$/.test(dataset)) throw new Error('Run id required');
    const dir = resolve(privateRoot, 'output/onboarding', dataset);
    const measurements = JSON.parse(await readPrivate(resolve(dir, 'measurements.json'))) as Measurement[];
    const reviews = JSON.parse(await readPrivate(resolve(dir, 'reviews.json'))) as Review[];
    const report = JSON.parse(await readPrivate(resolve(dir, 'report.json'))) as Record<string, unknown>;
    await writePrivate(resolve(dir, 'report.json'), { ...report, reviewedMetrics: summarize(measurements, reviews) });
    return { run: dataset, reportUpdated: true };
  }
  if (!['plan', 'execute'].includes(command) || !['main', 'coverage'].includes(dataset)) throw new Error('Unsupported evaluation command');
  const sampleSize = await onboardingScanSize();
  const classification = evaluationRouting(dataset);
  const routes = [...classification.routes, ...(['evidence_analysis', 'knowledge_decision', 'knowledge_draft', 'validation'] as const).map(role => resolveModelRoute(role))];
  const maximumCallsPerEmail = classification.classificationCallsPerEmail + 5;
  const requestLimit = rawBudget === undefined ? sampleSize * maximumCallsPerEmail : Number(rawBudget);
  if (!Number.isSafeInteger(requestLimit) || requestLimit < 1) throw new Error('Positive request limit required');
  const plan = { dataset, sampleSize, sampling: 'random without replacement', routes, ensemble: classification.ensemble,
    callsPerAdmittedEmail: { classification: classification.classificationCallsPerEmail, evidence: 1, historicalDecision: 1,
      knowledgeCandidate: 1, draftIfCandidate: 1, validationIfGrounded: 1, maximum: maximumCallsPerEmail },
    maximumLogicalCalls: sampleSize * maximumCallsPerEmail, requestLimit, steps: onboardingSteps,
    boundary: 'production services with isolated storage and empty approved-knowledge retrieval; no Gmail, SQL triggers, Inngest or human approval',
    productionDispatch: 'gap: Tier 1 does not enqueue learning for its sample' };
  if (command === 'plan') return { ...plan, network: false };

  const runId = randomUUID();
  const dir = resolve(privateRoot, 'output/onboarding', runId);
  const network = guardNetwork(requestLimit);
  const originalFetch = globalThis.fetch;
  const originalConsole = { ...console };
  const diagnostics: unknown[][] = [];
  globalThis.fetch = network.fetch;
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => {
    diagnostics.push(values.map(value => value instanceof Error ? { name: value.name, message: value.message } : value));
  };
  let checkpoint = Promise.resolve();
  const trace: PipelineStep[] = [];
  try {
    const corpus = await (await import('./corpus')).loadCorpus(dataset as 'main' | 'coverage');
    const sample = sampleCorpus(corpus, sampleSize, suppliedSeed);
    const manifest = { ...plan, ...await codeFingerprint(), runId, seed: sample.seed, positions: sample.cases.map(row => row.id),
      population: sample.population, selected: sample.cases.length, createdAt: new Date().toISOString() };
    await writePrivate(resolve(dir, 'manifest.json'), manifest);
    originalConsole.log(JSON.stringify({ run: runId, sampleSize: sample.cases.length, seed: sample.seed, routes, requestLimit }));
    originalConsole.log(JSON.stringify({ steps: onboardingSteps }));
    const runtime = await (await import('./onboarding-runtime')).createOnboardingRuntime(sample.cases, {}, step => {
      trace.push(step);
      const snapshot = structuredClone(trace);
      checkpoint = checkpoint.then(() => writePrivate(resolve(dir, 'trace.json'), snapshot));
      // Only numeric positions, fixed step names and statuses may leave private storage.
      originalConsole.log(JSON.stringify({ case: step.case, step: step.step, status: step.status }));
    }, () => network.stopped);
    const result = await runtime.execute();
    await checkpoint;
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
      output: result.tables['ticket_decision_history']!.filter(row => row['ticket_id'] === ticketId && row['idempotency_key'] === `workflow:sample:${example.id}`), safety: result.safety,
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
      productionDispatch: plan.productionDispatch, infrastructureVerified: false, knowledgeQuality: 'pending human review',
      classification: summarize(rows), costUsd: network.requests.every(row => row.costUsd !== null)
        ? network.requests.reduce((sum, row) => sum + row.costUsd!, 0) : null };
    await writePrivate(resolve(dir, 'report.json'), report);
    if (failed || network.stopped || Object.values(result.safety).some(value => !value)) process.exitCode = 1;
    return { run: runId, sampled: sample.cases.length, tickets: report.tickets, learningCompleted,
      pendingProposals: report.articles + report.learnings, failedSteps: failed, requests: network.requests.length,
      productionDispatch: plan.productionDispatch };
  } catch (error) {
    diagnostics.push([error instanceof Error ? { name: error.name, message: error.message } : { failed: true }]);
    throw error;
  } finally {
    Object.assign(console, originalConsole);
    globalThis.fetch = originalFetch;
    await checkpoint;
    await writePrivate(resolve(dir, 'diagnostics.json'), diagnostics);
  }
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await onboardingMain(process.argv.slice(2)), null, 2)); }
  catch { console.error('Onboarding evaluation stopped. Inspect the private run artifacts.'); process.exitCode = 1; }
}
