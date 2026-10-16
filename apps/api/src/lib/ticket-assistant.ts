import { z } from 'zod';
import { runAgentFeature, TICKET_ASSISTANT_CONTRACT, type LlmCallLogger } from '@kairo/intelligence';
import { contractTools, sharedAgentTools, type AgentToolDeps } from './agent-tools.js';
import { resolveClassifierContext } from './classifier-input.js';
import { recordLlmCall } from './llm-logging.js';
import { supabase } from './supabase.js';

export const AssistantRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }).strict()).min(1).max(20),
}).strict().refine((request) => request.messages.at(-1)?.role === 'user', 'The final message must be from the user');

export interface TicketAssistantDeps extends Omit<AgentToolDeps, 'db' | 'logger' | 'resolveContext'> {
  db?: typeof supabase;
  resolveContext?: typeof resolveClassifierContext;
  runAgent?: typeof runAgentFeature;
  logger?: LlmCallLogger;
}

export async function consultTicketAssistant(input: {
  ticketId: string; accountId: string; userId: string;
  messages: z.infer<typeof AssistantRequestSchema>['messages']; signal?: AbortSignal;
}, deps: TicketAssistantDeps = {}) {
  const db = deps.db ?? supabase;
  const logger = deps.logger ?? recordLlmCall;
  const { data: ticket, error } = await db.from('tickets').select('id')
    .eq('id', input.ticketId).eq('account_id', input.accountId).maybeSingle();
  if (error) throw new Error('Ticket lookup failed');
  if (!ticket) return null;
  const context = await (deps.resolveContext ?? resolveClassifierContext)('backfill', input.accountId);
  const registry = sharedAgentTools({ feature: TICKET_ASSISTANT_CONTRACT.feature, accountId: input.accountId,
    ticketId: input.ticketId, userId: input.userId, ...(input.signal ? { signal: input.signal } : {}) },
  { ...deps, db, logger, resolveContext: async () => context });
  return (deps.runAgent ?? runAgentFeature)({ lang: context.language, messages: input.messages,
    tools: contractTools(TICKET_ASSISTANT_CONTRACT, registry),
    context: { accountId: input.accountId, userId: input.userId, ticketId: input.ticketId },
    logger, ...(input.signal ? { signal: input.signal } : {}) });
}
