// ---------------------------------------------------------------------------
// KAI-55 — turns a resolved ticket into a knowledge draft, when it deserves one.
//
// A native decision model evaluates the evidence; only when it says yes
// does a text model write the article. The draft is stored unpublished
// (`is_published = false`) and never reaches retrieval until a person
// publishes it.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildKnowledgeQuestions,
  createDecisionProvider,
  KnowledgeDraftSchema,
  KnowledgeAnswersSchema,
  KNOWLEDGE_QUESTIONS_VERSION,
  type KnowledgeAnswers,
  ProviderError,
  parseKnowledgeAnswers,
  runDecisionFeature,
  runLlmFeature,
  shouldDraftKnowledge,
  stripQuotedThread,
  type KnowledgeDecision,
  type KnowledgeDraft,
  type PromptLang,
} from "@kairo/intelligence";

import { CLASSIFIER_BODY_RULES, resolveTenantLanguage } from "./classifier-input.js";
import { maybeGenerateKbEmbedding } from "./kb-embedding.js";
import { recordLlmCall } from "./llm-logging.js";
import { supabase as defaultSupabase } from "./supabase.js";

export const KNOWLEDGE_DECISION_FEATURE = "knowledge_decision";
export const KNOWLEDGE_DRAFT_FEATURE = "knowledge_draft";
const DRAFT_PROMPT_ID = "knowledge-draft";

const THREAD_MESSAGES = 30;
const MESSAGE_BODY_RULE = CLASSIFIER_BODY_RULES.backfill;

interface ThreadMessage {
  direction: string | null;
  body_plain: string | null;
  received_at: string | null;
}

interface KnowledgeTicket {
  id: string;
  subject: string | null;
  category: string | null;
  ticket_type: string | null;
  conversation_id: string | null;
}

export type KnowledgeCandidateOutcome =
  | { status: "drafted"; articleId: string; decision: KnowledgeDecision }
  | { status: "skipped"; reason: "ticket_not_found" | "no_thread" | "already_drafted" | "not_candidate" };

export interface KnowledgeCandidateDeps {
  supabase?: SupabaseClient;
  resolveLanguage?: (accountId: string) => Promise<PromptLang>;
  decide?: (input: {
    ticketId: string;
    accountId: string;
    state: unknown;
  }) => Promise<KnowledgeDecision>;
  draft?: (input: {
    ticketId: string;
    accountId: string;
    lang: PromptLang;
    vars: Record<string, string>;
  }) => Promise<KnowledgeDraft>;
  embed?: typeof maybeGenerateKbEmbedding;
}

function threadText(messages: ThreadMessage[]): string {
  return messages
    .map((m) => {
      const body = (MESSAGE_BODY_RULE.stripQuotes ? stripQuotedThread(m.body_plain ?? "") : m.body_plain ?? "")
        .slice(0, MESSAGE_BODY_RULE.maxChars)
        .trim();
      if (!body) return null;
      const who = m.direction === "inbound" ? "customer" : "agent";
      return `[${who}]\n${body}`;
    })
    .filter((b): b is string => b !== null)
    .join("\n\n");
}

async function decideWithNativeModel(input: { ticketId: string; accountId: string; state: unknown }): Promise<KnowledgeDecision> {
  const { data } = await runDecisionFeature<KnowledgeAnswers>({
    feature: KNOWLEDGE_DECISION_FEATURE,
    provider: createDecisionProvider("gateway", "knowledge_decision"),
    state: input.state,
    questions: buildKnowledgeQuestions(),
    context: { ticketId: input.ticketId, accountId: input.accountId },
    logger: recordLlmCall,
    versions: { state: "1.0.0", questions: KNOWLEDGE_QUESTIONS_VERSION },
  });
  const parsed = KnowledgeAnswersSchema.safeParse(data.value);
  if (!parsed.success) throw new ProviderError('Knowledge decision output does not match its question contract', false);
  const answers = parsed.data;
  return {
    ...parseKnowledgeAnswers(answers),
    audit: { answers, stateVersion: "1.0.0", questionsVersion: KNOWLEDGE_QUESTIONS_VERSION,
      reviewReasons: ["human_publication_required", "provider_not_calibrated"] },
  };
}

