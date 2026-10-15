import { mock } from 'bun:test';
import type { EvalCase } from './cases';
import type { LlmCallRecord } from '../packages/intelligence/src/harness/run-llm-feature';
import type { DecisionWorkDeps } from '../apps/api/src/lib/decision-workflow';
import type { EmailKnowledgeDeps } from '../apps/api/src/lib/email-knowledge';
import { onboardingStorage, accountId, userId } from './onboarding-storage';

type Classify = typeof import('../packages/intelligence/src/classification/classify').classifyEmailWithMeta;
export interface PipelineStep {
  case: number; step: string; status: 'completed' | 'failed' | 'skipped' | 'pending_review';
  model?: string; reason?: string; latencyMs?: number; output?: unknown;
}
export interface OnboardingOverrides {
  classify?: Classify;
  work?: DecisionWorkDeps;
  knowledge?: Pick<EmailKnowledgeDeps, 'candidate' | 'extract' | 'validate'>;
}

/** Only explicit message references join sample emails; subjects never establish a thread. */
export function sampleThreads(examples: EvalCase[]) {
  const parents = examples.map((_, i) => i);
  const root = (i: number): number => parents[i] === i ? i : root(parents[i]!);
  const known = new Map<string, number>();
  examples.forEach((example, i) => {
    const headers = example.headers ?? {};
    const refs = [headers['message-id'], headers['references'], headers['in-reply-to']].join(' ').match(/<[^>]+>/g) ?? [];
    for (const ref of refs) {
      const prior = known.get(ref);
      if (prior !== undefined) parents[root(i)] = root(prior);
      known.set(ref, i);
    }
  });
  return new Map(examples.map((example, i) => [example.id, `acme-thread-${root(i)}`]));
}

