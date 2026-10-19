import type { SupabaseClient } from '@supabase/supabase-js';
import { RESOLVED_STATUSES } from '@kairo/types';
import type { SemanticMatch, VectorSpace } from '@kairo/intelligence';
import { supabase as defaultSupabase } from './supabase.js';
import { createBackendSemanticService } from './semantic-service.js';

export const RELATED_CONTEXT_THRESHOLD = 0.75;
export const RESOLVED_STATUS_FILTER = RESOLVED_STATUSES.join(',');
type ContextEvidence = Pick<SemanticMatch, 'source' | 'revision' | 'version' | 'authority' | 'method'>;
const evidence = ({ source, revision, version, authority, method }: SemanticMatch): ContextEvidence => ({ source, revision, version, authority, method });
export interface ResolvedCase {
  id: string; ticketNumber: number; subject: string | null; resolvedAt: string | null;
  resolutionSummary: string | null; similarity: number | null;
  evidence?: ContextEvidence;
}
export interface KbArticle { id: string; title: string; content: string; tags: string[]; similarity: number | null; evidence?: ContextEvidence }
export type ContextDegradation = 'embedding_unavailable' | 'kb_rpc_failed' | 'cases_rpc_failed';
export interface TicketContext { kbArticles: KbArticle[]; resolvedCases: ResolvedCase[]; degraded: ContextDegradation[] }
export interface ContextDeps {
  supabase?: SupabaseClient;
  embed?: (text: string, context?: { ticketId?: string; accountId?: string }) => Promise<number[]>;
  space?: VectorSpace;
}
function service(input: { accountId: string; ticketId?: string }, deps: ContextDeps) {
  return createBackendSemanticService({ db: deps.supabase ?? defaultSupabase, space: deps.space,
    scope: { accountId: input.accountId, actor: { kind: 'workflow', id: 'ticket_context' }, permissions: ['retrieve'], ticketId: input.ticketId },
    profile: { threshold: RELATED_CONTEXT_THRESHOLD, statusFilter: RESOLVED_STATUS_FILTER, knowledgeKind: 'article' },
    embed: deps.embed ? text => deps.embed!(text,{ accountId: input.accountId, ...(input.ticketId ? { ticketId: input.ticketId } : {}) }) : undefined });
}
export async function findResolvedCases(input: { ticketId: string; accountId: string; limit?: number }, deps: ContextDeps = {}): Promise<ResolvedCase[] | null> {
  const found = await service(input,deps).retrieve({ purpose: 'similar_cases', query: { source: { kind: 'ticket', id: input.ticketId } }, sources: ['ticket'], limit: input.limit ?? 2 });
  if (found.status !== 'ok') return null;
  return found.matches.map(row => ({ id: row.source.id, ticketNumber: Number(row.metadata['ticketNumber']),
    subject: row.metadata['subject'] as string | null, resolvedAt: row.metadata['resolvedAt'] as string | null,
    resolutionSummary: row.metadata['resolutionSummary'] as string | null, similarity: row.similarity ?? null, evidence: evidence(row) }));
}
function article(row: SemanticMatch): KbArticle {
  const knowledge = row.metadata['knowledge'] as { source_id?: string; snapshot?: Record<string, unknown> } | undefined;
  const snapshot = knowledge?.snapshot ?? row.metadata;
  return { id: knowledge?.source_id ?? row.source.id, title: String(snapshot['title'] ?? ''), content: row.content,
    tags: Array.isArray(snapshot['tags']) ? snapshot['tags'] as string[] : [], similarity: row.similarity ?? null, evidence: evidence(row) };
}
export async function findRelevantKb(input: { queryText: string; accountId: string; ticketId?: string; limit?: number }, deps: ContextDeps = {}): Promise<{ articles: KbArticle[]; degraded: ContextDegradation[] }> {
  const found = await service(input,deps).retrieve({ purpose: 'approved_knowledge', query: { text: input.queryText }, sources: ['knowledge_version','kb_article'], limit: input.limit ?? 3 });
  const failure: ContextDegradation = found.sources.some(source => source.reason === 'provider_unavailable') ? 'embedding_unavailable' : 'kb_rpc_failed';
  return { articles: found.matches.map(article), degraded: found.status === 'ok' ? [] : [failure] };
}
export function ticketQueryText(subject: string | null | undefined, bodyPlain: string | null | undefined): string {
  return [(subject ?? '').trim(),(bodyPlain ?? '').trim().slice(0,200)].filter(Boolean).join('\n\n');
}
export async function retrieveTicketContext(input: { ticketId: string; accountId: string; queryText: string; kbLimit?: number; casesLimit?: number }, deps: ContextDeps = {}): Promise<TicketContext> {
  const [kb,cases] = await Promise.all([
    input.queryText.length ? findRelevantKb({ ...input, limit: input.kbLimit },deps) : Promise.resolve({ articles: [], degraded: [] }),
    findResolvedCases({ ...input, limit: input.casesLimit },deps),
  ]);
  return { kbArticles: kb.articles, resolvedCases: cases ?? [], degraded: [...kb.degraded,...(cases === null ? ['cases_rpc_failed' as const] : [])] };
}
