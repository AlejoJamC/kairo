/**
 * Transactional email registry + renderer — KAI-244 / ADR-024
 *
 * Loads the autonomous HTML templates from `apps/api/src/emails/templates/`
 * and exposes one typed render function per template. Templates are
 * self-contained email documents (own <head>, inline CSS, MSO fallbacks,
 * preheader, footer) — the renderer only resolves `{{snake_case}}`
 * variables, it never wraps or post-processes the markup.
 *
 * Resolution rules (ADR-024 §2):
 *  - A variable with no value resolves to `""` and logs a `console.warn` —
 *    a `{{placeholder}}` must never reach the customer.
 *  - Human-authored content (`agent_message`, `resolution_summary`,
 *    `original_message`) is passed through `sanitizeHtml()` before
 *    injection.
 *
 * Conditional blocks (KAI-245 / ADR-024 §5):
 *  - `<!-- kairo:if some_var -->...<!-- /kairo:if -->` is stripped entirely
 *    when `some_var` is empty/unset, or unwrapped (markers removed, content
 *    kept) when it has a value. Used for footer links and CTAs whose
 *    destination doesn't exist for a tenant (e.g. `csat_url`, `reopen_url`,
 *    `help_center_url`) — hides the link instead of rendering a dead URL.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sanitizeHtml } from "../lib/template-renderer.js";
import type {
  AcknowledgementVars,
  AgentReplyVars,
  ResolvedVars,
  CsatSurveyVars,
  EscalatedVars,
} from "./types.js";

const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "templates");

const TEMPLATE_FILES = {
  acknowledgement: "acknowledgement.html",
  "agent-reply": "agent-reply.html",
  resolved: "resolved.html",
  "csat-survey": "csat-survey.html",
  escalated: "escalated.html",
} as const;

export type EmailTemplateName = keyof typeof TEMPLATE_FILES;

const templateCache = new Map<EmailTemplateName, string>();

/** Read (and cache) the raw HTML for a template. */
function loadTemplate(name: EmailTemplateName): string {
  let html = templateCache.get(name);
  if (html === undefined) {
    html = readFileSync(join(TEMPLATE_DIR, TEMPLATE_FILES[name]), "utf-8");
    templateCache.set(name, html);
  }
  return html;
}

/**
 * Strip `<!-- kairo:if VAR -->...<!-- /kairo:if -->` blocks whose `VAR` is
 * empty/unset, and unwrap the markers (keeping the content) for blocks whose
 * `VAR` has a value.
 */
function stripConditionalBlocks(html: string, vars: Record<string, string>): string {
  return html.replace(
    /<!--\s*kairo:if\s+([a-z][a-z0-9_]*)\s*-->([\s\S]*?)<!--\s*\/kairo:if\s*-->/g,
    (_match, key: string, content: string) => (vars[key] ? content : "")
  );
}

/**
 * Replace every `{{snake_case}}` placeholder with its resolved value.
 * Missing or empty values resolve to `""` and emit a `console.warn` so a
 * raw placeholder never leaks to the customer.
 */
function resolveVariables(html: string, vars: Record<string, string>, templateName: EmailTemplateName): string {
  return html.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === "") {
      console.warn(`[emails] Missing variable "{{${key}}}" for template "${templateName}"`);
      return "";
    }
    return value;
  });
}

/** Build the human ticket id, e.g. `KAI-453`, from `tickets.ticket_number`. */
export function buildTicketId(ticketNumber: number): string {
  return `KAI-${ticketNumber}`;
}

export function renderAcknowledgement(vars: AcknowledgementVars): string {
  const html = stripConditionalBlocks(loadTemplate("acknowledgement"), { ...vars });
  return resolveVariables(html, { ...vars }, "acknowledgement");
}

export function renderAgentReply(vars: AgentReplyVars): string {
  const resolved: AgentReplyVars = {
    ...vars,
    agent_message: sanitizeHtml(vars.agent_message),
    original_message: sanitizeHtml(vars.original_message),
  };
  const html = stripConditionalBlocks(loadTemplate("agent-reply"), { ...resolved });
  return resolveVariables(html, { ...resolved }, "agent-reply");
}

export function renderResolved(vars: ResolvedVars): string {
  const resolved = {
    ...vars,
    resolution_summary: sanitizeHtml(vars.resolution_summary),
    message_count: String(vars.message_count),
  };
  const html = stripConditionalBlocks(loadTemplate("resolved"), resolved);
  return resolveVariables(html, resolved, "resolved");
}

export function renderCsatSurvey(vars: CsatSurveyVars): string {
  const html = stripConditionalBlocks(loadTemplate("csat-survey"), { ...vars });
  return resolveVariables(html, { ...vars }, "csat-survey");
}

export function renderEscalated(vars: EscalatedVars): string {
  const html = stripConditionalBlocks(loadTemplate("escalated"), { ...vars });
  return resolveVariables(html, { ...vars }, "escalated");
}
