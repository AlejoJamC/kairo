import { runAgent, type AgentContract, type AgentRunRequest } from './run-agent';

export { OperationResultSchema, type OperationResult, type AgentTool } from './run-agent';

/** The ticket assistant: a chat block that reads the case first and only proposes. */
export const TICKET_ASSISTANT_CONTRACT: AgentContract = {
  feature: 'ticket_assistant',
  promptId: 'ticket-assistant',
  modelRole: 'assistant',
  tools: ['inspect_ticket', 'read_account_memory', 'search_similar_cases', 'decide_classification', 'draft_reply'],
  maxSteps: 5,
  maxOutputTokens: 1500,
  readFirst: true,
};

/** The same assistant without a selected ticket: it reads only what the account has established. */
export const ACCOUNT_ASSISTANT_CONTRACT: AgentContract = {
  feature: 'account_assistant',
  promptId: 'account-assistant',
  modelRole: 'assistant',
  tools: ['read_account_memory', 'list_account_tickets'],
  maxSteps: 5,
  maxOutputTokens: 1500,
  readFirst: true,
};

export interface AgentFeatureRequest extends Omit<AgentRunRequest, 'context'> {
  context: { accountId: string; userId: string; ticketId?: string };
}

/** The contract that serves a request: the ticket assistant when a ticket is selected, the account assistant otherwise. */
export const assistantContract = (ticketId?: string): AgentContract =>
  ticketId ? TICKET_ASSISTANT_CONTRACT : ACCOUNT_ASSISTANT_CONTRACT;

/** A bounded tool loop; account identity and permissions live in tool closures. */
export async function runAgentFeature(request: AgentFeatureRequest, deps: { transport?: typeof fetch } = {}) {
  return runAgent(assistantContract(request.context.ticketId), request, deps);
}
