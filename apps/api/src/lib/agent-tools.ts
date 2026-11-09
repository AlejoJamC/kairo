import { createBackendSemanticService } from './semantic-service.js';
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
import { RESOLVED_STATUSES, TICKET_STATUSES } from '@kairo/types';
import { computeTicketOperationalSla, buildConfigByPriority } from '@kairo/types';
import { resolveSenderIdentity } from './client-identity.js';
import { contractualSlaFor } from './sla.js';
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
  identify?: typeof resolveSenderIdentity;
}

const noArguments = z.object({}).strict();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = TICKET_STATUSES.filter((status) => !RESOLVED_STATUSES.includes(status));
const FIND_TICKETS_CAP = 500;
const STATS_CAP = 1000;
const TIMELINE_LIMIT = 60;
const read = (data: Record<string, unknown>, missing: string[] = []): OperationResult =>
  ({ status: 'completed', authorization: 'read', data, missing, needsReview: missing.length > 0 });
const failed = (missing: string[]): OperationResult =>
  ({ status: 'failed', authorization: 'denied', data: {}, missing, needsReview: true });

interface ScopedTicket {
  id: string; ticket_number: number | null; subject: string | null; body_plain: string | null; conversation_id: string | null;
  group_id: string | null; from_email: string | null; from_name: string | null; to_email: string | null; ticket_type: string | null; priority: string | null;
  category: string | null; status: string | null; model_verdict: unknown; abstain: boolean | null;
  channel: string | null; emotion: string | null; sentiment: string | null; assigned_to: string | null; client_id: string | null;
  created_at: string | null; received_at: string | null; updated_at: string | null; resolved_at: string | null;
  first_response_at: string | null; last_response_at: string | null; sla_due_at: string | null; sla_breached: boolean | null;
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
        .select('id, ticket_number, subject, body_plain, conversation_id, from_email, from_name, to_email, ticket_type, priority, category, status, model_verdict, abstain, channel, emotion, sentiment, assigned_to, client_id, created_at, received_at, updated_at, resolved_at, first_response_at, last_response_at, sla_due_at, sla_breached, group_id')
        .eq('id', scope.ticketId!).eq('account_id', scope.accountId).maybeSingle();
      if (error) throw new Error('Ticket lookup failed');
      return data as ScopedTicket | null;
    })();
    return ticketLookup;
  };
  /** Names of account members by user id; an unknown id is simply left out. */
  const memberNames = async (ids: string[]): Promise<Map<string, string>> => {
    const unique = [...new Set(ids)].filter((id) => UUID.test(id));
    if (!unique.length) return new Map();
    const { data } = await db.from('profiles').select('id, name').in('id', unique);
    return new Map((data ?? []).map((row) => [String(row.id), String(row.name ?? '')] as const));
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

  interface TicketFilters { status?: string; priority?: string; category?: string; ticketType?: string; assignee?: 'me' | 'unassigned';
    sender?: 'this_ticket'; createdWithinDays?: number; limit?: number }
  const findTickets = async (filters: TicketFilters): Promise<OperationResult> => {
    const current = filters.sender ? await ticket() : null;
    if (filters.sender && !current?.from_email) return failed(['sender']);
    if (filters.assignee === 'me' && !scope.userId) return failed(['user']);
    let query = db.from('tickets').select('id, ticket_number, subject, status, priority, category, ticket_type, assigned_to, from_email, received_at, created_at, resolved_at')
      .eq('account_id', scope.accountId);
    if (filters.status === 'open') query = query.in('status', OPEN_STATUSES);
    else if (filters.status === 'resolved') query = query.in('status', RESOLVED_STATUSES);
    else if (filters.status) query = query.eq('status', filters.status);
    if (filters.priority) query = query.eq('priority', filters.priority);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.ticketType) query = query.eq('ticket_type', filters.ticketType);
    if (filters.assignee === 'me') query = query.eq('assigned_to', scope.userId!);
    if (filters.assignee === 'unassigned') query = query.is('assigned_to', null);
    if (current?.from_email) query = query.eq('from_email', current.from_email);
    if (filters.createdWithinDays) query = query.gte('created_at', new Date(Date.now() - filters.createdWithinDays * 86_400_000).toISOString());
    const { data, error } = await query.order('created_at', { ascending: false }).limit(FIND_TICKETS_CAP);
    if (error) return failed(['tickets']);
    const rows = data ?? [];
    const resolved = new Set<string>(RESOLVED_STATUSES);
    const byStatus: Record<string, number> = {};
    for (const row of rows) byStatus[String(row.status)] = (byStatus[String(row.status)] ?? 0) + 1;
    return read({ total: rows.length, open: rows.filter((row) => !resolved.has(String(row.status))).length, byStatus,
      tickets: rows.slice(0, filters.limit ?? 25).map((row) => ({ id: row.id, ticketNumber: row.ticket_number, subject: row.subject, status: row.status,
        priority: row.priority, category: row.category, type: row.ticket_type, assignedTo: row.assigned_to, sender: row.from_email,
        receivedAt: row.received_at, createdAt: row.created_at, resolvedAt: row.resolved_at, current: row.id === scope.ticketId })) },
      rows.length === FIND_TICKETS_CAP ? ['truncated_context'] : []);
  };

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
      name: 'find_tickets', description: 'Find and count tickets of this account, newest first. Pass ONLY the filters the question names and omit every other field; counts cover up to 500 matches.',
      inputSchema: z.object({
        status: z.enum(['open', 'resolved', ...TICKET_STATUSES]).optional(), priority: z.enum(['P1', 'P2', 'P3']).optional(),
        category: z.enum(['technical', 'billing', 'account', 'general', 'not_applicable']).optional(),
        ticketType: z.enum(['support', 'prospect', 'spam', 'internal', 'other']).optional(),
        assignee: z.enum(['me', 'unassigned']).optional(),
        createdWithinDays: z.number().int().min(1).max(365).optional(), limit: z.number().int().min(1).max(100).optional(),
      }).strict(),
      execute: (input) => findTickets(input as TicketFilters),
    },
    {
      name: 'list_sender_tickets', description: 'List every other ticket from the sender of the selected ticket in this account, newest first, with how many are open and how many are resolved. Takes no arguments.',
      inputSchema: noArguments,
      execute: () => findTickets({ sender: 'this_ticket', limit: 50 }),
    },
    {
      name: 'account_stats', description: 'Counts and rates for the whole account: tickets by status, priority and category, open tickets by assignee, unassigned and SLA-breached tickets, tickets created and resolved this week and the average first response time. Covers the latest 1000 tickets.',
      inputSchema: noArguments,
      execute: async () => {
        const { data, error } = await db.from('tickets')
          .select('status, priority, category, assigned_to, sla_breached, created_at, resolved_at, first_response_at')
          .eq('account_id', scope.accountId).order('created_at', { ascending: false }).limit(STATS_CAP);
        if (error) return failed(['tickets']);
        const rows = data ?? [];
        const resolved = new Set<string>(RESOLVED_STATUSES);
        const open = rows.filter((row) => !resolved.has(String(row.status)));
        const tally = (items: typeof rows, pick: (row: (typeof rows)[number]) => unknown) => {
          const counts: Record<string, number> = {};
          for (const row of items) { const key = String(pick(row) ?? 'none'); counts[key] = (counts[key] ?? 0) + 1; }
          return counts;
        };
        const weekAgo = Date.now() - 7 * 86_400_000;
        const within = (value: unknown) => typeof value === 'string' && new Date(value).getTime() >= weekAgo;
        const responded = rows.filter((row) => row.first_response_at && row.created_at);
        const averageHours = responded.length
          ? responded.reduce((total, row) => total + (new Date(row.first_response_at as string).getTime() - new Date(row.created_at as string).getTime()), 0) / responded.length / 3_600_000
          : null;
        const openByAssignee = tally(open, (row) => row.assigned_to);
        const names = await memberNames(Object.keys(openByAssignee).filter((id) => id !== 'none'));
        return read({ total: rows.length, open: open.length, byStatus: tally(rows, (row) => row.status), openByPriority: tally(open, (row) => row.priority),
          openByCategory: tally(open, (row) => row.category), unassignedOpen: open.filter((row) => !row.assigned_to).length,
          slaBreachedOpen: open.filter((row) => row.sla_breached).length, createdLast7Days: rows.filter((row) => within(row.created_at)).length,
          resolvedLast7Days: rows.filter((row) => within(row.resolved_at)).length,
          averageFirstResponseHours: averageHours === null ? null : Math.round(averageHours * 10) / 10,
          openByAssignee: Object.entries(openByAssignee).map(([id, count]) => ({ id: id === 'none' ? null : id, name: names.get(id) ?? null, count })) },
        rows.length === STATS_CAP ? ['truncated_context'] : []);
      },
    },
    {
      name: 'read_ticket_timeline', description: 'Read what happened on the selected ticket, newest first: state changes, classification changes, activity, internal notes and messages, with who did each and when.',
      inputSchema: noArguments,
      execute: async () => {
        if (!scope.ticketId) return failed(['ticket']);
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const { data, error } = await db.from('ticket_lifecycle_timeline').select('occurred_at, kind, actor_type, actor_ref, detail')
          .eq('account_id', scope.accountId).eq('ticket_id', scope.ticketId).order('occurred_at', { ascending: false }).limit(TIMELINE_LIMIT);
        if (error) return failed(['timeline']);
        const rows = data ?? [];
        const names = await memberNames(rows.map((row) => String(row.actor_ref)).filter((ref) => UUID.test(ref)));
        return read({ events: rows.map((row) => ({ at: row.occurred_at, kind: row.kind, actorType: row.actor_type,
          actor: names.get(String(row.actor_ref)) ?? row.actor_ref, detail: row.detail })) }, rows.length === TIMELINE_LIMIT ? ['truncated_context'] : []);
      },
    },
    {
      name: 'read_ticket_notes', description: 'Read the internal notes of the selected ticket, newest first, with their authors. Customers never see them.',
      inputSchema: noArguments,
      execute: async () => {
        if (!scope.ticketId) return failed(['ticket']);
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const { data, error } = await db.from('ticket_notes').select('author_id, body, created_at')
          .eq('account_id', scope.accountId).eq('ticket_id', scope.ticketId).order('created_at', { ascending: false }).limit(30);
        if (error) return failed(['notes']);
        const rows = data ?? [];
        const names = await memberNames(rows.map((row) => String(row.author_id)));
        return read({ notes: rows.map((row) => ({ at: row.created_at, author: names.get(String(row.author_id)) ?? null, body: String(row.body ?? '').slice(0, 1500) })) });
      },
    },
    {
      name: 'read_client_profile', description: 'Read who the sender of the selected ticket is for this account: the client they belong to (plan, SLA level, contacts), the contact record, and the contractual SLA that applies.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const found = await (deps.identify ?? resolveSenderIdentity)(db, scope.accountId, current.from_email, { contacts: true, displayName: current.from_name });
        const [clientRow, rules] = await Promise.all([
          found.client ? db.from('clients').select('name, plan_type, sla_level, telephone, authorized_emails, contact_persons').eq('account_id', scope.accountId).eq('id', found.client.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
          db.from('tenant_sla_rules').select('id, ticket_type, plan_tier, response_hours, resolution_hours').eq('account_id', scope.accountId),
        ]);
        if (clientRow.error || rules.error) return failed(['client_directory']);
        return read({ identity: found.identity, client: clientRow.data ?? null,
          contractualSla: contractualSlaFor(rules.data ?? [], current.ticket_type, found.client?.plan_type) },
        found.client ? [] : ['client']);
      },
    },
    {
      name: 'read_ticket_sla', description: 'Read the response and resolution deadlines of the selected ticket: operational SLA status from its priority, the due date and breach flag, and the contractual SLA.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const [config, rules] = await Promise.all([
          db.from('ticket_priority_sla_config').select('*').eq('account_id', scope.accountId),
          db.from('tenant_sla_rules').select('id, ticket_type, plan_tier, response_hours, resolution_hours').eq('account_id', scope.accountId),
        ]);
        if (config.error || rules.error) return failed(['sla']);
        return read({ priority: current.priority, dueAt: current.sla_due_at, breached: current.sla_breached, firstResponseAt: current.first_response_at,
          resolvedAt: current.resolved_at, operational: computeTicketOperationalSla(current as never, buildConfigByPriority(config.data ?? [])),
          contractual: contractualSlaFor(rules.data ?? [], current.ticket_type, null) });
      },
    },
    {
      name: 'read_ticket_relations', description: 'Read how the selected ticket connects to other things: its assignee, tags, followers, the group of related tickets it belongs to, its escalations and the customer satisfaction score.',
      inputSchema: noArguments,
      execute: async () => {
        const current = await ticket();
        if (!current) return failed(['ticket']);
        const [tags, followers, group, escalations, csat] = await Promise.all([
          db.from('ticket_tags').select('tag').eq('ticket_id', current.id),
          db.from('ticket_followers').select('user_id').eq('ticket_id', current.id),
          current.group_id ? db.from('tickets').select('id, ticket_number, subject, status').eq('account_id', scope.accountId).eq('group_id', current.group_id).limit(20) : Promise.resolve({ data: [], error: null }),
          db.from('escalations').select('escalated_to_level, escalated_by, reason, created_at').eq('ticket_id', current.id).order('created_at', { ascending: false }).limit(10),
          db.from('csat_events').select('score, comment, submitted_at').eq('ticket_id', current.id).order('submitted_at', { ascending: false }).limit(5),
        ]);
        if ([tags, followers, group, escalations, csat].some((result) => result.error)) return failed(['relations']);
        const people = [current.assigned_to, ...(followers.data ?? []).map((row) => row.user_id), ...(escalations.data ?? []).map((row) => row.escalated_by)].filter((id): id is string => Boolean(id));
        const names = await memberNames(people);
        return read({ assignee: current.assigned_to ? { id: current.assigned_to, name: names.get(current.assigned_to) ?? null } : null,
          tags: (tags.data ?? []).map((row) => row.tag), followers: (followers.data ?? []).map((row) => ({ id: row.user_id, name: names.get(row.user_id) ?? null })),
          groupTickets: (group.data ?? []).filter((row) => row.id !== current.id).map((row) => ({ id: row.id, ticketNumber: row.ticket_number, subject: row.subject, status: row.status })),
          escalations: (escalations.data ?? []).map((row) => ({ level: row.escalated_to_level, by: names.get(row.escalated_by) ?? null, reason: row.reason, at: row.created_at })),
          csat: csat.data ?? [] });
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
        const service = createBackendSemanticService({ db,
          scope: { accountId: scope.accountId, actor: { kind: 'workflow', id: scope.feature }, permissions: ['retrieve'] } });
        const result = await service.groupSources({ sources: ticketIds.map(id => ({ kind: 'ticket', id })), minSimilarity });
        if (result.sources.some(source => source.status === 'unavailable' && ['storage_unavailable', 'forbidden', 'invalid_input'].includes(source.reason))) {
          return failed(['ticket_embeddings']);
        }
        const groups = result.groups.map(group => group.map(source => source.id));
        const withoutEmbedding = result.sources.filter(source => source.status === 'unavailable').map(source => source.source.id);
        return read({ groups: groups.filter(group => group.length > 1), alone: groups.filter(group => group.length === 1).flat(), withoutEmbedding },
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

/** The tools a block's contract lists, in contract order; an unknown name is a wiring defect. */
export function contractTools(contract: Pick<AgentContract<unknown>, 'feature' | 'tools'>, registry: Record<string, AgentTool>): AgentTool[] {
  return contract.tools.map((name) => {
    const definition = registry[name];
    if (!definition) throw new Error(`${contract.feature} lists unknown tool ${name}`);
    return definition;
  });
}
