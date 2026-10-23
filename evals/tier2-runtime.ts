import { semanticStorage } from './semantic-storage';
import { mock } from 'bun:test';
import type { EvalCase } from './cases';
import type { Row } from './storage';
import type { LlmCallRecord } from '../packages/intelligence/src/harness/run-llm-feature';
import type { DecisionWork } from '../apps/api/src/lib/decision-workflow';
import type { PipelineStep, OnboardingOverrides } from './onboarding-runtime';
import { sampleThreads } from './onboarding-runtime';
import { onboardingStorage, accountId, userId } from './onboarding-storage';
import { processedOnboardingPositions, type HistoricalBaseline, type selectHistoricalWindow } from './tier2-scenario';

type Selection = ReturnType<typeof selectHistoricalWindow>;
type Classification = Awaited<ReturnType<NonNullable<OnboardingOverrides['classify']>>>;
type Handler = (input: { event: { data: { userId: string; processedMessageIds: string[] } };
  step: { run: <T>(name: string, fn: () => Promise<T>) => Promise<T>; sendEvent: (name: string, value: unknown) => Promise<void> } }) => Promise<unknown>;
let originalClassifier: NonNullable<OnboardingOverrides['classify']> | undefined;
let originalShadow: typeof import('../apps/api/src/lib/jev-shadow-classification').classifyJevShadow | undefined;
let originalPreFilter: typeof import('../apps/api/src/lib/email/pre-filter').preFilterEmail | undefined;

