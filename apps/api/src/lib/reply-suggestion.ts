// ---------------------------------------------------------------------------
// Reply suggestion: a draft reply for the agent, grounded on the ticket, its
// conversation, the client, similar resolved tickets and relevant KB articles.
//
// The model call goes through runLlmFeature (versioned prompt, schema-validated
// answer, Langfuse, llm_calls). Everything that reaches the prompt is decided
// here, and every unknown is rendered as unavailable rather than invented.
// ---------------------------------------------------------------------------

import { z } from "zod";
import {
  runLlmFeature,
  stripQuotedThread,
  type LlmFeatureJsonRequest,
  type LlmFeatureResult,
  type PromptLang,
} from "@kairo/intelligence";

import { CLASSIFIER_BODY_RULES, resolveTenantLanguage } from "./classifier-input.js";
import { recordLlmCall } from "./llm-logging.js";
import { supabase as defaultSupabase } from "./supabase.js";
import {
  retrieveTicketContext,
  ticketQueryText,
  type KbArticle,
  type ResolvedCase,
  type TicketContext,
} from "./ticket-context.js";

export const REPLY_SUGGESTION_FEATURE = "reply_suggestion";
const PROMPT_ID = "reply-suggestion";

// The conversation the model reads: the latest messages, oldest first.
const HISTORY_MESSAGES = 10;

// Each message is reduced to its own new text: the quoted thread repeats every
// earlier message, and the backfill rule's cap is the one measured for new text.
const MESSAGE_BODY_RULE = CLASSIFIER_BODY_RULES.backfill;

// Bounds the KB block: three articles of this size stay near 1.5k tokens.
const KB_ARTICLE_MAX_CHARS = 2_000;

// The cases the model may cite, as the agent's panel shows them.
const RESOLVED_CASES_LIMIT = 2;

export const ReplySuggestionSchema = z.object({
  suggestion: z.string(),
  confidence: z.number().min(0).max(1),
  detected_language: z.enum(["es", "en"]),
});
export type ReplySuggestion = z.infer<typeof ReplySuggestionSchema>;

const LABELS: Record<PromptLang, { unavailable: string; client: string; agent: string; name: string; plan: string; sla: string; resolution: string; subject: string }> = {
  es: { unavailable: "(no disponible)", client: "Cliente", agent: "Agente", name: "Nombre", plan: "Plan", sla: "SLA", resolution: "Resolución", subject: "Asunto" },
  en: { unavailable: "(not available)", client: "Client", agent: "Agent", name: "Name", plan: "Plan", sla: "SLA", resolution: "Resolution", subject: "Subject" },
  pt: { unavailable: "(indisponível)", client: "Cliente", agent: "Agente", name: "Nome", plan: "Plano", sla: "SLA", resolution: "Resolução", subject: "Assunto" },
};

export interface ReplyTicket {
  id: string;
  subject: string | null;
  body_plain: string | null;
  ticket_type: string | null;
  priority: string | null;
  category: string | null;
  emotion: string | null;
  conversation_id: string | null;
  client_id: string | null;
}

export interface ReplyMessage {
  direction: string | null;
  body_plain: string | null;
  received_at: string | null;
}

export interface ReplyClient {
  name: string | null;
  plan_type: string | null;
  sla_level: string | null;
}

export function formatMessageHistory(messages: ReplyMessage[], lang: PromptLang): string {
  const l = LABELS[lang];
  const blocks = messages
    .map((m) => {
      const body = (MESSAGE_BODY_RULE.stripQuotes ? stripQuotedThread(m.body_plain ?? "") : m.body_plain ?? "")
        .slice(0, MESSAGE_BODY_RULE.maxChars)
        .trim();
      if (!body) return null;
      const who = m.direction === "inbound" ? l.client : l.agent;
      return `[${who}${m.received_at ? ` — ${m.received_at}` : ""}]\n${body}`;
    })
    .filter((b): b is string => b !== null);
  return blocks.length > 0 ? blocks.join("\n\n") : l.unavailable;
}

