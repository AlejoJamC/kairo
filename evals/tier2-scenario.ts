import { resolve } from 'node:path';
import type { EvalCase } from './cases';
import type { Row } from './storage';
import { findEvaluationRun } from './results';
import { readPrivate } from './private-files';

export interface HistoricalBaseline {
  run: string;
  tables: Record<string, Row[]>;
  classified: { example: EvalCase; ticketId: string; messageId: string }[];
  manifest: { dataset: string; positions: number[]; selected: number };
}

/** Reuse a finished private snapshot; never repeat the initial model calls. */
export async function loadHistoricalBaseline(dataset: 'main' | 'coverage', selector = 'latest'): Promise<HistoricalBaseline> {
  const saved = await findEvaluationRun('onboarding', dataset, selector).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error('EVAL_BASELINE_NOT_FOUND'); throw error;
  });
  const status = JSON.parse(await readPrivate(resolve(saved.directory, 'status.json'))) as { status: string };
  if (!['completed', 'failed'].includes(status.status)) throw new Error('EVAL_BASELINE_RUNNING');
  const run = JSON.parse(await readPrivate(resolve(saved.directory, 'run.json'))) as HistoricalBaseline;
  validateHistoricalBaseline(run, dataset);
  return { ...run, run: saved.name };
}

export function validateHistoricalBaseline(baseline: HistoricalBaseline, dataset: string) {
  if (baseline.manifest?.dataset !== dataset || !Array.isArray(baseline.manifest.positions)
    || !baseline.manifest.positions.length || baseline.manifest.positions.length !== baseline.manifest.selected
    || new Set(baseline.manifest.positions).size !== baseline.manifest.positions.length
    || !Array.isArray(baseline.classified) || !baseline.tables
    || !['accounts', 'tickets', 'messages', 'conversations', 'ticket_messages'].every(table => Array.isArray(baseline.tables[table]))) {
    throw new Error('EVAL_BASELINE_INVALID');
  }
  if (baseline.tables['accounts']!.length !== 1 || baseline.tables['accounts']![0]!['id'] !== 'acme-account') throw new Error('EVAL_BASELINE_ACCOUNT');
  // Onboarding has no approved knowledge. A later approval requires its own explicit scenario.
  if (baseline.tables['current_knowledge']?.length || baseline.tables['kb_articles']?.some(row => row['is_published'] === true)
    || baseline.tables['operational_learning']?.some(row => row['status'] === 'approved')) throw new Error('EVAL_BASELINE_KNOWLEDGE_STATE');
  for (const item of baseline.classified) {
    if (!baseline.manifest.positions.includes(item.example.id)
      || !baseline.tables['tickets']!.some(row => row['id'] === item.ticketId)
      || !baseline.tables['messages']!.some(row => row['id'] === item.messageId)
      || !baseline.tables['ticket_messages']!.some(row => row['ticket_id'] === item.ticketId && row['message_id'] === item.messageId)) throw new Error('EVAL_BASELINE_LINKAGE');
  }
}

export function messageTime(example: EvalCase): number | null {
  const date = Object.entries(example.headers ?? {}).find(([key]) => key.toLowerCase() === 'date')?.[1];
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function processedOnboardingPositions(baseline: HistoricalBaseline): number[] {
  return baseline.manifest.positions.filter(position => baseline.classified.some(item => item.example.id === position)
    || baseline.tables['messages']!.some(row => row['id'] === `acme-message-${position}` && row['processing_tier'] === 1 && typeof row['skip_reason'] === 'string'));
}

/** Corpus time supplies the virtual inbox clock; old fixtures do not age out between runs. */
export function selectHistoricalWindow(corpus: EvalCase[], baseline: HistoricalBaseline, windowDays: number) {
  if (!Number.isSafeInteger(windowDays) || windowDays < 1) throw new Error('EVAL_WINDOW_INVALID');
  validateHistoricalBaseline(baseline, corpus[0]?.dataset ?? '');
  const ids = new Set(corpus.map(row => row.id));
  if (ids.size !== corpus.length || baseline.manifest.positions.some(id => !ids.has(id))) throw new Error('EVAL_BASELINE_CORPUS_MISMATCH');
  for (const item of baseline.classified) {
    const current = corpus.find(row => row.id === item.example.id)!;
    if (current.body !== item.example.body || current.subject !== item.example.subject
      || current.from !== item.example.from || JSON.stringify(current.headers) !== JSON.stringify(item.example.headers)) throw new Error('EVAL_BASELINE_CORPUS_CHANGED');
  }
  const times = corpus.map(messageTime).filter((time): time is number => time !== null);
  if (!times.length) throw new Error('EVAL_CORPUS_DATES_MISSING');
  const anchor = Math.max(...times);
  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - windowDays);
  start.setUTCHours(0, 0, 0, 0);
  const processed = new Set(processedOnboardingPositions(baseline));
  const exclusions: { case: number; reason: 'onboarding_processed' | 'missing_date' | 'outside_window' }[] = [];
  const window: EvalCase[] = [];
  for (const example of corpus) {
    const time = messageTime(example);
    if (time === null) exclusions.push({ case: example.id, reason: 'missing_date' });
    else if (time <= start.getTime()) exclusions.push({ case: example.id, reason: 'outside_window' });
    else {
      window.push(example);
      if (processed.has(example.id)) exclusions.push({ case: example.id, reason: 'onboarding_processed' });
    }
  }
  window.sort((a, b) => messageTime(b)! - messageTime(a)! || a.id - b.id);
  return { anchor: new Date(anchor).toISOString(), after: start.toISOString(), windowDays, window,
    cases: window.filter(row => !processed.has(row.id)), exclusions };
}
