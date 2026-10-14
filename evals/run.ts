import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { syntheticCases } from './cases';
import { readPrivate, writePrivate, root } from './private-files';
import { createEvaluationRun, findEvaluationRun, finishEvaluationRun } from './results';
import { captureSdkWarnings } from './warnings';
import { summarize, reviewTemplate, type Measurement, type Review } from './metrics';
import { guardNetwork } from './network';
import { resolveEnsembleTarget } from '../packages/intelligence/src/config/ensemble';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';

export function evaluationRouting(dataset: string, env: Record<string, string | undefined> = process.env) {
  const roles = dataset === 'synthetic'
    ? ['classification', 'knowledge_decision', 'validation', 'evidence_analysis', 'knowledge_draft', 'reply'] as const
    : ['classification'] as const;
  const routes = roles.map(role => resolveModelRoute(role, env));
  const ensemble = routes[0]?.capability === 'language' ? resolveEnsembleTarget(env) : null;
  return { routes, ensemble, classificationCallsPerEmail: ensemble ? 2 : 1 };
}

export async function codeFingerprint() {
  const paths = ['packages/intelligence/prompts', 'packages/intelligence/src/classification', 'evals'];
  const entries: [string, string][] = [];
  for (const path of paths) {
    for (const name of (await readdir(resolve(root, path), { recursive: true })).sort()) {
      if (!/\.(md|ts)$/.test(name) || name.endsWith('.test.ts')) continue;
      const file = resolve(root, path, name);
      entries.push([relative(root, file), createHash('sha256').update(await readFile(file)).digest('hex')]);
    }
  }
  for (const name of ['decision-workflow', 'email-knowledge', 'reply-suggestion', 'classifier-input', 'workflow-knowledge', 'onboarding-learning']) {
    const path = `apps/api/src/lib/${name}.ts`;
    entries.push([path, createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')]);
  }
  return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), files: Object.fromEntries(entries) };
}

