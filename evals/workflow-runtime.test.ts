import { expect, test, mock } from 'bun:test';
import { createWorkflowRuntime, type WorkflowOverrides, type WorkflowStep } from './workflow-runtime';
import { workflowControls } from './workflow-scenarios';
import type { Row } from './storage';

const answer = (choice: string, labels: string[]) => ({ type: 'choice' as const, choice, confidence: 1,
  probabilities: Object.fromEntries(labels.map(label => [label, Number(choice === label)])) });
const decisions: Row[] = [], analyses: Row[] = [], replies: Row[] = [];
let failNext = false;
const decide = async (request: Row) => {
  if (failNext) { failNext = false; throw new Error('Synthetic invalid model response'); }
  decisions.push(request);
  if (request['feature'] === 'knowledge_impact') {
    const content = String(((request['state'] as Row)['knowledge'] as Row)['content']);
    return { data: { value: { contribution: { choice: content.includes('Invoices') ? 'none' : 'solution' } }, modelVersion: 'acme/decision' }, llmCallId: 'acme-impact' };
  }
  const labels = {
    request: ['information', 'intervention', 'multiple', 'none', 'unknown'],
    priority_evidence: ['supported', 'unknown', 'contradictory'], urgency_evidence: ['supported', 'unknown', 'contradictory'],
    alternative: ['available', 'unavailable', 'unknown'], change: ['new_request', 'follow_up', 'new_evidence', 'confirmation', 'duplicate', 'unknown'],
    next_action: ['request_information', 'respond', 'escalate', 'wait', 'resolve', 'none', 'unknown'],
  };
  return { data: { value: Object.fromEntries(Object.entries(labels).map(([field, values]) => [field, answer(field === 'next_action' ? 'request_information' : 'unknown', values)])), modelVersion: 'acme/decision' }, llmCallId: 'acme-decision' };
};
const analyze = async (request: Row) => {
  analyses.push(request);
  const sources = JSON.parse(String((request['vars'] as Row)['sources'])) as Row[];
  const source = sources.find(row => row['authority'] === 'approved_knowledge');
  return { data: { observations: source ? [{ dimension: 'solution', statement: 'Use the supplied procedure.', status: 'supported',
    ...(request['promptId'] === 'knowledge-impact' ? { evidenceIds: [source['id']] } : { citations: [{ sourceId: source['id'], quote: source['text'] }] }) }] : [], missing: [], waitingOn: null, resumeWhen: null },
    model: 'acme/evidence', promptVersion: '1.0.0', llmCallId: 'acme-analysis' };
};
const overrides: WorkflowOverrides = {
  work: { decide: decide as unknown as NonNullable<WorkflowOverrides['work']>['decide'], analyze: analyze as unknown as NonNullable<WorkflowOverrides['work']>['analyze'],
    decisionProvider: () => ({ model: 'acme/decision' }) as ReturnType<NonNullable<NonNullable<WorkflowOverrides['work']>['decisionProvider']>> },
  knowledge: {
    candidate: async () => ({ value: { candidate: answer('yes', ['yes','no']) }, model: 'acme/decision', callId: 'acme-candidate' }),
    extract: async state => ({ value: { proposals: [{ kind: 'business_fact', title: 'Reported account issue', content: state.source, evidence: [state.source] }] }, model: 'acme/draft', callId: 'acme-draft' }),
    validate: async () => ({ value: [{ novelty: answer('new', ['new','redundant','unknown']), support: answer('supported', ['supported','unsupported','uncertain']), policy: answer('unknown', ['consistent','conflict','unknown']) }], model: 'acme/validation', callId: 'acme-validation' }),
  },
  reply: { run: (async (request: Row) => {
    replies.push(request);
    const references = String((request['vars'] as Row)['kb_articles']);
    const article = /### \[([^\]]+)\]/.exec(references)?.[1];
    return { data: { suggestion: article ? 'Please follow the approved account recovery procedure.' : 'Please provide the account error.',
      confidence: 0.8, detected_language: 'en', referenced_kb_articles: article ? [article] : [] }, model: 'acme/reply', promptVersion: '1.0.0', llmCallId: `acme-reply-${replies.length}` };
  }) as unknown as NonNullable<WorkflowOverrides['reply']>['run'] },
};

test('production workflows run independent scenarios, preserve human work, and record guard and replay evidence offline', async () => {
  const originalFetch = globalThis.fetch;
  const denied = mock(async () => { throw new Error('No network permitted'); });
  globalThis.fetch = Object.assign(denied, originalFetch) as typeof fetch;
  const trace: WorkflowStep[] = [];
  try {
    const execute = await createWorkflowRuntime(step => trace.push(step), overrides);
    for (const mode of ['incoming', 'enrichment', 'reply'] as const) {
      for (const scenario of workflowControls(mode)) {
        const beforeDecisions = decisions.length, beforeAnalyses = analyses.length;
        const result = await execute(mode, scenario);
        expect({ mode, scenario: scenario.scenario, completed: result.completed, failure: result.output.failure }).toMatchObject({ mode, scenario: scenario.scenario, completed: true });
        expect(Object.entries(result.safety).filter(([, value]) => !value)).toEqual([]);
        if (mode === 'incoming') {
          expect(decisions).toHaveLength(beforeDecisions + 1);
          expect(analyses).toHaveLength(beforeAnalyses + 1);
          expect(analyses.at(-1)).toMatchObject({ promptId: 'incoming-analysis', modelRole: 'evidence_analysis' });
          const state = decisions.at(-1)!['state'] as Row;
          expect(state).toHaveProperty('previousCase');
          expect(result.output.history).toHaveLength(1);
          expect(result.output.tables['operational_learning']![0]).toMatchObject({ status: 'pending_review' });
        }
        if (mode === 'enrichment') {
          if (scenario.human) expect(result.prediction['application']).toBe('pending_human_review');
          if (scenario.expectedBlocked) expect(result.output.blocked).toBe(scenario.expectedBlocked);
          if (scenario.scenario === 'pending_not_approved' || scenario.knowledge?.[0]?.status === 'superseded') {
            expect(decisions).toHaveLength(beforeDecisions); expect(analyses).toHaveLength(beforeAnalyses);
          }
          if (scenario.knowledge?.[0]?.content.includes('Invoices')) expect(result.prediction['application']).toBe('evaluated_without_contribution');
        }
        if (scenario.refresh) {
          const histories = result.output.history;
          expect(histories).toHaveLength(2);
          expect(((histories.at(-1)!['result'] as Row)['sources'] as Row[])[0]!['version']).toBe('acme-refreshed-version');
          expect(replies.at(-1)).toHaveProperty('vars.kb_articles');
          expect(String((replies.at(-1)!['vars'] as Row)['kb_articles'])).toContain('one-time code');
        }
      }
    }
    failNext = true;
    const invalid = await execute('incoming', workflowControls('incoming')[0]!);
    expect(invalid.completed).toBe(false);
    expect(invalid.output.history).toHaveLength(0);
    expect(invalid.steps.some(step => step.step === 'idempotency' && step.status === 'completed')).toBe(false);
    expect((await execute('incoming', workflowControls('incoming')[1]!)).completed).toBe(true);
    expect(trace.some(step => step.status === 'blocked')).toBe(true);
    expect(denied).not.toHaveBeenCalled();
  } finally { globalThis.fetch = originalFetch; }
});
