import type { SupabaseClient } from '@supabase/supabase-js';
import { createBackendSemanticService } from './semantic-service.js';

/** Trusted profiles for grouping and escalation; these are not resolved-case retrieval. */
export async function searchTicketMatches(input: {
  db: SupabaseClient; accountId: string; ticketId: string; limit: number; threshold: number; excludeSameGroup?: boolean;
}) {
  const service = createBackendSemanticService({ db: input.db,
    scope: { accountId: input.accountId, ticketId: input.ticketId, actor: { kind: 'workflow', id: 'ticket_similarity' }, permissions: ['retrieve'] },
    profile: { threshold: input.threshold, statusFilter: null, excludeSameGroup: input.excludeSameGroup } });
  const result = await service.retrieve({ purpose: 'similar_cases', query: { source: { kind: 'ticket', id: input.ticketId } }, sources: ['ticket'], limit: input.limit });
  return { data: result.matches.map(match => ({ ticket_id: match.source.id, subject: match.metadata['subject'],
    resolved_at: match.metadata['resolvedAt'], resolution_summary: match.metadata['resolutionSummary'],
    ticket_number: match.metadata['ticketNumber'], similarity: match.similarity, group_id: match.metadata['groupId'] })),
    error: result.status === 'ok' ? null : { message: 'Semantic retrieval unavailable' } };
}

export async function readCompatibleTicketVectors(db: SupabaseClient, accountId: string, ids: string[]) {
  const { resolveModelRoute, configuredEmbeddingDimensions } = await import('@kairo/intelligence');
  const route = resolveModelRoute('embedding');
  return db.rpc('read_semantic_ticket_vectors',{ p_account_id: accountId,p_ids: ids,p_provider: route.provider,
    p_model: route.model,p_dimensions: configuredEmbeddingDimensions() });
}
