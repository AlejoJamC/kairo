/**
 * Variable contracts for transactional email templates — KAI-244 / ADR-024
 *
 * Vocabulary is `{{snake_case}}`, independent from the agent composer's
 * `{{cliente.nombre}}` vocabulary (`lib/template-renderer.ts`). See
 * `apps/api/src/emails/README.md` for the canonical contract per template.
 */

/** Variables shared by every transactional template. */
export interface BaseEmailVars {
  customer_name: string;
  /** Human ticket id, e.g. `KAI-453` (= `KAI-<ticket_number>`). */
  ticket_id: string;
  ticket_subject: string;
  help_center_url: string;
  status_url: string;
  privacy_url: string;
  unsubscribe_url: string;
}

export interface AcknowledgementVars extends BaseEmailVars {
  /** Pipeline classification label. */
  ticket_category: string;
  /** Formatted timestamp, locale es. */
  ticket_created_at: string;
}

export interface AgentReplyVars extends BaseEmailVars {
  agent_name: string;
  agent_role: string;
  agent_initials: string;
  /** Agent-authored body — sanitized via `sanitizeHtml()` before injection. */
  agent_message: string;
  sent_at: string;
  /** Snippet/quote of the customer's last message — sanitized via `sanitizeHtml()`. */
  original_message: string;
}

export interface ResolvedVars extends BaseEmailVars {
  agent_name: string;
  agent_initials: string;
  /** Agent-authored resolution text — sanitized via `sanitizeHtml()` before injection. */
  resolution_summary: string;
  resolved_at: string;
  /** Humanized duration, e.g. "4h 12m". */
  time_to_resolve: string;
  /** Number of messages in the thread. */
  message_count: number;
  /** CTA base URL — rendered with `?score=bad|ok|good`. */
  csat_url: string;
  reopen_url: string;
}

export interface CsatSurveyVars extends BaseEmailVars {
  agent_name: string;
  /** CTA base URL — rendered with `?score=1..5`. */
  csat_url: string;
}

export interface EscalatedVars extends BaseEmailVars {
  specialist_name: string;
  specialist_role: string;
  specialist_initials: string;
  priority_sla: string;
}
