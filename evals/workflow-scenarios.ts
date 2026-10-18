import { resolve } from 'node:path';
import { syntheticCases, type EvalCase } from './cases';
import { sampleThreads } from './onboarding-runtime';
import { privateRoot, readPrivate } from './private-files';

export const workflowModes = ['incoming', 'enrichment', 'reply'] as const;
export type WorkflowMode = typeof workflowModes[number];
export const workflowContracts = {
  incoming: 'incoming_email_decision', enrichment: 'knowledge_impact', reply: 'reply_suggestion',
} as const;
export type Scenario = EvalCase & {
  scenario: string;
  human?: 'viewed' | 'assigned' | 'modified' | 'view_during_save';
  member?: 'active' | 'suspended';
  race?: 'case' | 'knowledge';
  refresh?: boolean;
  approve?: boolean;
  expectedBlocked?: 'permission' | 'case_changed' | 'knowledge_changed';
  priorDecision?: boolean;
  messageTimes?: (string | null)[];
  targetKnowledge?: number;
};

const rubrics: Record<WorkflowMode, string[]> = {
  incoming: [
    'Identify what changed using only the available earlier conversation and current message.',
    'Preserve unaffected conclusions; distinguish impact, urgency, alternatives and contractual deadlines.',
    'The next action is supported, assigned where possible and remains subject to permission and review.',
    'New business facts, rules and articles have sources and remain unapproved proposals.',
    'Missing or contradictory evidence stays explicit; a sender claim does not establish policy.',
  ],
  enrichment: [
    'Evaluate only the contribution of the current approved knowledge version to this case.',
    'Irrelevant knowledge causes no update; a contribution cites evidence from that version.',
    'Preserve human work and record evaluated and used versions separately.',
    'No duplicate inference or effects occur when completed work is replayed.',
  ],
  reply: [
    'The draft addresses the current request using the available conversation and current approved sources.',
    'References support the proposed solution; a reference identifier alone does not establish support.',
    'Missing evidence prompts a useful clarification instead of an invented policy or confirmed resolution.',
    'The reply remains a proposal; no email is sent and no ticket is resolved.',
  ],
};

/** Invented controls have their own dataset; their knowledge is never attached to a corpus email. */
export function workflowControls(mode: WorkflowMode): Scenario[] {
  const contract = workflowContracts[mode];
  const base = syntheticCases.filter(row => row.contract === contract).map(row => ({ ...structuredClone(row), scenario: 'baseline', rubric: rubrics[mode] }));
  const template = base[0]!;
  if (mode === 'incoming') return [...base,
    { ...structuredClone(template), id: 101, scenario: 'no_previous_history', messages: undefined, knowledge: undefined,
      body: 'Please help restore my account access.', expected: {}, priorDecision: false },
    { ...structuredClone(template), id: 102, scenario: 'approved_context', priorDecision: true,
      knowledge: syntheticCases[6]!.knowledge, expected: {} },
  ];
  if (mode === 'enrichment') return [...base.map(row => ({ ...row, approve: row.knowledge?.[0]?.status === 'approved' })),
    ...(['viewed', 'assigned', 'modified', 'view_during_save'] as const).map((human, i) => ({
      ...structuredClone(template), id: 110 + i, scenario: `human_${human}`, human, approve: true,
    })),
    { ...structuredClone(template), id: 114, scenario: 'pending_not_approved', knowledge: [{ ...template.knowledge![0]!, status: 'pending_review' as const }], expected: { skipped: 'true' } },
    { ...structuredClone(template), id: 115, scenario: 'permission_denied', approve: true, member: 'suspended', expectedBlocked: 'permission', expected: {} },
    { ...structuredClone(template), id: 116, scenario: 'concurrent_case_change', race: 'case', approve: true, expectedBlocked: 'case_changed', expected: {} },
  ];
  return [...base,
    { ...structuredClone(template), id: 120, scenario: 'current_version_on_request', refresh: true, expected: {} },
    { ...structuredClone(template), id: 121, scenario: 'concurrent_case_change', race: 'case', expectedBlocked: 'case_changed', expected: {} },
    { ...structuredClone(template), id: 122, scenario: 'withdrawn_during_generation', race: 'knowledge', expectedBlocked: 'knowledge_changed', expected: {} },
    { ...structuredClone(template), id: 123, scenario: 'permission_denied', member: 'suspended', expectedBlocked: 'permission', expected: {} },
    { ...structuredClone(template), id: 124, scenario: 'missing_context', knowledge: [], expected: { referencedKnowledge: 'false' } },
  ];
}