export async function main(args: string[]) {
  const [command = 'plan', dataset = 'synthetic', rawLimit, rawRequests] = args;
  if (command === 'report') {
    const selected = await findEvaluationRun(dataset === 'synthetic' ? 'workflows' : 'classification', dataset as 'main' | 'coverage' | 'synthetic', rawLimit ?? 'latest');
    const dir = selected.directory;
    const run = JSON.parse(await readPrivate(resolve(dir, 'run.json'))) as { rows: Measurement[]; planned: number; manifest: unknown };
    const reviews = JSON.parse(await readPrivate(resolve(dir, 'reviews.json'))) as Review[];
    const previous = JSON.parse(await readPrivate(resolve(dir, 'report.json'))) as Record<string, unknown>;
    await writePrivate(resolve(dir, 'report.json'), { ...previous, manifest: run.manifest, planned: run.planned,
      completed: run.rows.filter(r => r.status === 'completed').length, cells: summarize(run.rows, reviews) });
    return { reportUpdated: true, run: selected.name, directory: dir };
  }
  if (!['plan', 'execute'].includes(command) || !['synthetic', 'main', 'coverage'].includes(dataset)) throw new Error('Unsupported command or dataset');
  const limit = rawLimit === undefined ? undefined : Number(rawLimit);
  const requestLimit = Number(rawRequests ?? 100);
  if ((limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) || !Number.isSafeInteger(requestLimit) || requestLimit < 1) throw new Error('Positive integer limits required');
  if (command === 'plan') return { dataset, cases: dataset === 'synthetic' ? syntheticCases.slice(0, limit).map(c => ({ id: c.id, contract: c.contract })) : 'existing private corpus',
    requestLimit, network: false, routing: evaluationRouting(dataset), outputs: `scripts/eval/data/output/evals/${dataset === 'synthetic' ? 'workflows' : 'classification'}/${dataset}/<UTC-date-time>/`,
    entrypoints: { onboarding_triage: 'classifyEmailWithMeta', historical_learning: 'processDecisionWork',
      incoming_email_decision: 'processDecisionWork', knowledge_impact: 'processDecisionWork', reply_suggestion: 'suggestReply' } };

  let routing: ReturnType<typeof evaluationRouting>;
  try { routing = evaluationRouting(dataset); }
  catch { throw new Error('EVAL_MODEL_CONFIGURATION'); }
  const savedRun = await createEvaluationRun(dataset === 'synthetic' ? 'workflows' : 'classification', dataset as 'main' | 'coverage' | 'synthetic');
  const runId = savedRun.name;
  const dir = savedRun.directory;
  console.log(JSON.stringify({ dataset, run: runId, directory: dir, ...routing, requestLimit }));
  const manifest = { ...await codeFingerprint(), runId, dataset, createdAt: new Date().toISOString(),
    ...routing, requestLimit, scope: 'real model outputs; isolated storage and retrieval',
    productionCalibration: false, databaseSafety: 'separate technical database suite' };
  const rows: Measurement[] = [];
  await writePrivate(resolve(dir, 'run.json'), { manifest, planned: 0, rows });
  const originalConsole = { ...console };
  const sdkWarnings = captureSdkWarnings();
  const originalFetch = globalThis.fetch;
  const network = guardNetwork(requestLimit);
  globalThis.fetch = network.fetch;
  const diagnostics: unknown[][] = [];
  // Provider diagnostics can contain corpus text; only the private artifact may receive them.
  console.log = console.info = console.warn = console.error = console.debug = (...values: unknown[]) => { diagnostics.push(values.map(v => v instanceof Error ? { name: v.name, message: v.message } : v)); };
  let phase = 'EVAL_CORPUS_LOAD';
  try {
    const examples = (dataset === 'synthetic' ? syntheticCases : await (await import('./corpus')).loadCorpus(dataset as 'main' | 'coverage')).slice(0, limit);
    phase = 'EVAL_RUNTIME_SETUP';
    const execute = await (await import('./runtime')).createRuntime();
    phase = 'EVAL_EXECUTION';
    for (const example of examples) {
      const started = performance.now();
      const offset = network.requests.length;
      const responseOffset = network.responses.length;
      try {
        const result = await execute(example);
        rows.push({ case: example, status: 'completed', ...result, latencyMs: performance.now() - started, requests: network.requests.slice(offset), responses: network.responses.slice(responseOffset) });
      } catch (error) {
        rows.push({ case: example, status: 'failed', prediction: {}, abstain: null, latencyMs: performance.now() - started,
          requests: network.requests.slice(offset), responses: network.responses.slice(responseOffset), output: error instanceof Error ? { name: error.name, message: error.message } : { failed: true }, calls: [], safety: {} });
      }
      await writePrivate(resolve(dir, 'run.json'), { manifest, planned: examples.length, rows });
      originalConsole.log(JSON.stringify({ case: example.id, contract: example.contract, status: rows.at(-1)!.status }));
      if (network.stopped) break;
    }
    await writePrivate(resolve(dir, 'reviews.json'), reviewTemplate(rows));
    await writePrivate(resolve(dir, 'report.json'), { manifest, planned: examples.length, cells: summarize(rows), warningCount: sdkWarnings.count() });
    const failed = rows.some(r => r.status === 'failed') || rows.length !== examples.length;
    if (failed) process.exitCode = 1;
    await finishEvaluationRun(savedRun, failed ? 'failed' : 'completed');
    return { run: runId, directory: dir, completed: rows.filter(r => r.status === 'completed').length, planned: examples.length, warningCount: sdkWarnings.count(), actualModelEvaluation: true };
  } catch (error) {
    diagnostics.push([error instanceof Error ? {name:error.name,message:error.message} : {failed:true}]);
    await finishEvaluationRun(savedRun, 'failed');
    throw new Error(phase);
  } finally {
    Object.assign(console, originalConsole);
    globalThis.fetch = originalFetch;
    sdkWarnings.restore();
    await writePrivate(resolve(dir, 'diagnostics.json'), diagnostics);
    await writePrivate(resolve(dir, 'warnings.json'), sdkWarnings.events);
  }
}

if (import.meta.main) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); }
  catch (error) {
    const code = error instanceof Error && ['EVAL_MODEL_CONFIGURATION','EVAL_CORPUS_LOAD','EVAL_RUNTIME_SETUP','EVAL_EXECUTION'].includes(error.message) ? error.message : 'EVAL_SETUP';
    console.error(`Evaluation stopped: ${code}. Raw diagnostics remain private.`); process.exitCode = 1;
  }
}
