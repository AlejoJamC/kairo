import { z } from 'zod';
import { supabase } from './supabase.js';
import { env } from '@kairo/env';
import { ProviderError, prepareKnowledgeEmbeddingText, type VectorSpace } from '@kairo/intelligence';
import { createBackendSemanticService } from './semantic-service.js';

export const KnowledgeVersionSchema = z.object({
  id: z.string(), account_id: z.string(), source_kind: z.enum(['article', 'learning']), source_id: z.string(),
  revision: z.number(), status: z.string(), snapshot: z.record(z.string(), z.unknown()),
});
export type KnowledgeVersion = z.infer<typeof KnowledgeVersionSchema>;

/** Same input size the ticket embedding uses for retrieval queries. */
const QUERY_MAX_CHARS = 2000;

export interface KnowledgeSearchDeps {
  embed?: (text: string) => Promise<number[]>;
  threshold?: number;
  space?: VectorSpace;
}

/**
 * Approved knowledge whose version vector reaches the configured similarity,
 * plus knowledge explicitly tied to the ticket. A failed embedding is a
 * failed lookup, never an empty one.
 */
export async function approvedWorkflowKnowledge(accountId: string, query: string, ticketId?: string, db = supabase, deps: KnowledgeSearchDeps = {}) {
  const service = createBackendSemanticService({ db, embed: deps.embed, space: deps.space,
    scope: { accountId, actor: { kind: 'workflow', id: 'approved_knowledge' }, permissions: ['retrieve'], ticketId },
    profile: { threshold: deps.threshold ?? env.EMBEDDING_SIMILARITY_THRESHOLD } });
  const found = await service.retrieve({ purpose: 'approved_knowledge', query: { text: query.slice(0,QUERY_MAX_CHARS) }, sources: ['knowledge_version'] });
  if (found.status !== 'ok') throw new ProviderError('Approved knowledge lookup failed', true);
  return z.array(KnowledgeVersionSchema).parse(found.matches.map(match => match.metadata['knowledge']))
    .filter(version => version.status === 'approved' && version.account_id === accountId);
}
export function knowledgeReferences(versions: KnowledgeVersion[]) {
  return versions.map(v => ({ id: v.source_id, version: v.id,
    content: String(v.snapshot['content'] ?? v.snapshot['summary'] ?? ''), kind: v.source_kind }));
}

/** The text a knowledge version is embedded from: what retrieval and candidate selection compare. */
export function knowledgeEmbeddingText(version: Pick<KnowledgeVersion, 'snapshot'>): string {
  return prepareKnowledgeEmbeddingText(version.snapshot);
}

/** Knowledge owns scheduling; embeddings owns the vector query interface used by its persistence adapter. */
export async function enqueueWorkflowKnowledge(accountId: string, db = supabase, options: { versionId?: string } = {}): Promise<void> {
  if (options.versionId) {
    const { data, error } = await db.from('knowledge_versions').select('id').eq('account_id', accountId).eq('id', options.versionId).maybeSingle();
    if (error) throw new ProviderError('Knowledge version lookup failed', true);
    if (!data) throw new ProviderError('Knowledge version unavailable', false);
  }
  const { data, error } = options.versionId
    ? await db.rpc('enqueue_knowledge_candidates', { p_version_id: options.versionId,
      p_threshold: env.EMBEDDING_SIMILARITY_THRESHOLD, p_limit: env.KNOWLEDGE_CANDIDATE_LIMIT })
    : await db.rpc('enqueue_pending_knowledge', { p_account_id: accountId,
      p_threshold: env.EMBEDDING_SIMILARITY_THRESHOLD, p_limit: env.KNOWLEDGE_CANDIDATE_LIMIT });
  if (error) throw new ProviderError('Knowledge candidate selection failed', true);
  if (!z.number().int().nonnegative().safeParse(data).success) throw new ProviderError('Invalid knowledge candidate result', true);
}
