import { z } from 'zod';
import {
  askJudgments, classifyEmailWithMeta, JudgmentRequestSchema,
  type AgentContract, type AgentTool, type LlmCallLogger, type OperationResult,
} from '@kairo/intelligence';
import { buildEmailClassifierInput, resolveClassifierContext, resolveTenantSettings } from './classifier-input.js';
import { proposeEmailKnowledge } from './email-knowledge.js';
import { extractMailFacts } from './email/mail-facts.js';
import { recordLlmCall } from './llm-logging.js';
import { listApprovedLearnings } from './operational-learning.js';
import { suggestReply } from './reply-suggestion.js';
import { supabase } from './supabase.js';
import { retrieveTicketContext, ticketQueryText } from './ticket-context.js';
import { approvedWorkflowKnowledge, knowledgeReferences } from './workflow-knowledge.js';

/** Who an agent run acts for. Tools read and write only inside this scope. */
export interface AgentToolScope {
  /** The calling block's feature, used to log the calls its tools make. */
  feature: string;
  accountId: string;
  ticketId?: string;
  userId?: string;
  stage?: 'backfill' | 'new_email';
  signal?: AbortSignal;
}

export interface AgentToolDeps {
  db?: typeof supabase;
  logger?: LlmCallLogger;
  resolveContext?: typeof resolveClassifierContext;
  retrieveContext?: typeof retrieveTicketContext;
  classify?: typeof classifyEmailWithMeta;
  suggest?: typeof suggestReply;
  propose?: typeof proposeEmailKnowledge;
  judge?: typeof askJudgments;
  tenantSettings?: typeof resolveTenantSettings;
  approvedKnowledge?: typeof approvedWorkflowKnowledge;
  approvedLearnings?: typeof listApprovedLearnings;
}

const noArguments = z.object({}).strict();
const read = (data: Record<string, unknown>, missing: string[] = []): OperationResult =>
  ({ status: 'completed', authorization: 'read', data, missing, needsReview: missing.length > 0 });
const failed = (missing: string[]): OperationResult =>
  ({ status: 'failed', authorization: 'denied', data: {}, missing, needsReview: true });

interface ScopedTicket {
  id: string; subject: string | null; body_plain: string | null; conversation_id: string | null;
  from_email: string | null; to_email: string | null; ticket_type: string | null; priority: string | null;
  category: string | null; status: string | null; model_verdict: unknown; abstain: boolean | null;
}

/**
 * The tools every workflow block draws from. Each one resolves its data inside
 * the scope it was built for; a block receives only the tools its contract lists.
 */
