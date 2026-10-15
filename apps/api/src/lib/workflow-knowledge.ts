import { z } from 'zod';
import { supabase } from './supabase.js';
import { env } from '@kairo/env';
import { generateEmbedding, ProviderError } from '@kairo/intelligence';

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
}

/**
 * Approved knowledge whose version vector reaches the configured similarity,
 * plus knowledge explicitly tied to the ticket. A failed embedding is a
 * failed lookup, never an empty one.
 */
export async function approvedWorkflowKnowledge(accountId: string, query: string, ticketId?: string, db = supabase, deps: KnowledgeSearchDeps = {}) {
  let embedding: number[];
  try {
    embedding = await (deps.embed ?? ((text: string) => generateEmbedding(text, { accountId })))(query.slice(0, QUERY_MAX_CHARS));
  } catch {
    throw new ProviderError('Approved knowledge lookup failed', true);
  }
  const { data, error } = await db.rpc('find_workflow_knowledge', {
    p_account_id: accountId, p_query_embedding: embedding, p_ticket_id: ticketId ?? null,
    p_threshold: deps.threshold ?? env.EMBEDDING_SIMILARITY_THRESHOLD,
  });
  if (error) throw new ProviderError('Approved knowledge lookup failed', true);
  return z.array(KnowledgeVersionSchema).parse(data ?? []).filter(version => version.status === 'approved' && version.account_id === accountId);
}
export function knowledgeReferences(versions: KnowledgeVersion[]) {
  return versions.map(v => ({ id: v.source_id, version: v.id,
    content: String(v.snapshot['content'] ?? v.snapshot['summary'] ?? ''), kind: v.source_kind }));
}

/** The text a knowledge version is embedded from: what retrieval and candidate selection compare. */
export function knowledgeEmbeddingText(version: Pick<KnowledgeVersion, 'snapshot'>): string {
  const evidence = version.snapshot['evidence'] as { title?: unknown } | undefined;
  const title = version.snapshot['title'] ?? evidence?.title ?? '';
  const body = version.snapshot['content'] ?? version.snapshot['summary'] ?? '';
  return `${String(title)}\n${String(body)}`.trim().slice(0, QUERY_MAX_CHARS);
}