/** Service-chain evaluation in an isolated Bun process; infrastructure is deliberately offline. */
export async function createOnboardingRuntime(examples: EvalCase[], overrides: OnboardingOverrides = {},
  notify: (step: PipelineStep) => void = () => {}, stopped: () => boolean = () => false) {
  process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
  const storage = onboardingStorage(examples[0]?.lang ?? 'es');
  const steps: PipelineStep[] = [];
  const calls: LlmCallRecord[] = [];
  let currentCase = 0;
  const emit = (step: PipelineStep) => { steps.push(step); notify(step); };
  const logger = async (record: LlmCallRecord) => {
    calls.push(record);
    emit({ case: currentCase, step: record.feature, model: record.model,
      status: record.errorCode ? 'failed' : 'completed', latencyMs: record.latencyMs });
    return `acme-call-${calls.length}`;
  };
  mock.module('../apps/api/src/lib/supabase.js', () => ({ supabase: storage.db }));
  mock.module('../apps/api/src/lib/llm-logging.js', () => ({ recordLlmCall: logger }));
  const ticketContext = await import('../apps/api/src/lib/ticket-context');
  mock.module('../apps/api/src/lib/ticket-context.js', () => ({ ...ticketContext,
    findRelevantKb: async () => {
      emit({ case: currentCase, step: 'approved_article_retrieval', status: 'completed', output: { count: 0 } });
      return { articles: [], degraded: [] };
    },
  }));
  const knowledge = await import('../apps/api/src/lib/workflow-knowledge');
  mock.module('../apps/api/src/lib/workflow-knowledge.js', () => ({ ...knowledge,
    approvedWorkflowKnowledge: async () => {
      emit({ case: currentCase, step: 'approved_knowledge_retrieval', status: 'completed', output: { count: 0 } });
      return [];
    },
  }));
  const { classifyEmailWithMeta } = await import('../packages/intelligence/src/index');
  const { buildEmailClassifierInput } = await import('../apps/api/src/lib/classifier-input');
  const { extractMailFacts } = await import('../apps/api/src/lib/email/mail-facts');
  const { resolveRoute } = await import('../apps/api/src/lib/email/routing-policy');
  const { findOrCreateTicketForThread } = await import('../apps/api/src/lib/tickets-by-thread');
  const { upsertConversationByThread } = await import('../apps/api/src/lib/conversations');
  const { linkMessageToTicket } = await import('../apps/api/src/lib/ticket-messages');
  const { classificationAudit } = await import('../apps/api/src/lib/classification-audit');
  const { computePriorityScore, DEFAULT_WEIGHTS } = await import('../apps/api/src/lib/scoring');
  const { tier1ProposalStatus } = await import('../apps/api/src/functions/pipeline/tier1-proposal-status');
  const { processDecisionWork } = await import('../apps/api/src/lib/decision-workflow');
  const { enqueueOnboardingLearning } = await import('../apps/api/src/lib/onboarding-learning');
  const { proposeEmailKnowledge } = await import('../apps/api/src/lib/email-knowledge');
  const threads = sampleThreads(examples);
  const classified: { example: EvalCase; result: Awaited<ReturnType<Classify>>; ticketId: string; messageId: string }[] = [];
  const runStep = async <T>(name: string, action: () => Promise<T>) => {
    const start = performance.now();
    try {
      const output = await action();
      const model = name === 'classification' ? (output as Awaited<ReturnType<Classify>>).meta.model : undefined;
      emit({ case: currentCase, step: name, status: 'completed', model, latencyMs: performance.now() - start, output });
      return output;
    }
    catch (error) {
      emit({ case: currentCase, step: name, status: 'failed', latencyMs: performance.now() - start,
        output: error instanceof Error ? { name: error.name, message: error.message } : { failed: true } });
      throw error;
    }
  };
  const execute = async () => {
    for (const example of examples) {
      if (stopped()) break;
      currentCase = example.id;
      try {
        const mailboxes = example.mailboxes ?? (example.mailbox ? [example.mailbox] : []);
        const facts = extractMailFacts({ from: example.from ?? '', subject: example.subject,
          headers: example.headers ?? { To: example.to ?? '', Cc: example.cc ?? '' }, tenantMailbox: mailboxes });
        const route = resolveRoute(facts);
        emit({ case: currentCase, step: 'routing', status: 'completed', output: route });
        if (route.kind === 'skip') {
          await storage.db.from('messages').insert({ id: `acme-message-${example.id}`, account_id: accountId,
            body_plain: example.body, skip_reason: route.reason, processing_tier: 1 });
          emit({ case: currentCase, step: 'classification', status: 'skipped', reason: route.reason });
          continue;
        }
        const input = buildEmailClassifierInput({ stage: 'onboarding', from: example.from ?? '', subject: example.subject,
          bodyPlain: example.body, facts, context: { tenantMailbox: example.mailbox ?? '', tenantMailboxes: mailboxes } });
        const result = await runStep('classification', () => (overrides.classify ?? classifyEmailWithMeta)({ ...input, attachments: example.attachments }, { lang: example.lang }));
        const persisted = await runStep('ticket_creation', async () => {
          const conversation = await upsertConversationByThread(storage.db, { accountId, channelIntegrationId: 'acme-channel',
            externalThreadId: threads.get(example.id)!, customerExternalId: example.from ?? '' });
          const messageId = `acme-message-${example.id}`;
          const timestamp = example.headers?.['date'];
          const receivedAt = timestamp && Number.isFinite(Date.parse(timestamp)) ? new Date(timestamp).toISOString() : new Date().toISOString();
          const priorityScore = computePriorityScore({ type: result.result.type, tone: result.result.tone,
            plan: 'none', receivedAt, recentTicketCount: 0 }, DEFAULT_WEIGHTS);
          const proposalStatus = tier1ProposalStatus(result.result.type, result.abstain);
          await storage.db.from('ticket_proposals').insert({ conversation_id: conversation.conversation_id,
            proposed_type: result.result.type, status: proposalStatus, model_version: result.meta.model,
            raw_llm_output: result.result });
          emit({ case: currentCase, step: 'classification_proposal', status: 'completed', output: { priorityScore, proposalStatus } });
          const ticket = await findOrCreateTicketForThread(storage.db, { accountId, conversationId: conversation.conversation_id,
            originatingUserId: userId, classification: result.result, audit: classificationAudit(result),
            classifiedAt: new Date().toISOString(), classificationTier: 1, priorityScore,
            originMessage: { subject: example.subject, from_email: example.from ?? '', from_name: null,
              to_email: example.to ?? null, body_plain: example.body, body_html: null, snippet: null,
              gmail_message_id: messageId, gmail_thread_id: threads.get(example.id)!, received_at: receivedAt } });
          const { error } = await storage.db.from('messages').insert({ id: messageId, account_id: accountId,
            conversation_id: conversation.conversation_id, direction: 'inbound', body_plain: example.body,
            received_at: receivedAt, processing_tier: 1 });
          if (error) throw new Error('Evaluation message persistence failed');
          await linkMessageToTicket(storage.db, { ticket_id: ticket.ticket_id, message_id: messageId, is_origin: ticket.was_created });
          return { ticketId: ticket.ticket_id, messageId };
        });
        classified.push({ example, result, ...persisted });
        emit({ case: currentCase, step: 'first_delivery', status: 'completed' });
      } catch (error) {
        if (steps.at(-1)?.status !== 'failed') emit({ case: currentCase, step: 'ingestion', status: 'failed',
          output: error instanceof Error ? { name: error.name, message: error.message } : { failed: true } });
      }
    }
    const firstDelivery = structuredClone(storage.tables);
    const callsBeforeLearning = calls.length;
    currentCase = 0;
    await runStep('enqueue_sample_learning', () => enqueueOnboardingLearning(accountId, classified.map(item => ({
      ticketId: item.ticketId, messageId: item.messageId,
    })), storage.db));
    for (const item of classified) {
      if (stopped()) break;
      currentCase = item.example.id;
      const queued = storage.tables['decision_work_items']!.find(row => row['message_id'] === item.messageId && row['ticket_id'] === item.ticketId);
      if (!queued) { emit({ case: currentCase, step: 'sample_learning', status: 'failed', reason: 'source_not_queued' }); continue; }
      const work = { id: String(queued['id']), account_id: String(queued['account_id']), ticket_id: String(queued['ticket_id']),
        message_id: String(queued['message_id']), knowledge_version_id: null, contract: String(queued['contract']), dedupe_key: String(queued['dedupe_key']) };
      try {
        await runStep('sample_learning', () => processDecisionWork(work, storage.db, { ...overrides.work,
          propose: async (input, deps) => {
            const proposal = await proposeEmailKnowledge(input, { ...deps, ...overrides.knowledge });
            const proposals = ('proposals' in proposal ? proposal.proposals : undefined) ?? [];
            emit({ case: currentCase, step: 'source_grounding_result', status: proposals.length ? 'completed' : 'skipped',
              output: { blocked: proposals.filter(row => row.status === 'blocked' && row.reasons.includes('invalid_source_quote')).length } });
            emit({ case: currentCase, step: 'knowledge_proposals', status: proposal.status === 'proposed' ? 'pending_review' : 'skipped', output: proposal });
            return proposal;
          },
        }));
        if (!storage.tables['ticket_decision_history']!.some(row => row['idempotency_key'] === `workflow:${work.dedupe_key}`)) {
          emit({ case: currentCase, step: 'decision_history', status: 'failed', reason: 'missing_history' });
          continue;
        }
        emit({ case: currentCase, step: 'decision_history', status: 'completed' });
        const writeCount = storage.writes.length;
        const callCount = calls.length;
        await runStep('idempotency', async () => {
          await processDecisionWork(work, storage.db, overrides.work);
          if (storage.writes.length !== writeCount || calls.length !== callCount) throw new Error('Repeated work produced additional effects');
          return { additionalWrites: 0, additionalModelCalls: 0 };
        });
      } catch { /* Continue independent cases unless the network guard stopped the run. */ }
    }
    return { steps, calls, classified, firstDelivery, tables: storage.tables, writes: storage.writes,
      safety: {
        firstDeliveryIndependent: callsBeforeLearning === 0 && firstDelivery['kb_articles']!.length === 0 && firstDelivery['operational_learning']!.length === 0,
        proposalsUnapproved: storage.tables['kb_articles']!.every(row => row['is_published'] === false)
          && storage.tables['operational_learning']!.every(row => row['status'] === 'pending_review'),
        noTicketOverwrite: JSON.stringify(firstDelivery['tickets']) === JSON.stringify(storage.tables['tickets']),
        noKnowledgeActivated: storage.tables['current_knowledge']!.length === 0,
      } };
  };
  return { execute, steps, calls, storage };
}
