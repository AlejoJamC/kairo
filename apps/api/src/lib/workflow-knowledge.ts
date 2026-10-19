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

/** The pipeline explicitly selects its account's sources; installing the schema schedules nothing. */
export async function enqueuePendingSemanticKnowledge(accountId: string, db = supabase): Promise<void> {
  let after: string | undefined;
  for (;;) {
    let request = db.from('current_knowledge').select('id').eq('account_id', accountId).order('id').limit(200);
    if (after) request = request.gt('id', after);
    const { data, error } = await request;
    if (error) throw new ProviderError('Pending knowledge lookup failed', true);
    for (const version of data ?? []) {
      const result = await db.rpc('enqueue_semantic_knowledge_candidates', { p_version_id: version.id,
        p_threshold: env.EMBEDDING_SIMILARITY_THRESHOLD, p_limit: env.KNOWLEDGE_CANDIDATE_LIMIT });
      if (result.error) throw new ProviderError('Pending knowledge check failed', true);
    }
    if (!data || data.length < 200) return;
    after = data[data.length - 1]!.id;
  }
}