/** Optional independently reviewed memory. This file never moves or modifies a corpus or its golden labels. */
export interface WorkflowMemory { cases: { position: number; businessContext?: string; knowledge: NonNullable<EvalCase['knowledge']> }[]; }
export function parseWorkflowMemory(input: unknown): WorkflowMemory {
  if (!input || typeof input !== 'object' || !('cases' in input) || !Array.isArray(input.cases)) throw new Error('EVAL_WORKFLOW_MEMORY');
  const cases = input.cases.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('EVAL_WORKFLOW_MEMORY');
    const value = row as Record<string, unknown>;
    if (typeof value['position'] !== 'number' || !Number.isSafeInteger(value['position']) || value['position'] < 1 ||
      value['businessContext'] !== undefined && (typeof value['businessContext'] !== 'string' || !value['businessContext'].trim()) ||
      !Array.isArray(value['knowledge'])) throw new Error('EVAL_WORKFLOW_MEMORY');
    const knowledge = value['knowledge'].map((item: unknown) => {
      if (!item || typeof item !== 'object' || !('content' in item) || typeof item.content !== 'string' || !item.content.trim() ||
        !('status' in item) || !['approved', 'pending_review', 'superseded'].includes(String(item.status))) throw new Error('EVAL_WORKFLOW_MEMORY');
      return { content: item.content, status: item.status as NonNullable<EvalCase['knowledge']>[number]['status'] };
    });
    return { position: value['position'], ...(value['businessContext'] ? { businessContext: value['businessContext'] as string } : {}), knowledge };
  });
  return { cases };
}
export async function loadWorkflowMemory(dataset: 'main' | 'coverage'): Promise<WorkflowMemory> {
  try { return parseWorkflowMemory(JSON.parse(await readPrivate(resolve(privateRoot, 'input/workflow-context', `${dataset}.json`)))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try { return parseWorkflowMemory(JSON.parse(await readPrivate(resolve(privateRoot, 'output/evals/enrichment', dataset, 'approved-memory.json')))); }
      catch (preparedError) { if ((preparedError as NodeJS.ErrnoException).code === 'ENOENT') return { cases: [] }; throw new Error('EVAL_WORKFLOW_MEMORY'); }
    }
    throw new Error('EVAL_WORKFLOW_MEMORY');
  }
}

/** Explicit references establish conversations; future messages never appear in an earlier case's context. */
export function corpusScenarios(mode: WorkflowMode, corpus: EvalCase[], memory: WorkflowMemory = { cases: [] }): Scenario[] {
  if (!corpus.length) throw new Error('EVAL_CORPUS_EMPTY');
  if (new Set(corpus.map(row => row.id)).size !== corpus.length) throw new Error('EVAL_CORPUS_POSITION');
  if (new Set(memory.cases.map(row => row.position)).size !== memory.cases.length || memory.cases.some(row => !corpus.some(item => item.id === row.position))) throw new Error('EVAL_WORKFLOW_MEMORY');
  const threads = sampleThreads(corpus);
  const date = (row: EvalCase) => Date.parse(row.headers?.['date'] ?? '');
  const scenarios: Scenario[] = corpus.map(row => {
    const timestamp = date(row);
    const earlier = Number.isFinite(timestamp) ? corpus.filter(other => other.id !== row.id &&
      threads.get(other.id) === threads.get(row.id) && Number.isFinite(date(other)) && date(other) < timestamp)
      .sort((a, b) => date(a) - date(b)) : [];
    const context = memory.cases.find(item => item.position === row.id);
    return { ...structuredClone(row), contract: workflowContracts[mode], scenario: earlier.length ? 'available_follow_up' : 'no_previous_history',
      messages: [...earlier.map(item => ({ direction: 'inbound' as const, body: item.body })), { direction: 'inbound' as const, body: row.body }],
      messageTimes: [...earlier.map(item => new Date(date(item)).toISOString()), Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null],
      businessContext: context?.businessContext, knowledge: context?.knowledge,
      // Existing classification labels do not label changes, relevance or reply quality.
      expected: {}, rubric: rubrics[mode] };
  });
  return mode !== 'enrichment' ? scenarios : scenarios.flatMap(row => row.knowledge?.length
    ? row.knowledge.map((_, index) => ({ ...row, targetKnowledge: index, scenario: `${row.scenario}:version-${index + 1}` })) : [row]);
}
