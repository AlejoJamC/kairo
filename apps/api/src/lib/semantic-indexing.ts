import { randomUUID } from 'node:crypto';
import { getFlag } from '@kairo/feature-flags';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { resolveModelRoute, configuredEmbeddingDimensions, SEMANTIC_SOURCE_DEFINITIONS, observeSemanticOperation } from '@kairo/intelligence';
import { inngest } from './inngest';

export const SemanticIndexJob = z.object({
  accountId: z.string().uuid(),
  source: z.object({ kind: z.enum(['ticket', 'kb_article', 'knowledge_version']), id: z.string().uuid() }),
  revision: z.string().min(1),
  preparation: z.string().min(1),
  space: z.object({ provider: z.string(), model: z.string(), dimensions: z.number().int().positive() }),
});
export type SemanticIndexJob = z.infer<typeof SemanticIndexJob>;

/** The caller supplies trusted tenant scope and explicitly selected references. */
export async function requestSemanticIndexing(db: SupabaseClient, accountId: string,
  references: readonly SemanticIndexJob['source'][]) {
  const sources = [...new Set(references.map(source => Object.hasOwn(SEMANTIC_SOURCE_DEFINITIONS, source.kind) ? source.kind : 'unregistered'))].sort();
  if (!getFlag('enable_embeddings') || !getFlag('enable_embedding_indexing')) return observeSemanticOperation(
    { operation: 'submit', space: null, sources }, async () => ({ status: 'disabled' as const }),
    () => ({ outcome: 'disabled', reason: 'disabled' }));
  const route = resolveModelRoute('embedding');
  const space = { provider: route.provider, model: route.model, dimensions: configuredEmbeddingDimensions() };
  return observeSemanticOperation({ operation: 'submit', space, sources }, async context => {
    if (!getFlag('enable_embeddings') || !getFlag('enable_embedding_indexing')) return { status: 'disabled' as const };
    context.failureReason = 'invalid_input';
    if (!references.length || references.length > 200) throw new Error('Invalid semantic indexing selection');
    const jobs: SemanticIndexJob[] = [];
    z.string().uuid().parse(accountId);
    for (const input of references) {
      const source = SemanticIndexJob.shape.source.parse(input);
      context.failureReason = 'storage_unavailable';
      const { data, error } = await db.rpc('semantic_source', { p_account_id: accountId, p_kind: source.kind, p_id: source.id });
      const loaded = z.object({ accountId: z.string(), reference: z.object({ kind: z.string(), id: z.string() }), revision: z.string() }).safeParse(data);
      if (error || !loaded.success || loaded.data.accountId !== accountId || loaded.data.reference.kind !== source.kind || loaded.data.reference.id !== source.id) {
        context.failureReason = error ? 'storage_unavailable' : 'not_found';
        throw new Error('Semantic indexing source unavailable');
      }
      jobs.push(SemanticIndexJob.parse({ accountId, source, revision: loaded.data.revision,
        preparation: SEMANTIC_SOURCE_DEFINITIONS[source.kind].preparation, space }));
    }
    if (!getFlag('enable_embeddings') || !getFlag('enable_embedding_indexing')) return { status: 'disabled' as const };
    context.failureReason = 'storage_unavailable';
    const { ids } = await inngest.send(jobs.map(data => ({ name: 'embeddings/index.requested', data,
      id: randomUUID() })));
    if (ids.length !== jobs.length) throw new Error('Semantic indexing acceptance incomplete');
    return { status: 'accepted' as const, requests: jobs.map((job, i) => ({ ...job, eventId: ids[i]! })) };
  }, result => ({ outcome: result.status, ...(result.status === 'disabled' ? { reason: 'disabled' as const } : {}) }));
}

/** Resume is an explicit operation after the trusted controls have been enabled. */
export async function resumeSemanticIndexing(accountId: string) {
  z.string().uuid().parse(accountId);
  return inngest.send({ name: 'embeddings/resumed', data: { accountId } });
}