export function sharedAgentTools(scope: AgentToolScope, deps: AgentToolDeps = {}): Record<string, AgentTool> {
  const db = deps.db ?? supabase;
  const logger = deps.logger ?? recordLlmCall;
  let ticketLookup: Promise<ScopedTicket | null> | undefined;
  const ticket = () => {
    if (!scope.ticketId) return Promise.resolve(null);
    ticketLookup ??= (async () => {
      const { data, error } = await db.from('tickets')
        .select('id, subject, body_plain, conversation_id, from_email, to_email, ticket_type, priority, category, status, model_verdict, abstain')
        .eq('id', scope.ticketId!).eq('account_id', scope.accountId).maybeSingle();
      if (error) throw new Error('Ticket lookup failed');
      return data as ScopedTicket | null;
    })();
    return ticketLookup;
  };
  const conversation = async (current: ScopedTicket) => {
    const { data: history, error } = current.conversation_id
      ? await db.from('messages').select('direction, body_plain, received_at')
        .eq('account_id', scope.accountId).eq('conversation_id', current.conversation_id)
        .order('received_at', { ascending: false }).limit(20)
      : { data: [], error: null };
    const truncated = (current.body_plain?.length ?? 0) > 6000 || (history?.length ?? 0) === 20
      || Boolean(history?.some((message) => (message.body_plain?.length ?? 0) > 2000));
    return {
      ticket: { ...current, body_plain: current.body_plain?.slice(0, 6000) ?? null },
      messages: (history ?? []).reverse().map((message) => ({ ...message, body_plain: message.body_plain?.slice(0, 2000) ?? null })),
      missing: [...(current.body_plain ? [] : ['message_body']), ...(error ? ['message_history'] : []), ...(truncated ? ['truncated_context'] : [])],
    };
  };
  const context = async (current: ScopedTicket) => (deps.retrieveContext ?? retrieveTicketContext)({
    ticketId: current.id, accountId: scope.accountId, queryText: ticketQueryText(current.subject, current.body_plain),
  });

  const tools: AgentTool[] = [
    {
      name: 'inspect_ticket', description: 'Read the selected ticket, its classification, and relevant published knowledge.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const [thread, knowledge] = await Promise.all([conversation(current), context(current)]);
        const missing = [...knowledge.degraded, ...thread.missing];
        return { status: 'completed', authorization: 'read',
          data: { ticket: thread.ticket, messages: thread.messages, knowledge: knowledge.kbArticles, resolvedCases: knowledge.resolvedCases },
          missing, needsReview: missing.length > 0 || Boolean(current.abstain) };
      },
    },
    {
      name: 'read_conversation', description: 'Read the ticket and the messages of its conversation, oldest first.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const thread = await conversation(current);
        return read({ ticket: thread.ticket, messages: thread.messages }, thread.missing);
      },
    },
    {
      name: 'read_case_decisions', description: 'Read the decisions already recorded for this ticket, newest first.',
      inputSchema: noArguments,
      execute: async () => {
        if (!scope.ticketId) return failed(['ticket']);
        const { data, error } = await db.from('ticket_decision_history')
          .select('contract, status, result, created_at').eq('account_id', scope.accountId).eq('ticket_id', scope.ticketId)
          .order('created_at', { ascending: false }).limit(10);
        if (error) return failed(['decision_history']);
        return read({ decisions: (data ?? []).map((row) => ({ contract: row.contract, status: row.status, createdAt: row.created_at,
          result: JSON.stringify(row.result).slice(0, 2000) })) });
      },
    },
    {
      name: 'search_similar_cases', description: 'Find resolved cases of this account that resemble the ticket, with how they were resolved.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const found = await context(current);
        return read({ resolvedCases: found.resolvedCases }, found.degraded);
      },
    },
    {
      name: 'read_account_memory', description: 'Read what the account has established: business context, approved knowledge relevant to the case, and approved operational learnings.',
      inputSchema: z.object({ query: z.string().min(1).max(2000).optional() }).strict(),
      execute: async (input) => {
        const { query } = input as { query?: string };
        const current = await ticket();
        const text = query ?? (current ? ticketQueryText(current.subject, current.body_plain) : '');
        const missing: string[] = [];
        const settings = await (deps.tenantSettings ?? resolveTenantSettings)(scope.accountId, db);
        if (!settings.businessContext) missing.push('business_context');
        const knowledge = text
          ? await (deps.approvedKnowledge ?? approvedWorkflowKnowledge)(scope.accountId, text, scope.ticketId, db)
            .then((versions) => knowledgeReferences(versions).map((reference) => ({ ...reference, content: reference.content.slice(0, 2000) })))
            .catch(() => { missing.push('approved_knowledge'); return []; })
          : [];
        const learnings = await (deps.approvedLearnings ?? listApprovedLearnings)(scope.accountId);
        return read({ businessContext: settings.businessContext ?? null, language: settings.language, approvedKnowledge: knowledge,
          learnings: learnings.map((learning) => ({ type: learning.learningType, summary: learning.summary, sources: learning.evidence.sourceCount })) }, missing);
      },
    },
    {
      name: 'list_account_tickets', description: 'List the account\'s tickets, newest first: subject, opening text, classification and status. Optionally only those of one pipeline tier.',
      inputSchema: z.object({ tier: z.number().int().min(1).max(3).optional(), limit: z.number().int().min(1).max(200).optional() }).strict(),
      execute: async (input) => {
        const { tier, limit } = input as { tier?: number; limit?: number };
        let query = db.from('tickets').select('id, subject, body_plain, ticket_type, priority, category, status, classification_tier, created_at')
          .eq('account_id', scope.accountId);
        if (tier !== undefined) query = query.eq('classification_tier', tier);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(limit ?? 50);
        if (error) return failed(['tickets']);
        return read({ tickets: (data ?? []).map((row) => ({ id: row.id, subject: row.subject, opening: row.body_plain?.slice(0, 400) ?? null,
          type: row.ticket_type, priority: row.priority, category: row.category, status: row.status, tier: row.classification_tier })) });
      },
    },
    {
      name: 'group_similar_tickets', description: 'Group the given tickets by the similarity of their stored embeddings. Returns groups of two or more tickets and the ones left alone.',
      inputSchema: z.object({ ticketIds: z.array(z.string().min(1)).min(2).max(200), minSimilarity: z.number().min(0.5).max(0.99).optional() }).strict(),
      execute: async (input) => {
        const { ticketIds, minSimilarity } = input as { ticketIds: string[]; minSimilarity?: number };
        const { data, error } = await db.from('tickets').select('id, embedding').eq('account_id', scope.accountId).in('id', ticketIds);
        if (error) return failed(['ticket_embeddings']);
        const vectors = new Map<string, number[]>();
        for (const row of data ?? []) {
          const vector = typeof row.embedding === 'string' ? JSON.parse(row.embedding) as number[] : row.embedding as number[] | null;
          if (Array.isArray(vector) && vector.length) vectors.set(row.id as string, vector);
        }
        const groups = groupBySimilarity(vectors, minSimilarity ?? 0.8);
        const withoutEmbedding = ticketIds.filter((id) => !vectors.has(id));
        return read({ groups: groups.filter((group) => group.length > 1),
          alone: groups.filter((group) => group.length === 1).flat(), withoutEmbedding },
        withoutEmbedding.length ? ['ticket_embeddings'] : []);
      },
    },
    {
      name: 'decide_classification', description: 'Request a classification proposal using the same decision service as email processing.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const settings = await (deps.resolveContext ?? resolveClassifierContext)('backfill', scope.accountId);
        const facts = extractMailFacts({ from: current.from_email ?? '', subject: current.subject ?? '',
          headers: { To: current.to_email ?? '' }, tenantMailbox: settings.tenantMailboxes });
        const started = Date.now();
        const result = await (deps.classify ?? classifyEmailWithMeta)(buildEmailClassifierInput({
          subject: current.subject ?? '', from: current.from_email ?? '', bodyPlain: current.body_plain,
          stage: 'manual', facts, context: settings, bodySource: 'stored', missing: ['original_headers'],
        }), { lang: settings.language, context: { accountId: scope.accountId, ticketId: current.id }, abortSignal: scope.signal });
        try {
          await logger({ feature: 'email_classification', model: result.meta.model,
            promptVersion: result.promptVersion, promptText: result.prompt, responseText: result.meta.rawText,
            ...result.meta.usage, confidenceScore: result.result.confidence, latencyMs: Date.now() - started,
            errorCode: null, errorDetail: null, accountId: scope.accountId, ticketId: current.id, ...(scope.userId ? { userId: scope.userId } : {}) });
        } catch { console.warn('[agent-tools] Classification logging unavailable'); }
        return { status: 'proposed', authorization: 'human_review', data: { classification: result.result, verdict: result.verdict },
          missing: ['original_headers'], needsReview: true };
      },
    },
    {
      name: 'ask_judgments', description: 'Ask the decision model up to eight typed judgments about supplied state: choice between options, score along ordered levels, or noul for a yes/no condition. Answers carry probabilities.',
      inputSchema: JudgmentRequestSchema,
      execute: async (input) => {
        const result = await (deps.judge ?? askJudgments)(JudgmentRequestSchema.parse(input), {
          feature: `${scope.feature}_judgments`, logger,
          context: { accountId: scope.accountId, ...(scope.ticketId ? { ticketId: scope.ticketId } : {}), ...(scope.userId ? { userId: scope.userId } : {}) },
        });
        return read({ answers: result.answers, model: result.model });
      },
    },
    {
      name: 'draft_reply', description: 'Generate and store a pending reply proposal for human review. Does not send email.',
      inputSchema: noArguments,
      execute: async () => {
        if (!scope.ticketId || !scope.userId) return failed(['ticket']);
        const proposal = await (deps.suggest ?? suggestReply)({ ticketId: scope.ticketId, accountId: scope.accountId, userId: scope.userId,
          ...(scope.signal ? { signal: scope.signal } : {}) });
        if (!proposal) return failed(['ticket']);
        return { status: 'proposed', authorization: 'human_review', data: { proposal }, missing: [], needsReview: true };
      },
    },
    {
      name: 'propose_knowledge', description: 'Propose reusable knowledge from one inbound message of this ticket. Proposals stay pending human review and are never used before approval.',
      inputSchema: z.object({ messageId: z.string().uuid() }).strict(),
      execute: async (input) => {
        if (!scope.ticketId) return failed(['ticket']);
        const { messageId } = input as { messageId: string };
        const outcome = await (deps.propose ?? proposeEmailKnowledge)({ accountId: scope.accountId, ticketId: scope.ticketId, messageId,
          ...(scope.stage ? { stage: scope.stage } : {}) }, { db, logger });
        return { status: outcome.status === 'proposed' ? 'proposed' : 'completed', authorization: 'human_review',
          data: { outcome }, missing: [], needsReview: true };
      },
    },
  ];
  return Object.fromEntries(tools.map((definition) => [definition.name, definition]));
}

