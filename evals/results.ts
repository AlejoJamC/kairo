import { mkdir, readdir, rename, rmdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { privateRoot, privatePath, readPrivate, writePrivate } from './private-files';

export const resultModes = ['classification', 'workflows', 'onboarding', 'technical'] as const;
export const resultDatasets = ['main', 'coverage', 'synthetic', 'local'] as const;
export type ResultMode = typeof resultModes[number];
export type ResultDataset = typeof resultDatasets[number];
export const resultsRoot = resolve(privateRoot, 'output/evals');
export interface EvaluationRun {
  name: string; directory: string; mode: ResultMode; dataset: ResultDataset; startedAt: string;
}
const runName = /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}Z(?:-\d+)?$/;
function validate(mode: string, dataset: string) {
  if (!(resultModes as readonly string[]).includes(mode) || !(resultDatasets as readonly string[]).includes(dataset)) throw new Error('Unknown result mode or dataset');
}
function timestamp(date: Date) { return date.toISOString().replace('T', '_').replaceAll(':', '-').replace('.', '-'); }

export async function createEvaluationRun(mode: ResultMode, dataset: ResultDataset, date = new Date()): Promise<EvaluationRun> {
  validate(mode, dataset);
  const base = await privatePath(resolve(resultsRoot, mode, dataset));
  await mkdir(base, { recursive: true, mode: 0o700 });
  const stamp = timestamp(date);
  for (let suffix = 1; ; suffix++) {
    const name = suffix === 1 ? stamp : `${stamp}-${String(suffix).padStart(3, '0')}`;
    const directory = await privatePath(resolve(base, name));
    try { await mkdir(directory, { mode: 0o700 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
    const run = { name, directory, mode, dataset, startedAt: date.toISOString() };
    await finishEvaluationRun(run, 'running');
    return run;
  }
}

export async function finishEvaluationRun(run: EvaluationRun, status: 'running' | 'completed' | 'failed') {
  const record = { run: run.name, mode: run.mode, dataset: run.dataset, startedAt: run.startedAt,
    updatedAt: new Date().toISOString(), status, directory: relative(privateRoot, run.directory) };
  await writePrivate(resolve(run.directory, 'status.json'), record);
  const latest = resolve(resultsRoot, run.mode, run.dataset, 'latest.json');
  const lock = await privatePath(resolve(resultsRoot, run.mode, run.dataset, '.latest-lock'));
  let locked = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { await mkdir(lock, { mode: 0o700 }); locked = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const age = await stat(lock).then(value => Date.now() - value.mtimeMs, () => 0);
      if (age > 30_000) await rmdir(lock).catch(() => {});
      await new Promise(done => setTimeout(done, 10));
    }
  }
  if (!locked) throw new Error('Result index busy');
  try {
    let previous: { run: string } | null;
    try { previous = JSON.parse(await readPrivate(latest)) as { run: string }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; previous = null; }
    if (!previous || previous.run <= run.name) await writePrivate(latest, record);
  } finally { await rmdir(lock); }
}

export async function findEvaluationRun(mode: ResultMode, dataset: ResultDataset, selector = 'latest') {
  validate(mode, dataset);
  let name = selector;
  if (name === 'latest') {
    const latest = JSON.parse(await readPrivate(resolve(resultsRoot, mode, dataset, 'latest.json'))) as { run: string };
    name = latest.run;
  }
  if (!runName.test(name)) throw new Error('Dated run name or latest required');
  return { name, directory: await privatePath(resolve(resultsRoot, mode, dataset, name)) };
}

/** Move only previous runner outputs. Corpus inputs and other output formats remain untouched. */
export async function organizeExistingResults() {
  let moved = 0;
  const output = resolve(privateRoot, 'output');
  const oldFolders = (await readdir(output, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name !== 'evals').map(entry => entry.name);
  for (const oldFolder of oldFolders) {
    const oldRoot = resolve(privateRoot, 'output', oldFolder);
    const entries = await readdir(oldRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []; throw error;
    });
    for (const entry of entries.filter(entry => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name))) {
      const oldDirectory = await privatePath(resolve(oldRoot, entry.name));
      const files = await readdir(oldDirectory);
      if (!files.some(file => ['run.json', 'manifest.json', 'technical.json', 'diagnostics.json'].includes(file))) continue;
      let manifest: Record<string, unknown> = {};
      if (files.includes('manifest.json')) manifest = JSON.parse(await readPrivate(resolve(oldDirectory, 'manifest.json'))) as Record<string, unknown>;
      else if (files.includes('run.json')) manifest = (JSON.parse(await readPrivate(resolve(oldDirectory, 'run.json'))) as { manifest?: Record<string, unknown> }).manifest ?? {};
      const dataset: ResultDataset = ['main', 'coverage', 'synthetic'].includes(String(manifest['dataset']))
        ? manifest['dataset'] as ResultDataset : 'local';
      const mode: ResultMode = oldFolder === 'onboarding' ? 'onboarding' : files.includes('technical.json') ? 'technical'
        : dataset === 'synthetic' ? 'workflows' : 'classification';
      const recorded = Date.parse(String(manifest['createdAt'] ?? ''));
      const date = Number.isFinite(recorded) ? new Date(recorded) : (await stat(oldDirectory)).mtime;
      const run = await createEvaluationRun(mode, dataset, date);
      for (const file of files) {
        const from = await privatePath(resolve(oldDirectory, file));
        const to = await privatePath(resolve(run.directory, file));
        await rename(from, to);
      }
      await rmdir(oldDirectory);
      let successful = false;
      if (files.includes('technical.json')) {
        const technical = JSON.parse(await readPrivate(resolve(run.directory, 'technical.json'))) as { planned: number; results: { exitCode: number | null }[] };
        successful = technical.results.length === technical.planned && technical.results.every(row => row.exitCode === 0);
      } else if (files.includes('report.json')) {
        const report = JSON.parse(await readPrivate(resolve(run.directory, 'report.json'))) as { failedSteps?: number; stopped?: boolean; completed?: number; planned?: number; cells?: { failed: number }[] };
        successful = report.failedSteps === undefined ? !report.cells?.some(cell => cell.failed > 0) && report.completed === report.planned
          : report.failedSteps === 0 && !report.stopped;
      }
      await finishEvaluationRun(run, successful ? 'completed' : 'failed');
      moved++;
    }
    await rmdir(oldRoot).catch((error: NodeJS.ErrnoException) => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code ?? '')) throw error; });
  }
  return { organizedRuns: moved, outputs: 'scripts/eval/data/output/evals/<mode>/<dataset>/<UTC-date-time>/' };
}

if (import.meta.main) {
  if (process.argv[2] !== 'organize') throw new Error('Use organize');
  try { console.log(JSON.stringify(await organizeExistingResults())); }
  catch { console.error('Result organization stopped; private files were preserved.'); process.exitCode = 1; }
}
