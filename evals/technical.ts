import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { root, writePrivate } from './private-files';
import { createEvaluationRun, finishEvaluationRun } from './results';

export const suites = [
  { file: 'evals/semantic-storage.test.ts', covers: ['production embeddings domain', 'indexed source lifecycle', 'consumer retrieval', 'explicit memory storage boundary'] },
  { file: 'evals/quality.test.ts', covers: ['quality thresholds', 'execution separation', 'ticket uncertainty', 'proposal validation counts'] },
  { file: 'packages/intelligence/src/classification/historical-attention.test.ts', covers: ['historical rubric parity', 'independent priority and urgency', 'initial reading preservation'] },
  { file: 'packages/intelligence/src/knowledge/source-fragments.test.ts', covers: ['exact source references', 'invalid reference isolation'] },
  { file: 'evals/checks.test.ts', covers: ['runner', 'metrics', 'privacy', 'network limits'] },
  { file: 'evals/runtime.test.ts', covers: ['production entrypoints', 'isolated storage'] },
  { file: 'evals/onboarding.test.ts', covers: ['random sampling', 'ticket-to-knowledge chain', 'conditional calls', 'first delivery', 'idempotency'] },
  { file: 'evals/tier2.test.ts', covers: ['historical window', 'onboarding continuation', 'production Tier 2 job', 'conversation evidence', 'human decisions', 'private reports'] },
  { file: 'evals/tier2-routing.test.ts', covers: ['historical model policy', 'independent roles', 'concurrent initial-scan isolation'] },
  { file: 'evals/tier3.test.ts', covers: ['independent corpus scenario', 'deferred batches', 'historical learning', 'closure', 'private reports'] },
  { file: 'evals/review-memory.test.ts', covers: ['explicit review choices', 'source preservation'] },
  { file: 'evals/enrichment-candidates.test.ts', covers: ['embedding candidate selection', 'per-knowledge limits'] },
  { file: 'evals/enrichment-memory.test.ts', covers: ['private source proposals', 'explicit memory approval', 'target position validation'] },
  { file: 'evals/workflow-scenarios.test.ts', covers: ['independent workflows', 'private memory', 'conversation chronology', 'membership and version fixtures'] },
  { file: 'evals/workflow-runtime.test.ts', covers: ['incoming decisions and learning', 'approval and enrichment', 'live reply sources', 'human concurrency', 'idempotency'] },
  { file: 'evals/workflow-eval.test.ts', covers: ['per-workflow routing and call counts', 'private reports', 'quality and execution separation'] },
  { file: 'evals/results.test.ts', covers: ['dated output layout', 'latest execution', 'collision isolation'] },
  { file: 'packages/intelligence/src/classification/workflow-contract.test.ts', covers: ['contract separation', 'insufficiency', 'contradiction', 'alternatives', 'declared risk'] },
  { file: 'apps/api/src/lib/classifier-input.test.ts', covers: ['bounded initial evidence'] },
  { file: 'apps/api/src/lib/decision-workflow.test.ts', covers: ['initial sample enrichment', 'relevance', 'current versions', 'historical and incoming contracts'] },
  { file: 'apps/api/src/lib/email-knowledge.test.ts', covers: ['unapproved proposals', 'source grounding'] },
  { file: 'apps/api/src/lib/suggest-reply.test.ts', covers: ['live retrieval', 'versioned references', 'failure isolation'] },
  { file: 'apps/api/src/lib/decision-work-queue.test.ts', covers: ['bounded retries', 'idempotency'] },
];

export function semanticFlowEvidence(output: string) {
  for (const line of output.split('\n')) {
    if (!line.startsWith('{')) continue;
    let value: { semanticFlow?: boolean; steps?: string[]; calls?: Record<string, number>; storage?: string; embedding?: string; simulated?: string[]; relevanceQuality?: string };
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.semanticFlow !== true || value.storage !== 'real_local_supabase' || !Array.isArray(value.steps) ||
      !value.steps.includes('tier1-fast-path:scan-and-dispatch') || !value.steps.includes('decision-workflows:claim-work') ||
      !value.calls || !['classification','knowledge','embedding','assistant','reply'].every(key => (value.calls?.[key] ?? 0) > 0)) continue;
    return value;
  }
  return null;
}

export async function technical(database: boolean, semanticFlow = false, ollama = false) {
  const selected = semanticFlow ? [{ file: 'evals/semantic-flow.test.ts',
    covers: ['production email pipeline', 'real durable work claim and settlement', 'review authorization', 'semantic indexing and agent retrieval', 'tenant isolation and withdrawal'] }] : [...suites, ...(database ? [{ file: 'apps/api/src/lib/decision-workflow.db.test.ts',
    covers: ['permissions', 'human concurrency', 'immutable history', 'idempotency', 'knowledge selection', 'coverage and cost'] }] : [])];
  const run = await createEvaluationRun('technical', 'local');
  const results = [];
  for (const suite of selected) {
    // Separate processes prevent Bun module mocks from contaminating other suites.
    const args = semanticFlow ? ['--no-env-file', 'scripts/test-semantic-integration.ts', '--semantic-flow', ...(ollama ? ['--ollama'] : [])]
      : ['--no-env-file', 'test', suite.file];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: semanticFlow ? 600_000 : 120_000,
      env: { ...process.env, SKIP_LLM_INTEGRATION: '1', RUN_GATEWAY_INTEGRATION: '0', RUN_WORKFLOW_DB_TESTS: database ? '1' : '0' } });
    const flow = semanticFlow ? semanticFlowEvidence(result.stdout ?? '') : null;
    const exitCode = semanticFlow && !flow ? 1 : result.status;
    results.push({ ...suite, exitCode, output: result.stdout, errors: result.stderr });
    if (semanticFlow) {
      await writePrivate(resolve(run.directory, 'trace.json'), { steps: flow?.steps ?? [], calls: flow?.calls ?? {} });
      await writePrivate(resolve(run.directory, 'report.json'), { passed: exitCode === 0, evidence: flow,
        infrastructure: 'existing local Supabase; scheduler transport simulated',
        modelQuality: 'not measured by controlled transport responses' });
    }
    console.log(JSON.stringify({ suite: suite.file, passed: exitCode === 0 }));
    if (exitCode !== 0) break;
  }
  await writePrivate(resolve(run.directory, 'technical.json'), {
    database: database || semanticFlow ? 'existing local Supabase' : 'not executed',
    embeddings: semanticFlow && ollama ? 'real local Ollama' : 'fixture', planned: selected.length, results,
  });
  if (results.some(r => r.exitCode !== 0) || results.length !== selected.length) process.exitCode = 1;
  await finishEvaluationRun(run, results.some(r => r.exitCode !== 0) || results.length !== selected.length ? 'failed' : 'completed');
  return run.directory;
}
if (import.meta.main) {
  if (process.argv.slice(2).some(arg => !['--database','--semantic-flow','--ollama'].includes(arg))) throw new Error('Unsupported technical option');
  if (process.argv.includes('--ollama') && !process.argv.includes('--semantic-flow')) throw new Error('Ollama requires the local semantic flow');
  try { console.log(JSON.stringify({ run: await technical(process.argv.includes('--database'), process.argv.includes('--semantic-flow'), process.argv.includes('--ollama')) })); }
  catch { console.error('Technical evaluation stopped; inspect the private artifacts.'); process.exitCode = 1; }
}