async function draftWithTextModel(input: {
  ticketId: string;
  accountId: string;
  lang: PromptLang;
  vars: Record<string, string>;
}): Promise<KnowledgeDraft> {
  const result = await runLlmFeature({
    feature: KNOWLEDGE_DRAFT_FEATURE,
    promptId: DRAFT_PROMPT_ID,
    modelRole: "knowledge_draft",
    lang: input.lang,
    vars: input.vars,
    schema: KnowledgeDraftSchema,
    options: { maxTokens: 1500, temperature: 0.3 },
    context: { ticketId: input.ticketId, accountId: input.accountId },
    logger: recordLlmCall,
  });
  return result.data;
}

export async function draftKnowledgeFromTicket(
  input: { ticketId: string; accountId: string },
  deps: KnowledgeCandidateDeps = {},
): Promise<KnowledgeCandidateOutcome> {
  const db = deps.supabase ?? defaultSupabase;
  const ticketTag = `ticket:${input.ticketId}`;

  const { data: ticket, error: ticketError } = await db
    .from("tickets")
    .select("id, subject, category, ticket_type, conversation_id")
    .eq("id", input.ticketId)
    .eq("account_id", input.accountId)
    .single();
  if (ticketError && ticketError.code !== "PGRST116") throw new Error("Knowledge ticket lookup failed");
  if (!ticket) return { status: "skipped", reason: "ticket_not_found" };
  const t = ticket as KnowledgeTicket;

  const { data: existing, error: existingError } = await db
    .from("kb_articles")
    .select("id")
    .eq("account_id", input.accountId)
    .contains("tags", [ticketTag])
    .limit(1);
  if (existingError) throw new Error("Knowledge deduplication lookup failed");
  if ((existing ?? []).length > 0) return { status: "skipped", reason: "already_drafted" };

  const messages = t.conversation_id
    ? await db
        .from("messages")
        .select("direction, body_plain, received_at")
        .eq("conversation_id", t.conversation_id)
        .eq("account_id", input.accountId)
        .order("received_at", { ascending: false })
        .limit(THREAD_MESSAGES)
        .then(({ data, error }) => {
          if (error) throw new Error("Knowledge thread retrieval failed");
          return ((data ?? []) as ThreadMessage[]).reverse();
        })
    : [];
  const thread = threadText(messages);
  if (!thread) return { status: "skipped", reason: "no_thread" };

  const decision = await (deps.decide ?? decideWithNativeModel)({
    ticketId: t.id,
    accountId: input.accountId,
    state: { stateVersion: "1.0.0", scope: "account", truncated: messages.length === THREAD_MESSAGES, subject: t.subject, category: t.category, ticketType: t.ticket_type, thread },
  });
  if (!shouldDraftKnowledge(decision)) return { status: "skipped", reason: "not_candidate" };

  const lang = await (deps.resolveLanguage ?? resolveTenantLanguage)(input.accountId);
  const draft = await (deps.draft ?? draftWithTextModel)({
    ticketId: t.id,
    accountId: input.accountId,
    lang,
    vars: {
      knowledge_type: decision.knowledgeType,
      evidence_quality: decision.evidenceQuality,
      subject: t.subject ?? "",
      category: t.category ?? "",
      thread,
    },
  });

  const tags = ["ai-draft", "scope:account", `type:${decision.knowledgeType}`, ticketTag, ...(decision.reusableAcrossCustomers ? ["reusable"] : [])];
  const { data: article, error } = await db
    .from("kb_articles")
    .insert({
      account_id: input.accountId,
      title: draft.title,
      content: draft.content,
      tags,
      is_published: false,
    })
    .select("id")
    .single();
  if (error || !article) throw new Error("Knowledge draft persistence failed");

  await (deps.embed ?? maybeGenerateKbEmbedding)({
    supabase: db,
    articleId: article.id as string,
    accountId: input.accountId,
    title: draft.title,
    content: draft.content,
  });

  return { status: "drafted", articleId: article.id as string, decision };
}
