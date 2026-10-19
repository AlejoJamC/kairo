import { mock } from 'bun:test';
import type { DecisionWork, DecisionWorkDeps } from '../apps/api/src/lib/decision-workflow';
import type { EmailKnowledgeDeps } from '../apps/api/src/lib/email-knowledge';
import type { SuggestReplyDeps } from '../apps/api/src/lib/reply-suggestion';
import type { LlmCallRecord } from '../packages/intelligence/src/harness/run-llm-feature';
import { workflowStorage } from './workflow-storage';
import type { Row } from './storage';
import type { Scenario, WorkflowMode } from './workflow-scenarios';

export interface WorkflowStep { case: number; dataset: string; step: string; status: 'completed' | 'failed' | 'skipped' | 'blocked'; output?: unknown; model?: string; }
export interface WorkflowOverrides {
  work?: DecisionWorkDeps;
  knowledge?: Pick<EmailKnowledgeDeps, 'candidate' | 'extract' | 'validate'>;
  reply?: Pick<SuggestReplyDeps, 'run' | 'validate'>;
}

/** Production intelligence and source checks; storage, embedding retrieval and SQL effects are explicit fixtures. */
export async function createWorkflowRuntime(notify: (step: WorkflowStep) => void = () => {}, overrides: WorkflowOverrides = {}) {
  process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
  let active: ReturnType<typeof workflowStorage> | undefined;
  let example: Scenario;
  const current = () => { if (!active) throw new Error('Evaluation scenario missing'); return active; };
  const calls: LlmCallRecord[] = [];
  const steps: WorkflowStep[] = [];
  const emit = (step: string, status: WorkflowStep['status'], output?: unknown, model?: string) => {
    const row = { case: example.id, dataset: example.dataset, step, status, output, model };
    steps.push(row); notify(row);
  };
  const logger = async (record: LlmCallRecord) => {
    calls.push(record); emit(record.feature, record.errorCode ? 'failed' : 'completed', undefined, record.model);
    return `acme-workflow-call-${calls.length}`;
  };
  mock.module('../apps/api/src/lib/supabase.js', () => ({ supabase: {
    from: (table: string) => current().db.from(table),
    rpc: (name: string, args: Row) => current().db.rpc(name, args),
  } }));
  mock.module('../apps/api/src/lib/llm-logging.js', () => ({ recordLlmCall: logger }));
  const knowledge = await import('../apps/api/src/lib/workflow-knowledge');
  const retrieveApproved: typeof knowledge.approvedWorkflowKnowledge = async (...args) => {
    emit('approved_knowledge_retrieval', 'completed', { count: current().current().length, adapter: 'explicit fixture links; no semantic retrieval measurement' });
    return knowledgeLookup(...args);
  };
  const knowledgeLookup = knowledge.approvedWorkflowKnowledge;
  mock.module('../apps/api/src/lib/workflow-knowledge.js', () => ({ ...knowledge,
    approvedWorkflowKnowledge: async (...args: Parameters<typeof knowledgeLookup>) => knowledgeLookup(args[0], args[1], args[2], current().db, { embed: async () => [1, 0] }),
  }));
  const context = await import('../apps/api/src/lib/ticket-context');
  const retrieval = async () => ({ kbArticles: [], resolvedCases: [], degraded: [] });
  mock.module('../apps/api/src/lib/ticket-context.js', () => ({ ...context,
    findRelevantKb: async () => ({ articles: [], degraded: [] }), retrieveTicketContext: retrieval,
  }));
  const { processDecisionWork } = await import('../apps/api/src/lib/decision-workflow');
  const { proposeEmailKnowledge } = await import('../apps/api/src/lib/email-knowledge');
  const { suggestReply } = await import('../apps/api/src/lib/reply-suggestion');

  return async (mode: WorkflowMode, input: Scenario) => {
    example = input; active = workflowStorage(input); calls.length = 0; steps.length = 0;
    const db = active.db;
    const initial = structuredClone(active.tables);
    const beforeTicket = structuredClone(active.ticket);
    const prediction: Record<string, string> = {};
    let blocked: string | null = null;
    let output: unknown;
    let replaySafe = true;
    let replayPerformed = false;
    let completed = false;
    let failure: unknown;
    const work: DecisionWork = { id: 'acme-work', account_id: active.identity.accountId, ticket_id: active.identity.ticketId,
      message_id: mode === 'incoming' ? active.source.id : null,
      knowledge_version_id: String(active.tables['knowledge_versions']![input.targetKnowledge ?? 0]?.['id'] ?? ''),
      contract: input.contract, dedupe_key: `acme-work:${input.id}` };
    const runWork = () => processDecisionWork(work, db, { ...overrides.work, embed: async () => [1, 0],
      propose: async (args, deps) => {
        const proposal = await proposeEmailKnowledge(args, { ...deps, ...overrides.knowledge, logger });
        emit('knowledge_proposals', 'completed', proposal);
        return proposal;
      },
    });
    try {
      emit('case_context', 'completed', { historyMessages: active.tables['messages']!.length,
        previousDecisions: active.tables['ticket_decision_history']!.length, suppliedMemory: active.current().length });
      if (mode === 'enrichment') {
        if (input.approve) {
          const { error } = await db.rpc('review_workflow_knowledge', { p_account_id: active.identity.accountId,
            p_user_id: active.identity.userId, p_version_id: work.knowledge_version_id, p_kind: 'article',
            p_id: active.tables['knowledge_versions']![0]?.['source_id'], p_decision: 'approved' });
          if (error) { blocked = 'permission'; throw new Error('EVAL_EXPECTED_PERMISSION'); }
          work.knowledge_version_id = String(active.current()[0]?.['id'] ?? '');
          emit('approval_fixture', 'completed', { actor: 'simulated active member', approved: true });
        }
        if (!active.current().some(row => row['id'] === work.knowledge_version_id)) {
          prediction['skipped'] = 'true';
          emit('knowledge_eligibility', 'skipped', { reason: 'no_current_approved_version' });
          // Exercise the production guard even for pending and superseded revisions.
          if (work.knowledge_version_id) await runWork();
        } else {
          await processDecisionWork({ ...work, contract: 'knowledge_change', ticket_id: null, message_id: null }, db,
            { embed: async () => [1, 0] });
          emit('candidate_selection_fixture', 'completed', { explicitTicketLinks: active.tables['decision_work_items']!.length, semanticRetrievalMeasured: false });
          const queued = active.tables['decision_work_items']![0];
          if (!queued) throw new Error('EVAL_CANDIDATE_MISSING');
          Object.assign(work, queued);
          await runWork();
          const history = active.tables['ticket_decision_history']!.filter(row => row['contract'] === input.contract).at(-1);
          const result = history?.['result'] as Row | undefined;
          prediction['skipped'] = String(!history);
          prediction['useful'] = String(history?.['status'] !== 'evaluated_without_contribution' && !!history);
          prediction['contribution'] = String(result?.['contribution'] ?? 'unknown');
          prediction['application'] = String(history?.['status'] ?? 'not_applied');
          emit('enrichment_persistence', 'completed', { status: prediction['application'] });
        }
      } else if (mode === 'reply') {
        const draft = () => suggestReply(active!.identity, { supabase: db, logger, ...overrides.reply, retrieve: retrieval,
          retrieveApproved: (...args) => retrieveApproved(args[0], args[1], args[2], db, { embed: async () => [1, 0] }) });
        output = await draft();
        if (!output) throw new Error('EVAL_REPLY_MISSING');
        emit('reply_proposal', 'completed', output);
        if (input.refresh) {
          const previous = active.current()[0]!;
          active.tables['knowledge_versions']!.push({ ...structuredClone(previous), id: 'acme-refreshed-version',
            revision: Number(previous['revision']) + 1,
            snapshot: { ...(previous['snapshot'] as Row), content: 'The current account recovery procedure requires the recovery link and a one-time code.' } });
          output = await draft();
          emit('fresh_request', 'completed', output);
        }
        prediction['referencedKnowledge'] = String(!!(output as { referencedKbArticles: string[] }).referencedKbArticles.length);
        const persisted = [...active.writes].reverse().find(row => row.operation === 'save_reply_decision');
        if (!persisted) throw new Error('EVAL_REPLY_HISTORY_MISSING');
        const before = JSON.stringify(active.tables);
        const callsBefore = calls.length;
        await db.rpc('save_reply_decision', persisted.value);
        replaySafe = before === JSON.stringify(active.tables) && callsBefore === calls.length;
        replayPerformed = true;
      } else {
        await runWork();
        const history = active.tables['ticket_decision_history']!.find(row => row['idempotency_key'] === `workflow:${work.dedupe_key}`);
        if (!history) throw new Error('EVAL_DECISION_HISTORY_MISSING');
        const result = history['result'] as Row;
        Object.assign(prediction, result['judgments']);
        prediction['nextAction'] = String(result['nextAction']);
        emit('incoming_decision', 'completed', result);
      }
      if (mode !== 'reply') {
        const before = JSON.stringify(active.tables);
        const callsBefore = calls.length;
        await runWork();
        replaySafe = before === JSON.stringify(active.tables) && callsBefore === calls.length;
        replayPerformed = true;
      }
      completed = true;
    } catch (error) {
      failure = error instanceof Error ? { name: error.name, message: error.message } : { failed: true };
      if (input.expectedBlocked && !blocked) blocked = active.rejection;
      completed = !!input.expectedBlocked && blocked === input.expectedBlocked;
      emit('execution', completed ? 'blocked' : 'failed', failure);
    }
    const histories = active.tables['ticket_decision_history']!.filter(row => !initial['ticket_decision_history']!.some(before => before['idempotency_key'] === row['idempotency_key']));
    const results = histories.map(row => row['result'] as Row);
    const knownApprovedIds = new Set(active.tables['knowledge_versions']!.filter(row => row['status'] === 'approved').map(row => row['id']));
    const immutableBefore = (row: Row) => Object.fromEntries(Object.entries(row).filter(([key]) => !['knowledge_context', 'first_viewed_at', 'human_modified_at', 'case_revision'].includes(key)));
    const safety: Record<string, boolean> = {
      approvedSourcesOnly: results.every(result => !Array.isArray(result['sources']) || (result['sources'] as Row[]).every(ref => knownApprovedIds.has(ref['version']))),
      humanWorkPreserved: JSON.stringify(immutableBefore(beforeTicket)) === JSON.stringify(immutableBefore(active.ticket)) &&
        (!input.human || Object.keys(active.ticket['knowledge_context'] as Row).length === 0),
      inferredKnowledgeUnapproved: active.tables['operational_learning']!.every(row => row['status'] === 'pending_review') &&
        active.tables['kb_articles']!.filter(row => !initial['kb_articles']!.some(before => before['id'] === row['id'])).every(row => row['is_published'] !== true),
      noExternalEffects: active.ticket['status'] === beforeTicket['status'] && !active.writes.some(row => row.operation === 'apply_ticket_transition'),
      ...(replayPerformed ? { replayNoAdditionalEffectsOrInference: replaySafe } : {}),
      expectedGuardObserved: !input.expectedBlocked || blocked === input.expectedBlocked,
      rejectedSaveHasNoProposal: !blocked || histories.length === 0 && active.tables['ticket_proposals']!.length === 0,
      decisionHistoryPreserved: initial['ticket_decision_history']!.every(before => active!.tables['ticket_decision_history']!.some(after => JSON.stringify(before) === JSON.stringify(after))),
    };
    emit('idempotency', !replayPerformed ? 'skipped' : replaySafe ? 'completed' : 'failed');
    return { completed, prediction, abstain: mode === 'enrichment' && prediction['skipped'] === 'false'
      ? prediction['contribution'] === 'unknown' : null, output: { result: output, blocked,
      history: histories, tables: active.tables, initial, writes: active.writes, failure }, calls: [...calls], steps: [...steps], safety };
  };
}
