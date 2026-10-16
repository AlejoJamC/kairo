import { z } from 'zod';
import type { AgentContract } from '../harness/run-agent';

/** What the synthesis block concludes about an account from its support conversations. */
export const BusinessSynthesisSchema = z.object({
  /** Null when the conversations do not establish what the company delivers. */
  profile: z.object({
    summary: z.string().min(1).max(800),
    evidenceTicketIds: z.array(z.string().min(1)).min(1).max(10),
  }).nullable(),
  themes: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(500),
    ticketIds: z.array(z.string().min(1)).min(2).max(200),
  })).max(8),
  missing: z.array(z.string().min(1).max(200)).max(12),
});
export type BusinessSynthesis = z.infer<typeof BusinessSynthesisSchema>;

/** The synthesis block: reads the account's conversations, plans what to investigate and proposes the business map. */
export const BUSINESS_SYNTHESIS_CONTRACT: AgentContract<BusinessSynthesis> = {
  feature: 'business_synthesis',
  promptId: 'business-synthesis',
  modelRole: 'knowledge_draft',
  tools: ['list_account_tickets', 'group_similar_tickets', 'read_account_memory', 'ask_judgments'],
  maxSteps: 8,
  maxOutputTokens: 16_384,
  reasoning: 'high',
  output: BusinessSynthesisSchema,
  readFirst: true,
};
