import type { EvalCase } from './cases';
import type { Row } from './storage';
import { onboardingStorage, accountId } from './onboarding-storage';

export interface DeferredScenario {
  tables: Record<string, Row[]>;
  classified: { example: EvalCase; ticketId: string; messageId: string }[];
  manifest: { dataset: string; positions: number[]; selected: number };
}

/** Corpus input and isolated account state; previous evaluation artifacts are never read. */
export function createDeferredScenario(corpus: EvalCase[]): DeferredScenario {
  if (!corpus.length) throw new Error('EVAL_CORPUS_EMPTY');
  return { tables: onboardingStorage(corpus[0]!.lang).tables, classified: [],
    manifest: { dataset: corpus[0]!.dataset, positions: [], selected: 0 } };
}

export function messageTime(example: EvalCase): number | null {
  const date = Object.entries(example.headers ?? {}).find(([key]) => key.toLowerCase() === 'date')?.[1];
  const time = date ? Date.parse(date) : NaN;
  return Number.isFinite(time) ? time : null;
}

export function processedDeferredPositions(scenario: DeferredScenario): number[] {
  return scenario.classified.map(row => row.example.id);
}

function validateScenario(corpus: EvalCase[], scenario: DeferredScenario) {
  if (!corpus.length) throw new Error('EVAL_CORPUS_EMPTY');
  if (scenario.manifest.dataset !== corpus[0]?.dataset || scenario.tables['accounts']?.length !== 1
    || scenario.tables['accounts'][0]?.['id'] !== accountId) throw new Error('EVAL_SCENARIO_INVALID');
  if (scenario.tables['current_knowledge']?.length || scenario.tables['kb_articles']?.some(row => row['is_published'] === true)
    || scenario.tables['operational_learning']?.some(row => row['status'] === 'approved')) throw new Error('EVAL_SCENARIO_KNOWLEDGE_STATE');
  const ids = new Set(corpus.map(row => row.id));
  if (ids.size !== corpus.length) throw new Error('EVAL_CORPUS_POSITION_INVALID');
  for (const item of scenario.classified) {
    const current = corpus.find(row => row.id === item.example.id);
    if (!current || current.body !== item.example.body || current.subject !== item.example.subject
      || JSON.stringify(current.headers) !== JSON.stringify(item.example.headers)) throw new Error('EVAL_SCENARIO_SOURCE_CHANGED');
    if (!scenario.tables['tickets']?.some(row => row['id'] === item.ticketId)
      || !scenario.tables['messages']?.some(row => row['id'] === item.messageId)
      || !scenario.tables['ticket_messages']?.some(row => row['ticket_id'] === item.ticketId && row['message_id'] === item.messageId)) throw new Error('EVAL_SCENARIO_LINKAGE');
  }
}

/** Evaluate the supplied workflow inputs independently from mailbox scheduling. */
export function selectDeferredCorpus(corpus: EvalCase[], scenario: DeferredScenario) {
  validateScenario(corpus, scenario);
  const times = corpus.map(messageTime).filter((time): time is number => time !== null);
  const anchor = new Date(times.length ? Math.max(...times) : Date.now()).toISOString();
  const processed = new Set(processedDeferredPositions(scenario));
  const cases = corpus.filter(row => !processed.has(row.id));
  if (!cases.length) throw new Error('EVAL_NO_UNPROCESSED_CASES');
  return { anchor, window: corpus, cases,
    exclusions: corpus.filter(row => processed.has(row.id)).map(row => ({ case: row.id, reason: 'previously_processed' })) };
}

/** Calendar selection is a transport check, separate from model workflow evaluation. */
export function selectDeferredWindow(corpus: EvalCase[], scenario: DeferredScenario, maxDays: number) {
  if (!Number.isSafeInteger(maxDays) || maxDays < 1) throw new Error('EVAL_WINDOW_INVALID');
  validateScenario(corpus, scenario);
  const times = corpus.map(messageTime).filter((time): time is number => time !== null);
  if (!times.length) throw new Error('EVAL_CORPUS_DATES_MISSING');
  const anchor = new Date(Math.max(...times)).toISOString();
  const cutoff = (days: number) => {
    const date = new Date(anchor); date.setDate(date.getDate() - days);
    return `${date.toISOString().slice(0, 10)}T00:00:00.000Z`;
  };
  const batches = [
    { step: 'batch-a-16-30d', from: 16, to: 30 },
    { step: 'batch-b-31-60d', from: 31, to: 60 },
    { step: 'batch-c-61-maxd', from: 61, to: maxDays },
  ].map(batch => ({ ...batch, after: cutoff(batch.to), before: cutoff(batch.from) }));
  const processed = new Set(processedDeferredPositions(scenario));
  const window = corpus.filter(row => { const time = messageTime(row); return time !== null
    && batches.some(batch => time > Date.parse(batch.after) && time < Date.parse(batch.before));
  }).sort((a, b) => messageTime(b)! - messageTime(a)! || a.id - b.id);
  const selected = new Set(window.map(row => row.id));
  const remainingStart = Date.parse(cutoff(15));
  const oldest = Date.parse(cutoff(maxDays));
  const exclusions = corpus.filter(row => processed.has(row.id) || !selected.has(row.id)).map(row => {
    const time = messageTime(row);
    return { case: row.id, reason: processed.has(row.id) ? 'previously_processed' : time === null ? 'missing_date'
      : time > oldest && time <= remainingStart ? 'uncovered_production_boundary' : 'outside_window' };
  });
  return { anchor, after: cutoff(maxDays), windowDays: maxDays, window,
    cases: window.filter(row => !processed.has(row.id)), exclusions, batches,
    coverageGaps: exclusions.filter(row => row.reason === 'uncovered_production_boundary').map(row => row.case) };
}
