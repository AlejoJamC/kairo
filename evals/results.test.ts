import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEvaluationRun, findEvaluationRun, finishEvaluationRun, resultsRoot, type EvaluationRun } from './results';
import { readPrivate, writePrivate } from './private-files';

test('dated output folders avoid collisions and latest stays on the newest execution', async () => {
  const mode = 'technical';
  const dataset = 'local';
  const latest = resolve(resultsRoot, mode, dataset, 'latest.json');
  const previous = await readPrivate(latest).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  const runs: EvaluationRun[] = [];
  try {
    const date = new Date('2099-01-01T12:00:00.123Z');
    runs.push(...await Promise.all([createEvaluationRun(mode, dataset, date), createEvaluationRun(mode, dataset, date)]));
    runs.sort((a, b) => a.name.localeCompare(b.name));
    expect(runs[0]!.name).not.toBe(runs[1]!.name);
    expect(runs[0]!.name).toMatch(/^2099-01-01_12-00-00-123Z/);
    expect(runs[1]!.directory).toContain('/technical/local/');
    await finishEvaluationRun(runs[1]!, 'failed');
    await finishEvaluationRun(runs[0]!, 'completed');
    expect(await findEvaluationRun(mode, dataset)).toEqual({ name: runs[1]!.name, directory: runs[1]!.directory });
    expect(JSON.parse(await readPrivate(latest))).toMatchObject({ status: 'failed', mode, dataset });
    expect(await findEvaluationRun(mode, dataset, runs[0]!.name)).toHaveProperty('directory', runs[0]!.directory);
    await expect(findEvaluationRun(mode, dataset, '../../input')).rejects.toThrow('Dated run name');
    await expect(findEvaluationRun('onboarding', 'invalid' as 'main')).rejects.toThrow('Unknown result');
  } finally {
    for (const run of runs) await rm(run.directory, { recursive: true, force: true });
    if (previous) await writePrivate(latest, JSON.parse(previous));
    else await rm(latest, { force: true });
  }
});