const cosine = (a: number[], b: number[]) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]!; }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
};

/**
 * Each ticket joins the group whose centroid it most resembles, when that
 * similarity reaches the threshold; otherwise it starts its own group. Comparing
 * against centroids keeps one bridging ticket from chaining unrelated matters.
 */
export function groupBySimilarity(vectors: Map<string, number[]>, threshold: number): string[][] {
  const groups: { ids: string[]; centroid: number[] }[] = [];
  for (const id of [...vectors.keys()].sort()) {
    const vector = vectors.get(id)!;
    let best: (typeof groups)[number] | undefined;
    let bestScore = threshold;
    for (const group of groups) {
      const score = cosine(vector, group.centroid);
      if (score >= bestScore) { best = group; bestScore = score; }
    }
    if (!best) { groups.push({ ids: [id], centroid: [...vector] }); continue; }
    best.centroid = best.centroid.map((value, i) => (value * best!.ids.length + vector[i]!) / (best!.ids.length + 1));
    best.ids.push(id);
  }
  return groups.map((group) => group.ids);
}

/** The tools a block's contract lists, in contract order; an unknown name is a wiring defect. */
export function contractTools(contract: Pick<AgentContract<unknown>, 'feature' | 'tools'>, registry: Record<string, AgentTool>): AgentTool[] {
  return contract.tools.map((name) => {
    const definition = registry[name];
    if (!definition) throw new Error(`${contract.feature} lists unknown tool ${name}`);
    return definition;
  });
}
