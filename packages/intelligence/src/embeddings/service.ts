import { ProviderError } from '../providers/base';
import { groupBySimilarity } from './similarity';

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
  'index_incompatible' | 'provider_unavailable' | 'provider_rejected' | 'storage_unavailable' | 'revision_changed';
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
  loadMany?(references: readonly SourceReference[]): Promise<LoadedSemanticSource[]>;
  store(source: LoadedSemanticSource, vector: number[], space: VectorSpace): Promise<'indexed' | 'revision_changed'>;
  search(input: { purpose: RetrievalPurpose; vector: number[]; space: VectorSpace; limit: number }): Promise<SourceResult>;
}
export interface SemanticServiceDeps {
  scope: SemanticScope;
  controls?: () => { enabled: boolean; generation: boolean; indexing: boolean; retrieval: boolean };
  generationTimeoutMs?: number;
  indexingTimeoutMs?: number;
  space: VectorSpace;
  adapters: readonly SemanticAdapter[];
  embed(text: string): Promise<number[]>;
}
export interface IndexRequest { source: SourceReference; expectedRevision?: string }
export type StoredIndexResult = {
  status: 'ready'; source: SourceReference; revision: string; preparation: string; space: VectorSpace; vector: number[];
} | { status: 'unavailable'; source: SourceReference; reason: SemanticFailure };
export interface GroupingResult {
  status: 'ok' | 'partial' | 'unavailable';
  groups: SourceReference[][];
  sources: Array<{ status: 'ready'; source: SourceReference } | { status: 'unavailable'; source: SourceReference; reason: SemanticFailure }>;
}
export interface SemanticService {
  indexSource(input: IndexRequest): Promise<IndexResult>;
  retrieve(input: RetrievalRequest): Promise<RetrievalResult>;
  readIndexes(input: { sources: readonly SourceReference[] }): Promise<StoredIndexResult[]>;
  groupSources(input: { sources: readonly SourceReference[]; minSimilarity?: number }): Promise<GroupingResult>;
}

export function sameVectorSpace(left: VectorSpace, right: VectorSpace): boolean {
  return left.provider === right.provider && left.model === right.model && left.dimensions === right.dimensions;
}

