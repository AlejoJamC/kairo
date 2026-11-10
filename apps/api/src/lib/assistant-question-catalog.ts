/**
 * What a support agent asks the assistant, and the tool that holds each answer.
 * The catalog is the list of things the assistant is allowed to know; a question
 * whose tool is not used, or whose answer is missing, is a gap to close.
 */
export interface CatalogQuestion {
  /** The question as an agent would write it. */
  question: string;
  /** Asked with a ticket selected, without one, or both. */
  scope: 'ticket' | 'account' | 'both';
  /** The tool that must be used, or any of several that hold the same answer. */
  tool: string | readonly string[];
  /** A pattern the answer must match, when the fixture has a known answer. */
  answer?: RegExp;
}

export const ASSISTANT_QUESTION_CATALOG: readonly CatalogQuestion[] = [
  { question: 'What is the opening date of this ticket?', scope: 'ticket', tool: 'inspect_ticket', answer: /16\s*\/\s*05\s*\/\s*2026/ },
  { question: 'When did Kairo create this ticket record?', scope: 'ticket', tool: 'inspect_ticket', answer: /0[45]\s*\/\s*11\s*\/\s*2026/ },
  { question: 'How many open tickets does this customer have?', scope: 'ticket', tool: 'list_sender_tickets', answer: /\b2\b|two|dos/i },
  { question: 'Who is this ticket assigned to?', scope: 'ticket', tool: 'read_ticket_relations', answer: /Ana/i },
  { question: 'Which tags does this ticket have and was it escalated?', scope: 'ticket', tool: 'read_ticket_relations', answer: /billing.vip|escalated|level 2/i },
  { question: 'Who changed the status of this ticket and when?', scope: 'ticket', tool: 'read_ticket_timeline', answer: /Ana|in_progress/i },
  { question: 'Are there internal notes on this ticket?', scope: 'ticket', tool: 'read_ticket_notes', answer: /export logs/i },
  { question: 'What plan does this customer have?', scope: 'ticket', tool: 'read_client_profile', answer: /enterprise/i },
  { question: 'What are the SLA deadlines of this ticket?', scope: 'ticket', tool: 'read_ticket_sla' },
  { question: 'How many open P1 tickets does the account have?', scope: 'both', tool: ['find_tickets', 'account_stats'], answer: /\b2\b|two|dos/i },
  { question: 'How many open tickets are unassigned?', scope: 'both', tool: ['account_stats', 'find_tickets'], answer: /\b1\b|one|uno|una/i },
  { question: 'How many tickets were created in the last 7 days?', scope: 'both', tool: ['account_stats', 'find_tickets'], answer: /\b3\b|three|tres/i },
  { question: 'What does our knowledge say about the export button?', scope: 'both', tool: 'read_account_memory' },
];
