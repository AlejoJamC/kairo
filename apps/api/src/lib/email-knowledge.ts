import type { SupabaseClient } from '@supabase/supabase-js';
import {
  EMAIL_KNOWLEDGE_VERSION, buildEmailKnowledgeQuestions, EmailKnowledgeCandidateSchema,
  EmailKnowledgeDraftSchema, buildEmailKnowledgeValidationQuestions, EmailKnowledgeValidationSchema,
  knowledgeReviewReasons, createDecisionProvider, runDecisionFeature, runLlmFeature, ProviderError,
  type EmailKnowledgeProposal, type EmailKnowledgeValidation, type LlmCallLogger, type PromptLang,
} from '@kairo/intelligence';
import { resolveTenantSettings, type AccountSettings } from './classifier-input.js';
import { recordLlmCall } from './llm-logging.js';
import { supabase } from './supabase.js';
import { findRelevantKb, type retrieveTicketContext, type TicketContext } from './ticket-context.js';

interface Judgment<T> { value: T; model: string; callId: string | null }
export interface EmailKnowledgeDeps {
  db?: SupabaseClient;
  logger?: LlmCallLogger;
  context?: (accountId: string) => Promise<AccountSettings>;
  retrieve?: typeof retrieveTicketContext;
  candidate?: (state: unknown) => Promise<Judgment<ReturnType<typeof EmailKnowledgeCandidateSchema.parse>>>;
  extract?: (state: { source: string; businessContext?: string; approvedKnowledge: Pick<TicketContext['kbArticles'][number], 'id' | 'title' | 'content'>[]; lang: PromptLang }) => Promise<Judgment<{ proposals: EmailKnowledgeProposal[] }>>;
  validate?: (state: unknown) => Promise<Judgment<EmailKnowledgeValidation[]>>;
}

