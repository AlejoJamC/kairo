import { z } from 'zod';
import { classifyEmailWithMeta, runAgentFeature, type AgentTool, type OperationResult, type LlmCallLogger } from '@kairo/intelligence';
import { buildEmailClassifierInput, resolveClassifierContext } from './classifier-input.js';
import { extractMailFacts } from './email/mail-facts.js';
import { recordLlmCall } from './llm-logging.js';
import { suggestReply } from './reply-suggestion.js';
import { supabase } from './supabase.js';
import { retrieveTicketContext, ticketQueryText } from './ticket-context.js';

export const AssistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }).strict()).min(1).max(20),
}).strict().refine((request) => request.messages.at(-1)?.role === 'user', 'The final message must be from the user');

export interface TicketAssistantDeps {
  db?: typeof supabase;
  resolveContext?: typeof resolveClassifierContext;
  retrieveContext?: typeof retrieveTicketContext;
  classify?: typeof classifyEmailWithMeta;
  suggest?: typeof suggestReply;
  runAgent?: typeof runAgentFeature;
  logger?: LlmCallLogger;
}

export async function consultTicketAssistant(input: {
  ticketId: string; accountId: string; userId: string;
  messages: z.infer<typeof AssistantRequestSchema>['messages']; signal?: AbortSignal;
}, deps: TicketAssistantDeps = {}) {
  const db = deps.db ?? supabase;
  const logger = deps.logger ?? recordLlmCall;
  const { data: ticket, error } = await db.from('tickets')
    .select('id, subject, body_plain, conversation_id, from_email, to_email, ticket_type, priority, category, status, model_verdict, abstain')
    .eq('id', input.ticketId).eq('account_id', input.accountId).maybeSingle();
  if (error) throw new Error('Ticket lookup failed');
  if (!ticket) return null;
  const context = await (deps.resolveContext ?? resolveClassifierContext)('backfill', input.accountId);
  const noArguments = z.object({}).strict();
  const tools: AgentTool[] = [
    {
      name: 'inspect_ticket', description: 'Read the selected ticket, its classification, and relevant published knowledge.',
      inputSchema: noArguments,
      execute: async (): Promise<OperationResult> => {
        const knowledge = await (deps.retrieveContext ?? retrieveTicketContext)({
          ticketId: input.ticketId, accountId: input.accountId, queryText: ticketQueryText(ticket.subject, ticket.body_plain),
        });
        const { data: history, error: historyError } = ticket.conversation_id
          ? await db.from('messages').select('direction, body_plain, received_at')
            .eq('account_id', input.accountId).eq('conversation_id', ticket.conversation_id)
            .order('received_at', { ascending: false }).limit(20)
          : { data: [], error: null };
        const truncated = (ticket.body_plain?.length ?? 0) > 6000 || (history?.length ?? 0) === 20
          || Boolean(history?.some((message) => (message.body_plain?.length ?? 0) > 2000));
        const missing = [...knowledge.degraded, ...(ticket.body_plain ? [] : ['message_body']),
          ...(historyError ? ['message_history'] : []), ...(truncated ? ['truncated_context'] : [])];
        return {
          status: 'completed', authorization: 'read',
          data: { ticket: { ...ticket, body_plain: ticket.body_plain?.slice(0, 6000) ?? null },
            messages: (history ?? []).reverse().map((message) => ({ ...message, body_plain: message.body_plain?.slice(0, 2000) ?? null })),
            knowledge: knowledge.kbArticles, resolvedCases: knowledge.resolvedCases },
          missing, needsReview: missing.length > 0 || Boolean(ticket.abstain),
        };
      },
    },
    {
      name: 'decide_classification', description: 'Request a classification proposal using the same decision service as email processing.',
      inputSchema: noArguments,
      execute: async (): Promise<OperationResult> => {
        const facts = extractMailFacts({
          from: ticket.from_email ?? '', subject: ticket.subject ?? '',
          headers: { To: ticket.to_email ?? '' }, tenantMailbox: context.tenantMailboxes,
        });
        const started = Date.now();
        const result = await (deps.classify ?? classifyEmailWithMeta)(buildEmailClassifierInput({
          subject: ticket.subject ?? '', from: ticket.from_email ?? '', bodyPlain: ticket.body_plain,
          stage: 'manual', facts, context, bodySource: 'stored', missing: ['original_headers'],
        }), { lang: context.language, context: { accountId: input.accountId, ticketId: input.ticketId }, abortSignal: input.signal });
        try {
          await logger({ feature: 'email_classification', model: result.meta.model,
            promptVersion: result.promptVersion, promptText: result.prompt, responseText: result.meta.rawText,
            ...result.meta.usage, confidenceScore: result.result.confidence, latencyMs: Date.now() - started,
            errorCode: null, errorDetail: null, accountId: input.accountId, ticketId: input.ticketId, userId: input.userId });
        } catch { console.warn('[ticket-assistant] Classification logging unavailable'); }

        return {
          status: 'proposed', authorization: 'human_review', data: { classification: result.result, verdict: result.verdict },
          missing: ['original_headers'], needsReview: true,
        };
      },
    },
    {
      name: 'draft_reply', description: 'Generate and store a pending reply proposal for human review. Does not send email.',
      inputSchema: noArguments,
      execute: async (): Promise<OperationResult> => {
        const proposal = await (deps.suggest ?? suggestReply)(input);
        if (!proposal) return { status: 'failed', authorization: 'denied', data: {}, missing: ['ticket'], needsReview: true };
        return { status: 'proposed', authorization: 'human_review', data: { proposal }, missing: [], needsReview: true };
      },
    },
  ];
  return (deps.runAgent ?? runAgentFeature)({ lang: context.language, messages: input.messages, tools,
    context: { accountId: input.accountId, userId: input.userId, ticketId: input.ticketId },
    logger, signal: input.signal });
}