export function formatClientProfile(client: ReplyClient | null, lang: PromptLang): string {
  const l = LABELS[lang];
  if (!client) return l.unavailable;
  const parts = [
    client.name ? `${l.name}: ${client.name}` : null,
    client.plan_type ? `${l.plan}: ${client.plan_type}` : null,
    client.sla_level ? `${l.sla}: ${client.sla_level}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" | ") : l.unavailable;
}

export function formatResolvedCases(cases: ResolvedCase[], lang: PromptLang): string {
  const l = LABELS[lang];
  if (cases.length === 0) return l.unavailable;
  return cases
    .map((c) => `${l.subject}: ${c.subject ?? l.unavailable}\n${l.resolution}: ${c.resolutionSummary ?? l.unavailable}`)
    .join("\n\n");
}

export function formatKbArticles(articles: KbArticle[], lang: PromptLang): string {
  if (articles.length === 0) return LABELS[lang].unavailable;
  return articles.map((a) => `### ${a.title}\n${a.content.slice(0, KB_ARTICLE_MAX_CHARS)}`).join("\n\n");
}

/** Every placeholder of the reply-suggestion prompt, unknowns rendered as unavailable. */
export function buildReplySuggestionVars(input: {
  ticket: ReplyTicket;
  messages: ReplyMessage[];
  client: ReplyClient | null;
  context: TicketContext;
  lang: PromptLang;
}): Record<string, string> {
  const na = LABELS[input.lang].unavailable;
  return {
    subject: input.ticket.subject ?? na,
    ticket_type: input.ticket.ticket_type ?? na,
    priority: input.ticket.priority ?? na,
    category: input.ticket.category ?? na,
    emotion: input.ticket.emotion ?? na,
    client_profile: formatClientProfile(input.client, input.lang),
    message_history: formatMessageHistory(input.messages, input.lang),
    similar_case: formatResolvedCases(input.context.resolvedCases, input.lang),
    kb_articles: formatKbArticles(input.context.kbArticles, input.lang),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = import("@supabase/supabase-js").SupabaseClient<any>;

export interface SuggestReplyDeps {
  supabase?: Db;
  resolveLanguage?: (accountId: string) => Promise<PromptLang>;
  retrieve?: typeof retrieveTicketContext;
  run?: (request: LlmFeatureJsonRequest<ReplySuggestion>) => Promise<LlmFeatureResult<ReplySuggestion>>;
}

export interface SuggestReplyOutcome {
  suggestion: string;
  confidence: number;
  lang: PromptLang;
  model: string;
  promptVersion: string | null;
  referencedKbArticles: string[];
  llmCallId: string | null;
  proposalId: string | null;
}

/**
 * Drafts a reply for one ticket and stores it as a pending proposal.
 *
 * Returns null when the ticket does not exist for this account. Model failures
 * propagate unchanged (`ProviderError` keeps `retriable`) for the route to map.
 */
export async function suggestReply(
  input: { ticketId: string; accountId: string; userId: string },
  deps: SuggestReplyDeps = {}
): Promise<SuggestReplyOutcome | null> {
  const db = deps.supabase ?? defaultSupabase;

  const { data: ticket, error: ticketErr } = await db
    .from("tickets")
    .select("id, subject, body_plain, ticket_type, priority, category, emotion, conversation_id, client_id")
    .eq("id", input.ticketId)
    .eq("account_id", input.accountId)
    .single();
  if (ticketErr || !ticket) return null;
  const t = ticket as ReplyTicket;

  const [lang, messages, client, context] = await Promise.all([
    (deps.resolveLanguage ?? resolveTenantLanguage)(input.accountId),
    t.conversation_id
      ? db
          .from("messages")
          .select("direction, body_plain, received_at")
          .eq("conversation_id", t.conversation_id)
          .order("received_at", { ascending: false })
          .limit(HISTORY_MESSAGES)
          .then(({ data }) => ((data ?? []) as ReplyMessage[]).reverse())
      : Promise.resolve([] as ReplyMessage[]),
    t.client_id
      ? db
          .from("clients")
          .select("name, plan_type, sla_level")
          .eq("id", t.client_id)
          .eq("account_id", input.accountId)
          .maybeSingle()
          .then(({ data }) => (data as ReplyClient | null) ?? null)
      : Promise.resolve(null),
    (deps.retrieve ?? retrieveTicketContext)({
      ticketId: t.id,
      accountId: input.accountId,
      queryText: ticketQueryText(t.subject, t.body_plain),
      casesLimit: RESOLVED_CASES_LIMIT,
    }),
  ]);

  const result = await (deps.run ?? runLlmFeature)({
    feature: REPLY_SUGGESTION_FEATURE,
    promptId: PROMPT_ID,
    lang,
    vars: buildReplySuggestionVars({ ticket: t, messages, client, context, lang }),
    schema: ReplySuggestionSchema,
    confidenceOf: (d) => d.confidence,
    options: { maxTokens: 1500, temperature: 0.4 },
    context: { ticketId: t.id, accountId: input.accountId, userId: input.userId },
    logger: recordLlmCall,
  });

  const referencedKbArticles = context.kbArticles.map((a) => a.id);
  const { data: proposal } = await db
    .from("ticket_proposals")
    .insert({
      ticket_id: t.id,
      conversation_id: t.conversation_id ?? null,
      message_ids: [],
      proposed_reply: result.data.suggestion,
      referenced_kb_articles: referencedKbArticles,
      confidence_score: result.data.confidence,
      model_version: result.model,
      raw_llm_output: { ...result.data, lang, prompt_version: result.promptVersion },
      status: "pending",
    })
    .select("id")
    .single();

  return {
    suggestion: result.data.suggestion,
    confidence: result.data.confidence,
    lang,
    model: result.model,
    promptVersion: result.promptVersion,
    referencedKbArticles,
    llmCallId: result.llmCallId,
    proposalId: (proposal?.id as string | undefined) ?? null,
  };
}
