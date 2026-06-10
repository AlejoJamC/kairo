/**
 * Transactional email registry — KAI-244 / ADR-024
 *
 * Public entry point: typed render functions per template + variable
 * contracts. See `apps/api/src/emails/README.md` for the full contract.
 */

export {
  buildTicketId,
  renderAcknowledgement,
  renderAgentReply,
  renderResolved,
  renderCsatSurvey,
  renderEscalated,
  type EmailTemplateName,
} from "./registry.js";

export type {
  BaseEmailVars,
  AcknowledgementVars,
  AgentReplyVars,
  ResolvedVars,
  CsatSurveyVars,
  EscalatedVars,
} from "./types.js";
