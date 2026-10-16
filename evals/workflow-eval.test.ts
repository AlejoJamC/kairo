import { expect, mock, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { workflowMain, workflowPlan, workflowReport, validateWorkflowRoutes, WorkflowPreflightError } from './workflow-eval';
import { GatewayClient } from '../packages/intelligence/src/providers/gateway/client';
import { workflowControls } from './workflow-scenarios';
import { withModelRouting } from '../packages/intelligence/src/config/model-context';
import type { ModelRole, ModelRoute } from '../packages/intelligence/src/config/model-roles';
import { readPrivate, writePrivate } from './private-files';
import { resultsRoot } from './results';
import { reviewTemplate, type Measurement } from './metrics';

const policy = { routes: Object.fromEntries((['classification', 'evidence_analysis', 'knowledge_decision', 'knowledge_draft', 'validation', 'reply'] as ModelRole[])
  .map(role => [role, { role, provider: 'gateway', capability: ['knowledge_decision','validation'].includes(role) ? 'decision' : 'language', model: `acme/${role}` }])) as Record<ModelRole, ModelRoute> };

test('plans list only each workflow roles and do not load sources, create a runtime or infer', async () => {
  const denied = mock(async () => { throw new Error('Forbidden'); });
  for (const mode of ['incoming','enrichment','reply'] as const) {
    const result = await withModelRouting(policy, () => workflowMain(mode, ['plan', 'main'], { loadCorpus: denied, createRuntime: denied }));
    expect(result).toMatchObject({ mode, network: false });
    const plan = withModelRouting(policy, () => workflowPlan(mode, 'main'));
    expect(plan.routes.map(route => route.role)).toEqual(mode === 'incoming'
      ? ['evidence_analysis','classification','knowledge_decision','knowledge_draft','validation']
      : mode === 'enrichment' ? ['knowledge_decision','evidence_analysis'] : ['reply']);
  }
  expect(denied).not.toHaveBeenCalled();
});

test('quality thresholds are offline comparisons and reviewed utility is independent of execution', () => {
  const row: Measurement = { case: workflowControls('enrichment')[0]!, status: 'completed',
    prediction: { useful: 'true', contribution: 'solution' }, abstain: null, latencyMs: 1, requests: [], output: {}, calls: [], safety: { approvedSourcesOnly: true } };
  const initial = workflowReport('enrichment', [row], []);
  expect(initial.execution).toEqual({ attempted: 1, completed: 1, failed: 0 });
  expect(initial.quality[0]!.judgments['useful']!.comparisons.map(item => item.threshold)).toEqual([0.7, 0.8, 0.9]);
  expect(initial.quality[0]!.review.acceptedFraction).toBeNull();
  expect(initial.cells[0]!.enrichment!.acceptedImprovements).toBeNull();
  const reviews = reviewTemplate([row]);
  reviews[0]!.ratings = row.case.rubric.map(() => false);
  const reviewed = workflowReport('enrichment', [row], [], reviews);
  expect(reviewed.execution.completed).toBe(1);
  expect(reviewed.quality[0]!.review.acceptedFraction).toBe(0);
  expect(reviewed.quality[0]!.review.uncertainty!.upper).toBeLessThan(1);
});

test('each runner writes a dated private result and recalculates reviews without inference', async () => {
  const originalFetch = globalThis.fetch;
  const network = mock(async () => { throw new Error('No network permitted'); });
  globalThis.fetch = Object.assign(network, originalFetch) as typeof fetch;
  const created: string[] = [];
  const previousIndexes = new Map<string, unknown>();
  const beforeExit = process.exitCode;
  try {
    for (const mode of ['incoming','enrichment','reply'] as const) {
      const index = resolve(resultsRoot, mode, 'synthetic/latest.json');
      previousIndexes.set(index, await readPrivate(index).then(JSON.parse, () => null));
      const result = await withModelRouting(policy, () => workflowMain(mode, ['execute', 'synthetic'], {
        preflight: async () => {},
        createRuntime: async notify => async (_mode, input) => {
          notify?.({ case: input.id, dataset: input.dataset, step: 'idempotency', status: 'completed' });
          return { completed: true, prediction: input.expected, abstain: true,
            output: { result: {}, blocked: null, history: [], tables: {}, initial: {}, writes: [], failure: undefined },
            calls: [], steps: [], safety: { noExternalEffects: true, approvedSourcesOnly: true, humanWorkPreserved: true,
              inferredKnowledgeUnapproved: true, replayNoAdditionalEffectsOrInference: true, expectedGuardObserved: true,
              rejectedSaveHasNoProposal: true, decisionHistoryPreserved: true } };
        },
      }));
      expect(result).toHaveProperty('requests', 0);
      const directory = String((result as { directory: string }).directory);
      created.push(directory);
      expect(directory).toContain(`/evals/${mode}/synthetic/`);
      const manifest = JSON.parse(await readPrivate(resolve(directory, 'manifest.json')));
      expect(manifest.requestLimit).toBe(mode === 'incoming' ? 25 : mode === 'enrichment' ? 14 : 8);
      expect(JSON.parse(await readPrivate(resolve(directory, 'reviews.json')))).toHaveLength(workflowControls(mode).length);
      const updated = await workflowMain(mode, ['report', 'synthetic', directory.split('/').at(-1)!]);
      expect(updated).toHaveProperty('reportUpdated', true);
      expect(JSON.parse(await readPrivate(resolve(directory, 'status.json'))).status).toBe('completed');
    }
    expect(network).not.toHaveBeenCalled();
  } finally {
    globalThis.fetch = originalFetch; process.exitCode = beforeExit;
    for (const directory of created) {
      const latest = resolve(directory, '../latest.json');
      if (JSON.parse(await readPrivate(latest)).run === directory.split('/').at(-1)) {
        const previous = previousIndexes.get(latest);
        if (previous) await writePrivate(latest, previous); else await rm(latest);
      }
      await rm(directory, { recursive: true });
    }
  }
}, 60_000);

test('corpus enrichment stops before models when no reviewed memory is supplied', async () => {
  const runtime = mock(async () => { throw new Error('Must not create runtime'); });
  const controls = workflowControls('incoming');
  const latest = resolve(resultsRoot, 'enrichment/coverage/latest.json');
  const previous = await readPrivate(latest).then(JSON.parse, () => null);
  try {
    await expect(withModelRouting(policy, () => workflowMain('enrichment', ['execute','coverage'], {
      loadCorpus: async () => [{ ...controls[0]!, dataset: 'coverage', knowledge: undefined }],
      loadMemory: async () => ({ cases: [] }), createRuntime: runtime,
    }))).rejects.toThrow('EVAL_APPROVED_MEMORY_MISSING');
    expect(runtime).not.toHaveBeenCalled();
  } finally {
    const saved = JSON.parse(await readPrivate(latest));
    await rm(resolve(resultsRoot, 'enrichment/coverage', saved.run), { recursive: true });
    if (previous) await writePrivate(latest, previous); else await rm(latest);
  }
});

test('catalog preflight rejects a language model assigned to native decisions without inference', async () => {
  const transport = mock(async () => { throw new Error('Inference forbidden'); });
  const client = new GatewayClient('acme-fixture-key', transport as unknown as typeof fetch);
  client.sdk.getAvailableModels = mock(async () => ({ models: [
    { id: 'acme/language', modelType: 'language' }, { id: 'acme/decision', modelType: 'decision' },
  ] }) as Awaited<ReturnType<typeof client.sdk.getAvailableModels>>);
  const language: ModelRoute = { role: 'evidence_analysis', provider: 'gateway', capability: 'language', model: 'acme/language' };
  const classifier: ModelRoute = { ...language, role: 'classification', capability: 'decision' };
  const failure = await validateWorkflowRoutes([language, classifier], client).catch(error => error);
  expect(failure).toBeInstanceOf(WorkflowPreflightError);
  expect(failure).toMatchObject({ code: 'EVAL_MODEL_CAPABILITY', route: classifier });
  expect(client.sdk.getAvailableModels).toHaveBeenCalledTimes(1);
  expect(transport).not.toHaveBeenCalled();
  await validateWorkflowRoutes([language, { ...classifier, model: 'acme/decision' }], client);
  expect(transport).not.toHaveBeenCalled();
});

test('preflight failure stops before runtime creation and records zero attempted cases', async () => {
  const runtime = mock(async () => { throw new Error('Runtime must not start'); });
  const latest = resolve(resultsRoot, 'incoming/coverage/latest.json');
  const previous = await readPrivate(latest).then(JSON.parse, () => null);
  let directory: string | undefined;
  try {
    const failure = await withModelRouting(policy, () => workflowMain('incoming', ['execute','coverage'], {
      loadCorpus: async () => [{ ...workflowControls('incoming')[0]!, dataset: 'coverage' }],
      loadMemory: async () => ({ cases: [] }), createRuntime: runtime,
      preflight: async routes => { throw new WorkflowPreflightError(routes[1]!, 'EVAL_MODEL_CAPABILITY'); },
    })).catch(error => error);
    expect(failure).toBeInstanceOf(WorkflowPreflightError);
    expect(runtime).not.toHaveBeenCalled();
    directory = resolve(resultsRoot, 'incoming/coverage', failure.run);
    const report = JSON.parse(await readPrivate(resolve(directory, 'report.json')));
    expect(report).toMatchObject({ execution: { attempted: 0 }, requests: 0, setup: { status: 'failed' } });
  } finally {
    if (directory) {
      await rm(directory, { recursive: true });
      if (previous) await writePrivate(latest, previous); else await rm(latest);
    }
  }
}, 20_000);