export async function proposeEmailKnowledge(
  input: { accountId: string; ticketId: string; messageId: string },
  deps: EmailKnowledgeDeps = {},
) {
  const db = deps.db ?? supabase;
  const sourceTag = `source-message:${input.messageId}`;
  const { data: ticket, error: ticketError } = await db.from('tickets').select('id, conversation_id')
    .eq('account_id', input.accountId).eq('id', input.ticketId).maybeSingle();
  if (ticketError) throw new ProviderError('Knowledge ticket lookup failed', true);
  if (!ticket) return { status: 'skipped' as const, reason: 'ticket_not_found' };
  const { data: link, error: linkError } = await db.from('ticket_messages').select('message_id')
    .eq('ticket_id', input.ticketId).eq('message_id', input.messageId).maybeSingle();
  if (linkError) throw new ProviderError('Knowledge source linkage lookup failed', true);
  if (!link) return { status: 'skipped' as const, reason: 'source_not_linked' };
  const { data: message, error: sourceError } = await db.from('messages').select('id, body_plain, direction')
    .eq('account_id', input.accountId).eq('id', input.messageId).maybeSingle();
  if (sourceError) throw new ProviderError('Knowledge source lookup failed', true);
  if (!message || message.direction !== 'inbound' || !message.body_plain?.trim()) {
    return { status: 'skipped' as const, reason: 'source_unavailable' };
  }
  const { data: existing, error: existingError } = await db.from('kb_articles').select('id')
    .eq('account_id', input.accountId).contains('tags', [sourceTag]).limit(5);
  if (existingError) throw new ProviderError('Knowledge proposal lookup failed', true);
  if (existing?.length) return { status: 'already_proposed' as const, articleIds: existing.map(row => row.id) };

  const settings = await (deps.context ?? (accountId => resolveTenantSettings(accountId, db)))(input.accountId);
  const fullText = message.body_plain as string;
  const source = { text: fullText.slice(0, 20_000), truncated: fullText.length > 20_000, author: 'unverified_sender' };
  const state = { stateVersion: EMAIL_KNOWLEDGE_VERSION, businessContext: settings.businessContext ?? null, source };
  const logger = deps.logger ?? recordLlmCall;
  async function decide<T>(feature: string, value: unknown, questions: unknown): Promise<Judgment<T>> {
    const result = await runDecisionFeature<T>({
      feature, state: value, questions, provider: createDecisionProvider('gateway', feature === 'email_knowledge_validation' ? 'validation' : 'knowledge_decision'),
      context: input, logger, versions: { state: EMAIL_KNOWLEDGE_VERSION, questions: EMAIL_KNOWLEDGE_VERSION },
    });
    return { value: result.data.value, model: result.data.modelVersion, callId: result.llmCallId };
  }
  const candidate = await (deps.candidate ?? (value => decide('email_knowledge_decision', value, buildEmailKnowledgeQuestions())))(state);
  const candidateValue = EmailKnowledgeCandidateSchema.parse(candidate.value);
  if (candidateValue.candidate.choice !== 'yes') return { status: 'skipped' as const, reason: 'not_candidate', candidate };
  const knowledge = await (deps.retrieve ?? (async request => {
    const kb = await findRelevantKb(request, { supabase: db });
    return { kbArticles: kb.articles, resolvedCases: [], degraded: kb.degraded };
  }))({ ticketId: input.ticketId,
    accountId: input.accountId, queryText: source.text.slice(0, 2000), casesLimit: 0 });
  const approvedKnowledge = knowledge.kbArticles.map(article => ({ id: article.id, title: article.title, content: article.content.slice(0, 2000) }));

  const extracted = await (deps.extract ?? (async value => {
    const result = await runLlmFeature({
      feature: 'email_knowledge_extraction', promptId: 'email-knowledge', modelRole: 'knowledge_draft',
      lang: value.lang, vars: { source: value.source, approved_knowledge: JSON.stringify(value.approvedKnowledge), business_context: value.businessContext ?? (value.lang === 'es' ? '(no disponible)' : '(not available)') },
      schema: EmailKnowledgeDraftSchema, options: { maxTokens: 2000, temperature: 0 }, context: input, logger,
    });
    return { value: result.data, model: result.model, callId: result.llmCallId };
  }))({ source: source.text, businessContext: settings.businessContext, approvedKnowledge, lang: settings.language });
  const proposals = EmailKnowledgeDraftSchema.parse(extracted.value).proposals;
  const results = [];
  const rows = [];
  const grounded = proposals.filter(proposal => proposal.evidence.every(quote => source.text.includes(quote)));
  for (const proposal of proposals.filter(proposal => !grounded.includes(proposal))) {
    results.push({ kind: proposal.kind, status: 'blocked' as const, reasons: ['invalid_source_quote'] });
  }
  const validation = grounded.length ? await (deps.validate ?? (async value => {
    const questions = Object.fromEntries(grounded.flatMap((_, index) =>
      Object.entries(buildEmailKnowledgeValidationQuestions(index)).map(([key, question]) => [`proposal_${index}_${key}`, question])));
    const result = await decide<Record<string, unknown>>('email_knowledge_validation', value, questions);
    return { ...result, value: grounded.map((_, index) => EmailKnowledgeValidationSchema.parse({
      support: result.value[`proposal_${index}_support`], policy: result.value[`proposal_${index}_policy`],
    })) };
  }))({ ...state, approvedKnowledge, retrievalMissing: knowledge.degraded, proposals: grounded }) : null;
  for (const [index, proposal] of grounded.entries()) {
    if (!validation) throw new ProviderError('Knowledge validation unavailable', true);
    const verdict = EmailKnowledgeValidationSchema.parse(validation.value[index]);
    const reasons = knowledgeReviewReasons(proposal, source.text, verdict);
    if (source.truncated) reasons.push('source_truncated');
    if (knowledge.degraded.length) reasons.push('approved_knowledge_unavailable');
    const tags = ['ai-draft', 'scope:account', `type:${proposal.kind}`, `origin-ticket:${input.ticketId}`, sourceTag, `proposal-index:${index}`,
      ...reasons.map(reason => `review:${reason}`),
      ...[candidate.callId, extracted.callId, validation.callId].filter((id): id is string => id !== null).map(id => `llm-call:${id}`)];
    rows.push({ account_id: input.accountId, title: proposal.title, content: proposal.content, tags, is_published: false });
    results.push({ kind: proposal.kind, proposalIndex: index, proposal, status: 'pending_review' as const, reasons,
      validation: { value: verdict, model: validation.model, callId: validation.callId } });
  }
  const articleIds: string[] = [];
  const articlesByIndex = new Map<number, string>();
  if (rows.length) {
    const { data: articles, error } = await db.from('kb_articles').insert(rows).select('id, tags');
    if (error || !articles || articles.length !== rows.length) throw new ProviderError('Knowledge proposal persistence failed', true);
    articleIds.push(...articles.map(article => article.id as string));
    for (const article of articles) {
      const index = Number((article.tags as string[]).find(tag => tag.startsWith('proposal-index:'))?.slice(15));
      if (Number.isInteger(index)) articlesByIndex.set(index, article.id as string);
    }
  }
  return { status: 'proposed' as const, version: EMAIL_KNOWLEDGE_VERSION, candidate,
    extraction: { model: extracted.model, callId: extracted.callId }, articleIds,
    proposals: results.map(result => result.status === 'pending_review'
      ? { ...result, articleId: articlesByIndex.get(result.proposalIndex) ?? null } : result) };
}
