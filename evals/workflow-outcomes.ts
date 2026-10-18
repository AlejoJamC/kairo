import type { Measurement } from './metrics';
import type { WorkflowMode } from './workflow-scenarios';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const records = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(record) : [];

/** Read saved outcomes without inference or interpreting missing labels as success. */
export function workflowOutcomes(mode: WorkflowMode, rows: Measurement[]) {
  return ['main', 'coverage', 'synthetic'].flatMap(dataset => {
    const group = rows.filter(row => row.case.dataset === dataset);
    if (!group.length) return [];
    const completed = group.filter(row => row.status === 'completed');
    const skipped = completed.filter(row => row.prediction['skipped'] === 'true');
    const assessed = completed.filter(row => row.prediction['skipped'] === 'false');
    const history = completed.flatMap(row => records(record(row.output)['history']).map(item => record(item['result'])));
    const replyChecks = group.flatMap(row => {
      const calls = row.calls.filter(call => record(call)['feature'] === 'reply_support_validation');
      if (!calls.length) return records(record(row.output)['history']).map(item =>
        String(record(record(record(record(item['result'])['validation'])['value'])['support'])['choice'] ?? 'missing'));
      return calls.map(call => {
        try {
          const choice = record(record(JSON.parse(String(record(call)['responseText'])))['support'])['choice'];
          return ['supported','unsupported','uncertain'].includes(String(choice)) ? String(choice) : 'missing';
        } catch { return 'missing'; }
      });
    });
    const counts = (values: string[]) => Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]));
    const decisions = assessed.map(row => ({ position: row.case.id,
      contribution: row.prediction['contribution'], application: row.prediction['application'],
      requests: row.requests.length,
      judgment: row.calls.flatMap(call => {
        const value = record(call);
        if (value['feature'] !== 'knowledge_impact' || typeof value['responseText'] !== 'string') return [];
        try {
          const answer = record(record(JSON.parse(value['responseText']))['contribution']);
          const probabilities = record(answer['probabilities']);
          return [{ confidence: typeof answer['confidence'] === 'number' ? answer['confidence'] : null,
            probabilities: Object.fromEntries(['solution','correction','action','none','unknown'].flatMap(key =>
              typeof probabilities[key] === 'number' ? [[key, probabilities[key]]] : [])), calibrated: false }];
        } catch { return []; }
      }),
    }));
    return [{ dataset, cases: group.length, uniqueEmails: new Set(group.map(row => row.case.id)).size,
      completed: completed.length, failed: group.length - completed.length, skipped: skipped.length,
      requests: group.reduce((sum, row) => sum + row.requests.length, 0),
      withApprovedMemory: group.filter(row => row.case.knowledge?.some(item => item.status === 'approved')).length,
      incoming: mode === 'incoming' ? { decisions: history.length,
        nextActions: counts(completed.map(row => row.prediction['nextAction'] ?? 'missing')),
        learningProposals: completed.reduce((sum, row) => {
          const tables = record(record(row.output)['tables']);
          return sum + records(tables['operational_learning']).filter(item => item['status'] === 'pending_review').length
            + records(tables['kb_articles']).filter(item => item['is_published'] === false).length;
        }, 0) } : null,
      enrichment: mode === 'enrichment' ? { evaluatedPairs: assessed.length,
        contributions: counts(assessed.map(row => row.prediction['contribution'] ?? 'missing')),
        applied: assessed.filter(row => row.prediction['application'] === 'enriched').length,
        proposed: assessed.filter(row => row.prediction['application'] === 'pending_human_review').length,
        withoutContribution: assessed.filter(row => row.prediction['contribution'] === 'none').length,
        indeterminate: assessed.filter(row => row.prediction['contribution'] === 'unknown').length,
        decisions } : null,
      reply: mode === 'reply' ? { drafts: history.filter(item => typeof item['suggestion'] === 'string').length,
        generatedDrafts: group.reduce((sum, row) => sum + row.calls.filter(call => record(call)['feature'] === 'reply_suggestion' && !record(call)['errorCode']).length, 0),
        withCitedKnowledge: history.filter(item => records(item['sources']).length > 0).length,
        supportChecks: counts(replyChecks),
        humanUtilityVerified: false } : null,
    }];
  });
}
