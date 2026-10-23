import { createHash } from 'node:crypto';
import { createSemanticService, sameVectorSpace, SEMANTIC_SOURCE_DEFINITIONS,
  type LoadedSemanticSource, type SemanticAdapter, type SemanticMatch, type SemanticScope, type VectorSpace } from '../packages/intelligence/src/embeddings';
import type { SemanticBackendOptions } from '../apps/api/src/lib/semantic-service';
import type { Row } from './storage';

export interface SemanticFixtureStore {
  tables: Record<string, Row[]>;
  writes: { operation: string; value: Row }[];
}
const fixtureSpace: VectorSpace = { provider: 'eval', model: 'fixture-vector', dimensions: 2 };
const fixtureEmbedding = async () => [1, 0];

/** Memory storage/query adapter for the production domain; not an SQL or relevance oracle. */
export function semanticStorage(store: SemanticFixtureStore) {
  store.tables['semantic_indexes'] ??= [];
  const latest = () => {
    const versions = store.tables['knowledge_versions'] ?? store.tables['current_knowledge'] ?? [];
    return versions.filter(row => row['status'] === 'approved' && !versions.some(other =>
      other['account_id'] === row['account_id'] && other['source_id'] === row['source_id'] &&
      other['source_kind'] === row['source_kind'] && Number(other['revision']) > Number(row['revision'])));
  };
  function load(kind: string, id: string, account: string): LoadedSemanticSource | null {
    const table = kind === 'ticket' ? 'tickets' : kind === 'kb_article' ? 'kb_articles' : '';
    const row = (table ? store.tables[table] ?? [] : latest()).find(row => row['id'] === id && row['account_id'] === account);
    if (!row) return null;
    const definition = SEMANTIC_SOURCE_DEFINITIONS[kind as keyof typeof SEMANTIC_SOURCE_DEFINITIONS];
    const input = kind === 'knowledge_version' ? row['snapshot'] as Row : row;
    const revision = createHash('sha256').update(JSON.stringify(kind === 'ticket'
      ? [row['subject'], row['body_plain'], row['snippet']] : kind === 'knowledge_version'
        ? [row['id'], row['revision']] : [row['title'], row['content'], row['is_published'], row['review_status']])).digest('hex');
    const index = store.tables['semantic_indexes']!.find(index => index['account_id'] === account && index['source_kind'] === kind && index['source_id'] === id);
    return { reference: { kind, id }, accountId: account, revision, text: definition.prepare(input), preparation: definition.preparation,
      ...(index ? { index: index['value'] as NonNullable<LoadedSemanticSource['index']> } : {}) };
  }
  const service = (options: SemanticBackendOptions) => {
    const scope: SemanticScope = options.scope;
    const space = options.space ?? fixtureSpace;
    const adapters: SemanticAdapter[] = Object.values(SEMANTIC_SOURCE_DEFINITIONS).map(definition => ({
      kind: definition.kind, purposes: definition.purposes,
      load: async ref => load(definition.kind, ref.id, scope.accountId),
      loadMany: async refs => refs.flatMap(ref => { const source = load(definition.kind, ref.id, scope.accountId); return source ? [source] : []; }),
      async store(source, vector, identity) {
        if (load(definition.kind, source.reference.id, scope.accountId)?.revision !== source.revision) return 'revision_changed';
        const value = { revision: source.revision, preparation: source.preparation, space: identity, vector: [...vector] };
        const rows = store.tables['semantic_indexes']!;
        const existing = rows.find(row => row['account_id'] === scope.accountId && row['source_kind'] === definition.kind && row['source_id'] === source.reference.id);
        const row = { account_id: scope.accountId, source_kind: definition.kind, source_id: source.reference.id, value };
        if (existing) Object.assign(existing, row); else rows.push(row);
        store.writes.push({ operation: 'store_semantic_index', value: structuredClone(row) });
        return 'indexed';
      },
      async search(query) {
        const kind = definition.kind;
        const candidates = (kind === 'knowledge_version' ? latest() : store.tables[kind === 'ticket' ? 'tickets' : 'kb_articles'] ?? [])
          .filter(row => row['account_id'] === scope.accountId)
          .filter(row => kind !== 'ticket' || row['id'] !== scope.ticketId && ['resolved','ai_resolved','closed'].includes(String(row['status'])))
          .filter(row => kind !== 'kb_article' || row['is_published'] === true && !latest().some(version => version['source_id'] === row['id']));
        const matches: SemanticMatch[] = [];
        let missing = false, incompatible = false;
        for (const row of candidates) {
          const source = load(kind, String(row['id']), scope.accountId)!;
          if (!source.index) { missing = true; continue; }
          if (source.index.revision !== source.revision || source.index.preparation !== source.preparation || !sameVectorSpace(source.index.space, query.space)) { incompatible = true; continue; }
          const vector = source.index.vector!;
          const dot = vector.reduce((sum, value, i) => sum + value * query.vector[i]!, 0);
          const norm = Math.sqrt(vector.reduce((sum, value) => sum + value ** 2, 0) * query.vector.reduce((sum, value) => sum + value ** 2, 0));
          const similarity = norm ? dot / norm : 0;
          if (similarity < (options.profile?.threshold ?? 0.75)) continue;
          matches.push({ source: { kind, id: String(kind === 'knowledge_version' ? row['source_id'] : row['id']) },
            revision: source.revision, ...(kind === 'knowledge_version' ? { version: String(row['id']) } : {}),
            content: source.text, authority: kind === 'knowledge_version' ? 'approved_knowledge' : kind === 'ticket' ? 'historical_case' : 'published_article',
            method: 'semantic', similarity, metadata: kind === 'knowledge_version' ? { knowledge: row } : kind === 'ticket' ? { ticket: row } : { article: row } });
        }
        return { source: kind, status: missing || incompatible ? 'unavailable' : 'ok',
          ...(missing || incompatible ? { reason: missing ? 'index_missing' : 'index_incompatible' } : {}),
          matches: matches.sort((a,b) => b.similarity! - a.similarity!).slice(0, query.limit) };
      },
    }));
    return createSemanticService({ scope, space, adapters, embed: options.embed ?? fixtureEmbedding });
  };
  return { service, space: fixtureSpace, embed: fixtureEmbedding };
}
