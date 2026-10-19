export type RetrievalPurpose = 'similar_cases' | 'approved_knowledge';
export interface SemanticScope {
  readonly accountId: string;
  readonly actor: { kind: 'user' | 'workflow'; id: string };
  readonly permissions: readonly ('retrieve' | 'index')[];
  readonly ticketId?: string;
}
export interface SourceReference { kind: string; id: string }
export interface VectorSpace { provider: string; model: string; dimensions: number }
export type SemanticFailure = 'forbidden' | 'invalid_input' | 'not_found' | 'disabled' | 'index_missing' |
  'index_incompatible' | 'provider_unavailable' | 'storage_unavailable' | 'revision_changed';
export interface SemanticMatch {
  source: SourceReference;
  revision: string;
  version?: string;
  content: string;
  authority: 'historical_case' | 'published_article' | 'approved_knowledge';
  method: 'semantic' | 'explicit_link';
  similarity?: number;
  metadata: Readonly<Record<string, unknown>>;
}
export interface SourceResult {
  source: string;
  status: 'ok' | 'unavailable';
  reason?: SemanticFailure;
  matches: SemanticMatch[];
}
export interface RetrievalResult {
  status: 'ok' | 'partial' | 'unavailable';
  reason?: SemanticFailure;
  matches: SemanticMatch[];
  sources: SourceResult[];
}
export interface LoadedSemanticSource {
  reference: SourceReference;
  accountId: string;
  revision: string;
  text: string;
  preparation: string;
  index?: { revision: string; preparation: string; space: VectorSpace; vector?: number[] };
}
export type IndexResult = { status: 'indexed' | 'unchanged'; revision: string; space: VectorSpace } |
  { status: 'skipped'; reason: 'empty_text' } | { status: 'failed'; reason: SemanticFailure };
export interface RetrievalRequest {
  purpose: RetrievalPurpose;
  query: { text: string } | { source: SourceReference };
  sources?: readonly string[];
  limit?: number;
}
export interface SemanticAdapter {
  kind: string;
  enabled?: boolean;
  purposes: readonly RetrievalPurpose[];
  load(reference: SourceReference): Promise<LoadedSemanticSource | null>;
  store(source: LoadedSemanticSource, vector: number[], space: VectorSpace): Promise<'indexed' | 'revision_changed'>;
  search(input: { purpose: RetrievalPurpose; vector: number[]; space: VectorSpace; limit: number }): Promise<SourceResult>;
}
export interface SemanticServiceDeps {
  scope: SemanticScope;
  space: VectorSpace;
  adapters: readonly SemanticAdapter[];
  embed(text: string): Promise<number[]>;
}

export function sameVectorSpace(left: VectorSpace, right: VectorSpace): boolean {
  return left.provider === right.provider && left.model === right.model && left.dimensions === right.dimensions;
}

