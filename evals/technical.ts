import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { root, privateRoot, writePrivate } from './private-files';

export const suites = [
  { file: 'evals/checks.test.ts', covers: ['runner', 'metrics', 'privacy', 'network limits'] },
  { file: 'evals/runtime.test.ts', covers: ['production entrypoints', 'isolated storage'] },
  { file: 'evals/onboarding.test.ts', covers: ['random sampling', 'ticket-to-knowledge chain', 'conditional calls', 'first delivery', 'idempotency'] },
  { file: 'packages/intelligence/src/classification/workflow-contract.test.ts', covers: ['contract separation', 'insufficiency', 'contradiction', 'alternatives', 'declared risk'] },
  { file: 'apps/api/src/lib/classifier-input.test.ts', covers: ['bounded initial evidence'] },
  { file: 'apps/api/src/lib/decision-workflow.test.ts', covers: ['initial sample enrichment', 'relevance', 'current versions', 'historical and incoming contracts'] },
  { file: 'apps/api/src/lib/email-knowledge.test.ts', covers: ['unapproved proposals', 'source grounding'] },
  { file: 'apps/api/src/lib/suggest-reply.test.ts', covers: ['live retrieval', 'versioned references', 'failure isolation'] },
  { file: 'apps/api/src/lib/decision-work-queue.test.ts', covers: ['bounded retries', 'idempotency'] },
];

export async function technical(database: boolean) {
  const selected = [...suites, ...(database ? [{ file: 'apps/api/src/lib/decision-workflow.db.test.ts',
    covers: ['permissions', 'human concurrency', 'immutable history', 'idempotency', 'knowledge selection', 'coverage and cost'] }] : [])];
  const runId = randomUUID();
  const results = [];
  for (const suite of selected) {
    // Separate processes prevent Bun module mocks from contaminating other suites.
    const result = spawnSync(process.execPath, ['test', suite.file], { cwd: root, encoding: 'utf8', timeout: 120_000,
      env: { ...process.env, SKIP_LLM_INTEGRATION: '1', RUN_GATEWAY_INTEGRATION: '0', RUN_WORKFLOW_DB_TESTS: database ? '1' : '0' } });
    results.push({ ...suite, exitCode: result.status, output: result.stdout, errors: result.stderr });
    console.log(JSON.stringify({ suite: suite.file, passed: result.status === 0 }));
    if (result.status !== 0) break;
  }
  await writePrivate(resolve(privateRoot, 'output/ac11', runId, 'technical.json'), {
    database: database ? 'disposable local database only' : 'not executed', planned: selected.length, results,
  });
  if (results.some(r => r.exitCode !== 0) || results.length !== selected.length) process.exitCode = 1;
  return runId;
}
if (import.meta.main) {
  if (process.argv.slice(2).some(arg => arg !== '--database')) throw new Error('Unsupported technical option');
  try { console.log(JSON.stringify({ run: await technical(process.argv.includes('--database')) })); }
  catch { console.error('Technical evaluation stopped; inspect the private artifacts.'); process.exitCode = 1; }
}
