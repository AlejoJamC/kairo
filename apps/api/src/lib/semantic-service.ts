import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getFlag } from '@kairo/feature-flags';
import { RESOLVED_STATUSES } from '@kairo/types';
import {
  createSemanticService, generateEmbedding, configuredEmbeddingDimensions, resolveModelRoute,
  SEMANTIC_SOURCE_DEFINITIONS,
  type SemanticScope, type VectorSpace, type LoadedSemanticSource, type SemanticAdapter,
} from '@kairo/intelligence';

const SpaceSchema = z.object({ provider: z.string(), model: z.string(), dimensions: z.number().int().positive() });
const SourceSchema = z.object({
  reference: z.object({ kind: z.string(), id: z.string() }), accountId: z.string(), revision: z.string(),
  text: z.string(), preparation: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  index: z.object({ revision: z.string(), preparation: z.string(), space: SpaceSchema, vector: z.array(z.number()).optional() }).nullish(),
});
const ReasonSchema = z.enum(['forbidden','invalid_input','not_found','disabled','index_missing','index_incompatible',
  'provider_unavailable','provider_rejected','storage_unavailable','revision_changed']);
const MatchSchema = z.object({
  source: z.object({ kind: z.string(), id: z.string() }), revision: z.string(), version: z.string().nullish(),
  content: z.string(), authority: z.enum(['historical_case','published_article','approved_knowledge']),
  method: z.enum(['semantic','explicit_link']), similarity: z.number().finite().nullish(), metadata: z.record(z.string(),z.unknown()),
});
const SearchSchema = z.object({ status: z.enum(['ok','unavailable']), reason: ReasonSchema.nullish(), matches: z.array(MatchSchema) });

export interface SemanticBackendOptions {
  db: SupabaseClient;
  scope: SemanticScope;
  embed?: (text: string) => Promise<number[]>;
  space?: VectorSpace;
  profile?: { threshold?: number; statusFilter?: string | null; excludeSameGroup?: boolean; knowledgeKind?: 'article' | 'learning' };
}

/** Callers supply authenticated scope and policy, never model-generated arguments. */
export function createBackendSemanticService(options: SemanticBackendOptions) {
  const db = options.db;
  const scope = { ...options.scope, actor: { ...options.scope.actor }, permissions: [...options.scope.permissions] };
  const route = resolveModelRoute('embedding');
  const space = options.space ?? { provider: route.provider, model: route.model, dimensions: configuredEmbeddingDimensions() };
  const definitions = SEMANTIC_SOURCE_DEFINITIONS;
  const prepare = (kind: keyof typeof definitions, data: unknown): LoadedSemanticSource => {
    const parsed = SourceSchema.parse(data);
    return { ...parsed, text: parsed.input ? definitions[kind].prepare(parsed.input) : parsed.text,
      preparation: parsed.input ? definitions[kind].preparation : parsed.preparation, index: parsed.index ?? undefined };
  };
  const adapters: SemanticAdapter[] = (Object.keys(definitions) as Array<keyof typeof definitions>).map(kind => ({
    kind, purposes: definitions[kind].purposes,
    async load(reference) {
      const { data, error } = await db.rpc('semantic_source', { p_account_id: scope.accountId, p_kind: kind, p_id: reference.id });
      if (error) throw new Error('Semantic source unavailable');
      if (!data) return null;
      return prepare(kind, data);
    },
    async loadMany(references) {
      const { data, error } = await db.rpc('semantic_sources', {
        p_account_id: scope.accountId, p_kind: kind, p_ids: references.map(reference => reference.id),
      });
      if (error) throw new Error('Semantic sources unavailable');
      return z.array(z.object({ source: SourceSchema })).parse(data).map(row => prepare(kind, row.source));
    },
    async store(source, vector, vectorSpace) {
      const { data, error } = await db.rpc('store_semantic_index', {
        p_account_id: scope.accountId, p_kind: kind, p_id: source.reference.id,
        p_revision: source.revision, p_preparation: source.preparation,
        p_provider: vectorSpace.provider, p_model: vectorSpace.model, p_dimensions: vectorSpace.dimensions, p_embedding: vector,
      });
      if (error) throw new Error('Semantic index unavailable');
      if (data !== 'indexed' && data !== 'revision_changed') throw new Error('Invalid semantic index result');
      return data;
    },
    async search(input) {
      const { data, error } = await db.rpc('retrieve_semantic_sources', {
        p_account_id: scope.accountId, p_kind: kind, p_purpose: input.purpose, p_query: input.vector,
        p_provider: input.space.provider, p_model: input.space.model, p_dimensions: input.space.dimensions,
        p_ticket_id: scope.ticketId ?? null, p_threshold: options.profile?.threshold ?? 0.75,
        p_limit: input.limit, p_status_filter: options.profile?.statusFilter === undefined ? RESOLVED_STATUSES.join(',') : options.profile.statusFilter,
        p_knowledge_kind: options.profile?.knowledgeKind ?? null,
        p_exclude_same_group: options.profile?.excludeSameGroup ?? false,
      });
      if (error) throw new Error('Semantic retrieval unavailable');
      const result = SearchSchema.parse(data);
      return { source: kind, status: result.status, reason: result.reason ?? undefined,
        matches: result.matches.map(match => ({ ...match, version: match.version ?? undefined, similarity: match.similarity ?? undefined })) };
    },
  }));
  return createSemanticService({ scope, space, adapters,
    controls: () => ({ enabled: getFlag('enable_embeddings'), generation: getFlag('enable_embedding_generation'),
      indexing: getFlag('enable_embedding_indexing'), retrieval: getFlag('enable_embedding_retrieval') }),
    embed: options.embed ?? (text => generateEmbedding(text, {
    accountId: scope.accountId, ...(scope.ticketId ? { ticketId: scope.ticketId } : {}),
  })) });
}