/** A scoped capability. Storage and authorization are supplied by the server. */
export function createSemanticService(deps: SemanticServiceDeps) {
  const scope: SemanticScope = { ...deps.scope, actor: { ...deps.scope.actor }, permissions: [...deps.scope.permissions] };
  const space = { ...deps.space };
  const adapters = new Map(deps.adapters.map(adapter => [adapter.kind, adapter]));
  if (adapters.size !== deps.adapters.length) throw new Error('Duplicate semantic source adapter');
  const validVector = (vector: number[]) => vector.length === space.dimensions && vector.every(Number.isFinite) && vector.some(value => value !== 0);
  const currentIndex = (source: LoadedSemanticSource) => source.index && source.index.revision === source.revision &&
    source.index.preparation === source.preparation && sameVectorSpace(source.index.space, space);
  const load = async (reference: SourceReference) => {
    const source = await adapters.get(reference.kind)?.load(reference);
    if (!source || source.accountId !== scope.accountId || source.reference.kind !== reference.kind || source.reference.id !== reference.id) return null;
    return source;
  };
  const unavailable = (sources: readonly string[], reason: SemanticFailure): RetrievalResult => ({
    status: 'unavailable', reason, matches: [], sources: sources.map(source => ({ source, status: 'unavailable', reason, matches: [] })),
  });

  return {
    async indexSource(input: { source: SourceReference; expectedRevision?: string }): Promise<IndexResult> {
      if (!scope.permissions.includes('index')) return { status: 'failed', reason: 'forbidden' };
      const adapter = adapters.get(input.source.kind);
      if (!adapter) return { status: 'failed', reason: 'invalid_input' };
      if (adapter.enabled === false) return { status: 'failed', reason: 'disabled' };
      let source: LoadedSemanticSource | null;
      try { source = await load(input.source); } catch { return { status: 'failed', reason: 'storage_unavailable' }; }
      if (!source) return { status: 'failed', reason: 'not_found' };
      if (input.expectedRevision !== undefined && input.expectedRevision !== source.revision) return { status: 'failed', reason: 'revision_changed' };
      if (!source.text.trim()) return { status: 'skipped', reason: 'empty_text' };
      if (currentIndex(source)) {
        return { status: 'unchanged', revision: source.revision, space: { ...space } };
      }
      let vector: number[];
      try { vector = await deps.embed(source.text); } catch { return { status: 'failed', reason: 'provider_unavailable' }; }
      if (!validVector(vector)) return { status: 'failed', reason: 'index_incompatible' };
      try {
        const status = await adapter.store(source, vector, space);
        return status === 'indexed' ? { status, revision: source.revision, space: { ...space } } : { status: 'failed', reason: status };
      } catch { return { status: 'failed', reason: 'storage_unavailable' }; }
    },
    async retrieve(input: RetrievalRequest): Promise<RetrievalResult> {
      const kinds = input.sources ?? [...adapters.values()].filter(adapter => adapter.purposes.includes(input.purpose)).map(adapter => adapter.kind);
      if (!scope.permissions.includes('retrieve')) return unavailable(kinds, 'forbidden');
      if (!kinds.length || new Set(kinds).size !== kinds.length || kinds.some(kind => !adapters.get(kind)?.purposes.includes(input.purpose)) ||
        (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1))) return unavailable(kinds, 'invalid_input');
      if (kinds.every(kind => adapters.get(kind)!.enabled === false)) return unavailable(kinds, 'disabled');
      let text: string;
      let cachedVector: number[] | undefined;
      if ('source' in input.query) {
        try {
          const source = await load(input.query.source);
          if (!source) return unavailable(kinds, 'not_found');
          text = source.text;
          if (currentIndex(source)) cachedVector = source.index?.vector;
        } catch { return unavailable(kinds, 'storage_unavailable'); }
      } else text = input.query.text;
      if (!text.trim()) return unavailable(kinds, 'invalid_input');
      let vector: number[];
      try { vector = cachedVector ?? await deps.embed(text.slice(0, 2000)); } catch { return unavailable(kinds, 'provider_unavailable'); }
      if (!validVector(vector)) return unavailable(kinds, 'index_incompatible');
      const limit = Math.min(input.limit ?? 12, 50);
      const sources = await Promise.all(kinds.map(async (kind: string): Promise<SourceResult> => {
        if (adapters.get(kind)!.enabled === false) return { source: kind, status: 'unavailable', reason: 'disabled', matches: [] };
        try { return await adapters.get(kind)!.search({ purpose: input.purpose, vector, space, limit }); }
        catch { return { source: kind, status: 'unavailable', reason: 'storage_unavailable', matches: [] }; }
      }));
      const seen = new Set<string>();
      const matches = sources.flatMap(source => source.matches).sort((left, right) => (right.similarity ?? -Infinity) - (left.similarity ?? -Infinity)).filter(match => {
        const key = match.version ?? `${match.source.kind}:${match.source.id}:${match.revision}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, limit);
      const healthy = sources.filter(source => source.status === 'ok').length;
      return { status: healthy === sources.length ? 'ok' : healthy || matches.length ? 'partial' : 'unavailable', matches, sources };
    },
  };
}
