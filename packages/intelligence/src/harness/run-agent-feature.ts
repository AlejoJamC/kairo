import { runAgent, type AgentContract, type AgentRunRequest } from './run-agent';

export { OperationResultSchema, type OperationResult, type AgentTool } from './run-agent';

/** The ticket assistant: a chat block that reads the case first and only proposes. */
export const TICKET_ASSISTANT_CONTRACT: AgentContract = {
  feature: 'ticket_assistant',
  promptId: 'ticket-assistant',
  modelRole: 'assistant',
  tools: ['inspect_ticket', 'decide_classification', 'draft_reply'],
  maxSteps: 5,
  maxOutputTokens: 1500,
  readFirst: true,
};

export interface AgentFeatureRequest extends Omit<AgentRunRequest, 'context'> {
  context: { accountId: string; ticketId: string; userId: string };
}

/** A bounded tool loop; account identity and permissions live in tool closures. */
export async function runAgentFeature(request: AgentFeatureRequest, deps: { transport?: typeof fetch } = {}) {
  return runAgent(TICKET_ASSISTANT_CONTRACT, request, deps);
}