/** A scoped capability. Storage and authorization are supplied by the server. */
export function createSemanticService(deps: SemanticServiceDeps): SemanticService {
  const scope: SemanticScope = { ...deps.scope, actor: { ...deps.scope.actor }, permissions: [...deps.scope.permissions] };
  const space = { ...deps.space };
  const adapters = new Map(deps.adapters.map(adapter => [adapter.kind, adapter]));
  if (adapters.size !== deps.adapters.length) throw new Error('Duplicate semantic source adapter');
  const validVector = (vector: number[]) => vector.length === space.dimensions && vector.every(Number.isFinite) && vector.some(value => value !== 0);
  const currentIndex = (source: LoadedSemanticSource) => source.index && source.index.revision === source.revision &&
    source.index.preparation === source.preparation && sameVectorSpace(source.index.space, space);
  const validReference = (source: SourceReference) => typeof source.kind === 'string' && !!source.kind.trim() &&
    typeof source.id === 'string' && !!source.id.trim();
  const load = async (reference: SourceReference) => {
    const source = await adapters.get(reference.kind)?.load(reference);
    if (!source || source.accountId !== scope.accountId || source.reference.kind !== reference.kind || source.reference.id !== reference.id) return null;
    return source;
  };
  const unavailable = (sources: readonly string[], reason: SemanticFailure): RetrievalResult => ({
    status: 'unavailable', reason, matches: [], sources: sources.map(source => ({ source, status: 'unavailable', reason, matches: [] })),
  });

  const controls = () => deps.controls?.() ?? { enabled: true, generation: true, indexing: true, retrieval: true };
  const generate = async (text: string, timeoutMs = deps.generationTimeoutMs ?? 10_000) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([deps.embed(text), new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Embedding generation timed out')), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  };
  const service: SemanticService = {
    async indexSource(input: IndexRequest): Promise<IndexResult> {
      if (!controls().enabled || !controls().indexing) return { status: 'failed', reason: 'disabled' };
      if (!scope.permissions.includes('index')) return { status: 'failed', reason: 'forbidden' };
      if (!validReference(input.source)) return { status: 'failed', reason: 'invalid_input' };
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
      if (!controls().enabled || !controls().generation || !controls().indexing) return { status: 'failed', reason: 'disabled' };
      let vector: number[];
      try { vector = await generate(source.text, deps.indexingTimeoutMs ?? deps.generationTimeoutMs ?? 120_000); } catch (error) { return { status: 'failed', reason: error instanceof ProviderError && !error.retriable ? 'provider_rejected' : 'provider_unavailable' }; }
      if (!validVector(vector)) return { status: 'failed', reason: 'index_incompatible' };
      if (!controls().enabled || !controls().indexing) return { status: 'failed', reason: 'disabled' };
      try {
        const status = await adapter.store(source, vector, space);
        return status === 'indexed' ? { status, revision: source.revision, space: { ...space } } : { status: 'failed', reason: status };
      } catch { return { status: 'failed', reason: 'storage_unavailable' }; }
    },
    async readIndexes(input): Promise<StoredIndexResult[]> {
      const invalid = (reference: SourceReference): SemanticFailure | undefined => {
        if (!controls().enabled || !controls().retrieval) return 'disabled';
        if (!scope.permissions.includes('retrieve')) return 'forbidden';
        if (input.sources.length > 200 || !validReference(reference) || !adapters.has(reference.kind)) return 'invalid_input';
        if (adapters.get(reference.kind)!.enabled === false) return 'disabled';
        return undefined;
      };
      const key = (reference: SourceReference) => JSON.stringify([reference.kind, reference.id]);
      const groups = new Map<string, Map<string, SourceReference>>();
      for (const reference of input.sources) {
        if (invalid(reference)) continue;
        if (!groups.has(reference.kind)) groups.set(reference.kind, new Map());
        groups.get(reference.kind)!.set(key(reference), reference);
      }
      const loaded = new Map<string, LoadedSemanticSource>();
      const failures = new Map<string, SemanticFailure>();
      await Promise.all([...groups.entries()].map(async ([kind, references]) => {
        const adapter = adapters.get(kind)!;
        if (adapter.loadMany) {
          try {
            for (const source of await adapter.loadMany([...references.values()])) {
              if (source.accountId === scope.accountId && source.reference.kind === kind && references.has(key(source.reference))) {
                loaded.set(key(source.reference), source);
              }
            }
          } catch { for (const id of references.keys()) failures.set(id, 'storage_unavailable'); }
        } else {
          await Promise.all([...references.values()].map(async reference => {
            try { const source = await load(reference); if (source) loaded.set(key(reference), source); }
            catch { failures.set(key(reference), 'storage_unavailable'); }
          }));
        }
      }));
      return input.sources.map((reference): StoredIndexResult => {
        const failed = (reason: SemanticFailure): StoredIndexResult => ({ status: 'unavailable', source: { ...reference }, reason });
        const reason = invalid(reference) ?? failures.get(key(reference));
        if (reason) return failed(reason);
        const source = loaded.get(key(reference));
        if (!source) return failed('not_found');
        if (!source.index) return failed('index_missing');
        if (!currentIndex(source) || !source.index.vector || !validVector(source.index.vector)) return failed('index_incompatible');
        return { status: 'ready', source: { ...reference }, revision: source.revision, preparation: source.preparation,
          space: { ...space }, vector: [...source.index.vector] };
      });
    },
    async groupSources(input): Promise<GroupingResult> {
      const threshold = input.minSimilarity ?? 0.8;
      if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return {
        status: 'unavailable', groups: [], sources: input.sources.map(source => ({ status: 'unavailable', source: { ...source }, reason: 'invalid_input' })),
      };
      const indices = await service.readIndexes({ sources: input.sources });
      const vectors = new Map<string, number[]>();
      const references = new Map<string, SourceReference>();
      for (const index of indices) {
        if (index.status !== 'ready') continue;
        const key = JSON.stringify([index.source.kind, index.source.id]);
        vectors.set(key, index.vector); references.set(key, index.source);
      }
      return { status: indices.every(index => index.status === 'ready') ? 'ok' : vectors.size ? 'partial' : 'unavailable',
        groups: groupBySimilarity(vectors, threshold).map(group => group.map(key => ({ ...references.get(key)! }))),
        sources: indices.map(index => index.status === 'ready' ? { status: 'ready', source: index.source } : index) };
    },
    async retrieve(input: RetrievalRequest): Promise<RetrievalResult> {
      const kinds = input.sources ?? [...adapters.values()].filter(adapter => adapter.purposes.includes(input.purpose)).map(adapter => adapter.kind);
      if (!controls().enabled || !controls().retrieval) return unavailable(kinds, 'disabled');
      if (!scope.permissions.includes('retrieve')) return unavailable(kinds, 'forbidden');
      if (!kinds.length || new Set(kinds).size !== kinds.length || kinds.some(kind => !adapters.get(kind)?.purposes.includes(input.purpose)) ||
        (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1))) return unavailable(kinds, 'invalid_input');
      if (kinds.every(kind => adapters.get(kind)!.enabled === false)) return unavailable(kinds, 'disabled');
      let text: string;
      let cachedVector: number[] | undefined;
      if ('source' in input.query) {
        const reference = input.query.source;
        if (!validReference(reference) || !adapters.has(reference.kind)) return unavailable(kinds, 'invalid_input');
        if (adapters.get(reference.kind)!.enabled === false) return unavailable(kinds, 'disabled');
        try {
          const source = await load(reference);
          if (!source) return unavailable(kinds, 'not_found');
          text = source.text;
          if (currentIndex(source)) cachedVector = source.index?.vector;
        } catch { return unavailable(kinds, 'storage_unavailable'); }
      } else text = input.query.text;
      if (!text.trim()) return unavailable(kinds, 'invalid_input');
      if (!cachedVector && (!controls().enabled || !controls().generation)) return unavailable(kinds, 'disabled');
      let vector: number[];
      try { vector = cachedVector ?? await generate(text.slice(0, 2000)); } catch (error) { return unavailable(kinds, error instanceof ProviderError && !error.retriable ? 'provider_rejected' : 'provider_unavailable'); }
      if (!validVector(vector)) return unavailable(kinds, 'index_incompatible');
      if (!controls().enabled || !controls().retrieval) return unavailable(kinds, 'disabled');
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
  return service;
}