/** Production job and learning services; transport, persistence and SQL enqueue behavior are fixtures. */
export async function createTier2Runtime(selection: Selection, baseline: HistoricalBaseline,
  overrides: OnboardingOverrides = {}, notify: (step: PipelineStep) => void = () => {}, stopped: () => boolean = () => false) {
  process.env['SUPABASE_URL'] ??= 'http://127.0.0.1:54321';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-eval-storage';
  const queued: Row[] = [];
  const storage = onboardingStorage(selection.cases[0]?.lang ?? baseline.classified[0]?.example.lang ?? 'es', {
    afterInsert(table, link, tables) {
      if (table !== 'ticket_messages') return;
      const ticket = tables['tickets']!.find(row => row['id'] === link['ticket_id']);
      const message = tables['messages']!.find(row => row['id'] === link['message_id'] && row['account_id'] === ticket?.['account_id']);
      if (!ticket || !message) throw new Error('Evaluation source linkage invalid');
      ticket['case_revision'] = Number(ticket['case_revision'] ?? 1) + 1;
      if (message['direction'] === 'inbound' && message['processing_tier'] === 2) queued.push({
        account_id: accountId, ticket_id: ticket['id'], message_id: message['id'], contract: 'historical_learning',
        dedupe_key: `message:${String(message['id'])}`, status: 'pending',
      });
    },
  });
  for (const [table, rows] of Object.entries(baseline.tables)) {
    if (table in storage.tables) storage.tables[table] = structuredClone(rows);
  }
  storage.tables['channel_integrations'] = [{ id: 'acme-channel', account_id: accountId, provider: 'gmail' }];
  const initial = structuredClone(storage.tables);
  const steps: PipelineStep[] = [];
  const calls: LlmCallRecord[] = [];
  const classified: { example: EvalCase; result: Classification }[] = [];
  const events: { name: string; value: unknown }[] = [];
  const shadowWork: Promise<unknown>[] = [];
  let learningCase = 0;
  const emit = (step: PipelineStep) => { steps.push(step); notify(step); };
  const runStep = async <T>(position: number, step: string, fn: () => Promise<T>) => {
    const start = performance.now();
    try {
      const output = await fn();
      emit({ case: position, step, status: 'completed', latencyMs: performance.now() - start, output });
      return output;
    } catch (error) {
      emit({ case: position, step, status: 'failed', latencyMs: performance.now() - start,
        output: error instanceof Error ? { name: error.name, message: error.message } : { failed: true } });
      throw error;
    }
  };
  mock.module('../apps/api/src/lib/supabase.js', () => ({ supabase: storage.db }));
  const semantic = semanticStorage(storage);
  mock.module('../apps/api/src/lib/semantic-service.js', () => ({ createBackendSemanticService: semantic.service }));
  mock.module('../apps/api/src/lib/llm-logging.js', () => ({
    recordLlmCall: async (record: LlmCallRecord) => {
      calls.push(record);
      emit({ case: learningCase, step: record.feature, status: record.errorCode ? 'failed' : 'completed',
        model: record.model, latencyMs: record.latencyMs });
      return `acme-tier2-call-${calls.length}`;
    },
    logLlmCall: () => {},
  }));
  mock.module('../apps/api/src/lib/pipeline-logger.js', () => ({
    pipelineLog: (...values: unknown[]) => console.debug(...values),
    pipelineLogRun: (...values: unknown[]) => console.debug(...values),
  }));
  const intelligence = await import('../packages/intelligence/src/index');
  originalClassifier ??= intelligence.classifyEmailWithMeta;
  const classify = overrides.classify ?? originalClassifier;
  const assigned = new WeakMap<object, EvalCase>();
  const remaining = [...selection.cases];
  mock.module('@kairo/intelligence', () => ({ ...intelligence,
    classifyEmailWithMeta: async (...args: Parameters<typeof classify>) => {
      if (stopped()) throw new Error('Evaluation stopped');
      const [input] = args;
      let example = assigned.get(input);
      if (!example) {
        const index = remaining.findIndex(row => row.subject === input.subject && (row.from ?? '') === input.from);
        if (index < 0) throw new Error('Evaluation classification source unknown');
        example = remaining.splice(index, 1)[0]!;
        assigned.set(input, example);
      }
      const selected = example;
      const result = await runStep(selected.id, 'classification', () => classify(...args));
      classified.push({ example: selected, result });
      return result;
    },
  }));
  const classifierInput = await import('../apps/api/src/lib/classifier-input');
  const filter = await import('../apps/api/src/lib/email/pre-filter');
  originalPreFilter ??= filter.preFilterEmail;
  const routeCases = [...selection.cases];
  mock.module('../apps/api/src/lib/email/pre-filter.js', () => ({ ...filter,
    preFilterEmail: (...args: Parameters<typeof filter.preFilterEmail>) => {
      const index = routeCases.findIndex(row => row.subject === args[0].subject && (row.from ?? '') === args[0].from);
      if (index < 0) throw new Error('Evaluation routing source unknown');
      const example = routeCases.splice(index, 1)[0]!;
      const result = originalPreFilter!(...args);
      emit({ case: example.id, step: 'routing', status: result.status === 'skip' ? 'skipped' : 'completed', output: result });
      return result;
    },
  }));
  const settings = storage.tables['accounts']![0]!;
  const contextExample = baseline.classified[0]?.example ?? selection.window[0];
  const mailboxes = contextExample?.mailboxes ?? (contextExample?.mailbox ? [contextExample.mailbox] : []);
  mock.module('../apps/api/src/lib/classifier-input.js', () => ({ ...classifierInput,
    resolveClassifierContext: async () => ({ tenantMailbox: mailboxes[0] ?? '', tenantMailboxes: mailboxes,
      businessContext: typeof settings['business_context'] === 'string' ? settings['business_context'] : undefined,
      language: settings['language'] === 'en' ? 'en' : 'es' }),
  }));
  mock.module('../apps/api/src/lib/gmail-token.js', () => ({ getFreshGmailToken: async () => 'synthetic-eval-token', getGmailEmailByAccount: async () => mailboxes[0] ?? '' }));
  const shadow = await import('../apps/api/src/lib/jev-shadow-classification');
  originalShadow ??= shadow.classifyJevShadow;
  mock.module('../apps/api/src/lib/jev-shadow-classification.js', () => ({ ...shadow,
    runJevShadowClassification: (...args: Parameters<typeof shadow.runJevShadowClassification>) => {
      const pending = originalShadow!(...args); shadowWork.push(pending); return pending;
    },
  }));
  mock.module('../apps/api/src/lib/inngest.js', () => ({ inngest: {
    createFunction: (_options: unknown, fn: Handler) => fn,
  } }));
  const { tier2Background } = await import('../apps/api/src/functions/pipeline/tier2-background');
  if (typeof tier2Background !== 'function') throw new Error('Evaluation Tier 2 handler unavailable; use a fresh process');
  const tier2Handler = tier2Background as unknown as Handler;
  const { processDecisionWork } = await import('../apps/api/src/lib/decision-workflow');
  const { proposeEmailKnowledge } = await import('../apps/api/src/lib/email-knowledge');

  const groups = sampleThreads([...baseline.classified.map(row => row.example), ...selection.cases]);
  const existingThreads = new Map<string, Set<string>>();
  for (const item of baseline.classified) {
    const ticket = initial['tickets']!.find(row => row['id'] === item.ticketId)!;
    const group = groups.get(item.example.id)!;
    const thread = String(ticket['gmail_thread_id']);
    existingThreads.set(group, new Set([...(existingThreads.get(group) ?? []), thread]));
  }
  const messages = new Map<string, unknown>(selection.window.map(example => {
    const prior = baseline.classified.find(row => row.example.id === example.id);
    const existing = existingThreads.get(groups.get(example.id)!);
    if (existing && existing.size > 1) throw new Error('EVAL_THREAD_BASELINE_CONFLICT');
    const thread = prior ? String(initial['tickets']!.find(row => row['id'] === prior.ticketId)!['gmail_thread_id'])
      : existing?.values().next().value ?? `acme-tier2-${groups.get(example.id)}`;
    const headers = { ...example.headers, from: example.from ?? '', subject: example.subject,
      to: example.to ?? '', cc: example.cc ?? '' };
    return [`acme-message-${example.id}`, { id: `acme-message-${example.id}`, threadId: thread,
      payload: { mimeType: 'text/plain', headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
        body: { data: Buffer.from(example.body).toString('base64url') } } }] as const;
  }));

  const executeAtClock = async (learn: boolean) => {
    const transport = globalThis.fetch;
    // Only the job's mailbox reads are replayed. Every model request still passes the shared network guard.
    globalThis.fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== 'https://gmail.googleapis.com') return transport(input, init);
      if ((init?.method ?? 'GET') !== 'GET') throw new Error('Evaluation mailbox write rejected');
      if (url.pathname === '/gmail/v1/users/me/messages') return Response.json({ messages: [...messages.keys()].map(id => ({ id })) });
      const message = messages.get(url.pathname.split('/').at(-1)!);
      if (!message || url.searchParams.get('format') !== 'full') throw new Error('Evaluation mailbox request rejected');
      return Response.json(message);
    }, transport) as typeof fetch;
    try {
      for (const item of selection.exclusions) emit({ case: item.case, step: 'window_selection', status: 'skipped', reason: item.reason });
      await tier2Handler({ event: { data: { userId, processedMessageIds: processedOnboardingPositions(baseline).map(id => `acme-message-${id}`) } },
        step: { run: (name, fn) => runStep(0, name, fn), sendEvent: async (name, value) => { events.push({ name, value }); } } });
      await Promise.allSettled(shadowWork);
    } finally { globalThis.fetch = transport; }
    // The database trigger is represented explicitly, not claimed as a verified SQL execution.
    for (const row of queued) await storage.db.from('decision_work_items').upsert(row, { onConflict: 'account_id,dedupe_key', ignoreDuplicates: true });
    const ingested = structuredClone(storage.tables);
    for (const item of classified) {
      const message = storage.tables['messages']!.find(row => row['external_id'] === `acme-message-${item.example.id}`);
      const link = storage.tables['ticket_messages']!.find(row => row['message_id'] === message?.['id']);
      const work = queued.find(row => row['message_id'] === message?.['id']);
      emit({ case: item.example.id, step: 'ticket_persistence', status: message && link && work ? 'completed' : 'failed',
        ...(message && link && work ? { output: { ticketId: link['ticket_id'], messageId: message['id'] } } : { reason: 'source_not_linked_or_queued' }) });
    }
    const learning: { case: number; ticketId: string; messageId: string; status: 'completed' | 'failed' }[] = [];
    for (const row of learn ? queued : []) {
      if (stopped()) break;
      const message = storage.tables['messages']!.find(message => message['id'] === row['message_id'])!;
      learningCase = Number(String(message['external_id']).replace('acme-message-', ''));
      const stored = storage.tables['decision_work_items']!.find(item => item['dedupe_key'] === row['dedupe_key'])!;
      const work: DecisionWork = { id: String(stored['id']), account_id: accountId, ticket_id: String(row['ticket_id']),
        message_id: String(row['message_id']), knowledge_version_id: null, contract: 'historical_learning', dedupe_key: String(row['dedupe_key']) };
      const item = { case: learningCase, ticketId: work.ticket_id!, messageId: work.message_id!, status: 'failed' as 'completed' | 'failed' };
      learning.push(item);
      try {
        await runStep(learningCase, 'historical_learning', () => processDecisionWork(work, storage.db, { ...overrides.work,
          propose: async (input, deps) => {
            const result = await proposeEmailKnowledge(input, { ...deps, ...overrides.knowledge });
            emit({ case: learningCase, step: 'knowledge_proposals', status: result.status === 'proposed' ? 'pending_review' : 'skipped', output: result });
            return result;
          },
        }));
        const history = storage.tables['ticket_decision_history']!.find(row => row['idempotency_key'] === `workflow:${work.dedupe_key}`);
        if (!history) throw new Error('Evaluation decision history missing');
        emit({ case: learningCase, step: 'decision_history', status: 'completed', output: history });
        const before = JSON.stringify(storage.tables);
        const writes = storage.writes.length;
        const callCount = calls.length;
        await runStep(learningCase, 'idempotency', async () => {
          await processDecisionWork(work, storage.db, overrides.work);
          if (JSON.stringify(storage.tables) !== before || storage.writes.length !== writes || calls.length !== callCount) throw new Error('Repeated historical work changed state');
        });
        item.status = 'completed';
      } catch { if (steps.at(-1)?.status !== 'failed') emit({ case: learningCase, step: 'historical_learning', status: 'failed', reason: 'history_or_replay_failed' }); }
    }
    const unchanged = (before: Row, after: Row) => ['ticket_type', 'priority', 'category', 'sentiment', 'emotion', 'assigned_to', 'ai_reasoning', 'model_verdict', 'first_viewed_at', 'human_assigned_at', 'human_modified_at']
      .every(key => JSON.stringify(before[key]) === JSON.stringify(after[key]));
    const baselineProposals = new Set(initial['ticket_proposals']!.map(row => row['id']));
    return { steps, calls, classified, learning, initial, ingested, tables: storage.tables, events, writes: storage.writes,
      safety: {
        initialMessagesNotReclassified: classified.every(item => !processedOnboardingPositions(baseline).includes(item.example.id)),
        existingTicketDecisionsPreserved: initial['tickets']!.every(before => {
          const after = storage.tables['tickets']!.find(row => row['id'] === before['id']); return !!after && unchanged(before, after);
        }),
        learningDoesNotOverwriteTickets: JSON.stringify(ingested['tickets']) === JSON.stringify(storage.tables['tickets']),
        noKnowledgeActivated: JSON.stringify(initial['current_knowledge']) === JSON.stringify(storage.tables['current_knowledge']),
        proposalsUnapproved: storage.tables['kb_articles']!.every(row => row['is_published'] !== true)
          && storage.tables['operational_learning']!.every(row => row['status'] === 'pending_review'),
        unearnedAutonomyNotGranted: storage.tables['ticket_proposals']!.filter(row => !baselineProposals.has(row['id']))
          .every(row => row['status'] !== 'auto_approved' || !!settings['business_context'] && storage.tables['ticket_type_auto_approval']!.some(right => right['ticket_type'] === row['proposed_type'] && right['auto_approval_enabled'] === true)),
      } };
  };
  const execute = async (options: { learning?: boolean } = {}) => {
    const realDate = globalThis.Date;
    const timestamp = realDate.parse(selection.anchor);
    // Keep SLA, scoring and the job's time window on the same virtual inbox clock.
    globalThis.Date = new Proxy(realDate, {
      construct(target, args) { return Reflect.construct(target, args.length ? args : [timestamp]); },
      apply() { return new realDate(timestamp).toString(); },
      get(target, property, receiver) { return property === 'now' ? () => timestamp : Reflect.get(target, property, receiver); },
    });
    try { return await executeAtClock(options.learning !== false); }
    finally { globalThis.Date = realDate; }
  };
  return { execute };
}
