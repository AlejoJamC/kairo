import { describe, it, expect, vi } from 'vitest';
import { createSemanticService, type SemanticAdapter, type LoadedSemanticSource, type SemanticMatch } from './service';

const space = { provider: 'synthetic', model: 'acme', dimensions: 2 };
function fixture(kind = 'ticket') {
  const source: LoadedSemanticSource = { reference: { kind, id: 'source' }, accountId: 'acme', revision: 'r1', preparation: 'v1', text: 'Invented support case.' };
  const match: SemanticMatch = { source: source.reference, revision: source.revision, content: source.text, authority: 'historical_case', method: 'semantic', metadata: {} };
  const store = vi.fn<SemanticAdapter['store']>(async () => 'indexed');
  const search = vi.fn<SemanticAdapter['search']>(async () => ({ source: kind, status: 'ok', matches: [match] }));
  const adapter: SemanticAdapter = { kind, purposes: ['similar_cases'], load: vi.fn(async () => source), store, search };
  const embed = vi.fn(async () => [1,0]);
  const create = (permissions: ('index' | 'retrieve')[] = ['index','retrieve'], adapters = [adapter]) => createSemanticService({ scope: { accountId: 'acme', actor: { kind: 'workflow', id: 'test' }, permissions }, space, adapters, embed });
  return { source, match, adapter, embed, create, store, search };
}

describe('semantic domain', () => {
  it('rejects foreign source IDs before embedding or indexing', async () => {
    const f = fixture(); f.source.accountId = 'outside';
    expect(await f.create().indexSource({ source: f.source.reference })).toEqual({ status: 'failed', reason: 'not_found' });
    expect((await f.create().retrieve({ purpose: 'similar_cases', query: { source: f.source.reference } })).status).toBe('unavailable');
    expect(f.embed).not.toHaveBeenCalled(); expect(f.adapter.store).not.toHaveBeenCalled();
  });
  it('enforces permissions and expected revisions without calling providers', async () => {
    const f = fixture();
    expect(await f.create([]).indexSource({ source: f.source.reference })).toEqual({ status: 'failed', reason: 'forbidden' });
    expect(await f.create().indexSource({ source: f.source.reference, expectedRevision: 'old' })).toEqual({ status: 'failed', reason: 'revision_changed' });
    expect(f.embed).not.toHaveBeenCalled();
  });
  it('does not regenerate a compatible current index, but does regenerate an equal-dimension different model', async () => {
    const f = fixture(); f.source.index = { revision: 'r1', preparation: 'v1', space };
    expect((await f.create().indexSource({ source: f.source.reference })).status).toBe('unchanged');
    expect(f.embed).not.toHaveBeenCalled();
    f.source.index = { ...f.source.index, space: { ...space, model: 'different' } };
    expect((await f.create().indexSource({ source: f.source.reference })).status).toBe('indexed');
    expect(f.adapter.store).toHaveBeenCalledWith(f.source,[1,0],space);
  });
  it('reports a race on persistence, invalid vectors, and sanitized provider failures', async () => {
    const f = fixture(); f.store.mockResolvedValue('revision_changed');
    expect(await f.create().indexSource({ source: f.source.reference })).toEqual({ status: 'failed', reason: 'revision_changed' });
    f.embed.mockResolvedValue([NaN,0]);
    expect(await f.create().indexSource({ source: f.source.reference })).toEqual({ status: 'failed', reason: 'index_incompatible' });
    f.embed.mockRejectedValue(new Error('sensitive provider response'));
    expect(JSON.stringify(await f.create().retrieve({ purpose: 'similar_cases', query: { text: 'Acme' } }))).not.toContain('sensitive');
  });
  it('distinguishes no matches from unavailable and preserves partial-source evidence', async () => {
    const f = fixture(); f.search.mockResolvedValue({ source: 'ticket', status: 'ok', matches: [] });
    expect((await f.create().retrieve({ purpose: 'similar_cases', query: { text: 'Acme' } })).status).toBe('ok');
    const second: SemanticAdapter = { ...f.adapter, kind: 'synthetic_note', search: async () => ({ source: 'synthetic_note', status: 'unavailable', reason: 'index_missing', matches: [] }) };
    expect((await f.create(['retrieve'],[f.adapter,second]).retrieve({ purpose: 'similar_cases', query: { text: 'Acme' } })).status).toBe('partial');
    expect(f.embed).toHaveBeenCalledTimes(2);
  });
  it('adds a source through registration alone and validates requested capabilities', async () => {
    const f = fixture('synthetic_note');
    const found = await f.create().retrieve({ purpose: 'similar_cases', query: { text: 'Acme' }, limit: 100 });
    expect(found.matches[0]?.source.kind).toBe('synthetic_note');
    expect(f.adapter.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }));
    expect((await f.create().retrieve({ purpose: 'approved_knowledge', query: { text: 'Acme' }, sources: ['synthetic_note'] })).status).toBe('unavailable');
  });
  it('does not read, index, or spend provider calls for a disabled capability', async () => {
    const f = fixture(); f.adapter.enabled = false;
    expect(await f.create().indexSource({ source: f.source.reference })).toEqual({ status: 'failed', reason: 'disabled' });
    expect(await f.create().retrieve({ purpose: 'similar_cases', query: { text: 'Acme' } })).toMatchObject({ status: 'unavailable', reason: 'disabled' });
    expect(f.adapter.load).not.toHaveBeenCalled(); expect(f.embed).not.toHaveBeenCalled();
  });
  it('reuses a compatible source vector during provider outages', async () => {
    const f = fixture(); f.source.index = { revision: 'r1', preparation: 'v1', space, vector: [1,0] };
    f.embed.mockRejectedValue(new Error('provider unavailable'));
    expect((await f.create().retrieve({ purpose: 'similar_cases', query: { source: f.source.reference } })).status).toBe('ok');
    expect(f.embed).not.toHaveBeenCalled();
  });
  it('merges ranked results within the same space and removes repeated versions', async () => {
    const f = fixture();
    f.search.mockResolvedValue({ source: 'ticket', status: 'ok', matches: [{ ...f.match, similarity: 0.8, version: 'shared' }] });
    const other: SemanticAdapter = { ...f.adapter, kind: 'synthetic_note', search: async () => ({ source: 'synthetic_note', status: 'ok', matches: [{ ...f.match, source: {kind:'synthetic_note',id:'other'}, similarity: 0.9, version:'shared' }] }) };
    const result = await f.create(['retrieve'],[f.adapter,other]).retrieve({ purpose:'similar_cases',query:{text:'Acme'},limit:1 });
    expect(result.matches).toHaveLength(1); expect(result.matches[0]?.similarity).toBe(0.9);
  });
  it('reads only compatible current indices without generating or storing vectors', async () => {
    const f = fixture('synthetic_note');
    const service = f.create();
    expect(await service.readIndexes({ sources: [f.source.reference] })).toMatchObject([{ status: 'unavailable', reason: 'index_missing' }]);
    f.source.index = { revision: 'r1', preparation: 'v1', space, vector: [1,0] };
    expect(await service.readIndexes({ sources: [f.source.reference] })).toMatchObject([{ status: 'ready', source: f.source.reference, vector: [1,0], space }]);
    for (const index of [
      { ...f.source.index, revision: 'old' }, { ...f.source.index, preparation: 'different' },
      { ...f.source.index, space: { ...space, model: 'different' } }, { ...f.source.index, space: { ...space, provider: 'different' } },
      { ...f.source.index, space: { ...space, dimensions: 3 } }, { ...f.source.index, vector: [0,0] },
      { ...f.source.index, vector: [NaN,0] }, { ...f.source.index, vector: [1] },
    ]) {
      f.source.index = index;
      expect(await service.readIndexes({ sources: [f.source.reference] })).toMatchObject([{ status: 'unavailable', reason: 'index_incompatible' }]);
    }
    expect(f.embed).not.toHaveBeenCalled(); expect(f.store).not.toHaveBeenCalled();
  });
  it('uses the batch source port once and rejects foreign or unrequested rows', async () => {
    const f = fixture();
    f.source.index = { revision: 'r1', preparation: 'v1', space, vector: [1,0] };
    const loadMany = vi.fn(async () => [f.source,
      { ...f.source, accountId: 'outside', reference: { kind: 'ticket', id: 'foreign' } },
      { ...f.source, reference: { kind: 'ticket', id: 'unrequested' } }]);
    const adapter = { ...f.adapter, loadMany };
    const found = await f.create(['retrieve'],[adapter]).readIndexes({ sources: [f.source.reference, { kind: 'ticket', id: 'foreign' }] });
    expect(found).toMatchObject([{ status: 'ready' }, { status: 'unavailable', reason: 'not_found' }]);
    expect(loadMany).toHaveBeenCalledTimes(1); expect(f.adapter.load).not.toHaveBeenCalled();
    expect(f.embed).not.toHaveBeenCalled(); expect(f.store).not.toHaveBeenCalled();
  });
  it('blocks invalid, disabled and unauthorized reads before touching storage', async () => {
    const f = fixture();
    expect(await f.create([]).readIndexes({ sources: [f.source.reference] })).toMatchObject([{ reason: 'forbidden' }]);
    expect(await f.create().readIndexes({ sources: [{ kind: 'ticket', id: ' ' }] })).toMatchObject([{ reason: 'invalid_input' }]);
    expect(await f.create().indexSource({ source: { kind: 'ticket', id: ' ' } })).toMatchObject({ reason: 'invalid_input' });
    const tooMany = await f.create().readIndexes({ sources: Array.from({ length: 201 }, () => f.source.reference) });
    expect(tooMany.every(result => result.status === 'unavailable' && result.reason === 'invalid_input')).toBe(true);
    f.adapter.enabled = false;
    expect(await f.create().readIndexes({ sources: [f.source.reference] })).toMatchObject([{ reason: 'disabled' }]);
    expect(f.adapter.load).not.toHaveBeenCalled(); expect(f.embed).not.toHaveBeenCalled();
  });
  it('does not use a disabled source as a retrieval query for an enabled source', async () => {
    const f = fixture();
    const query = { ...f.adapter, kind: 'synthetic_note', enabled: false };
    expect(await f.create(['retrieve'],[f.adapter,query]).retrieve({ purpose: 'similar_cases', sources: ['ticket'],
      query: { source: { kind: 'synthetic_note', id: 'source' } } })).toMatchObject({ status: 'unavailable', reason: 'disabled' });
    expect(f.adapter.load).not.toHaveBeenCalled(); expect(f.embed).not.toHaveBeenCalled();
  });
  it('owns grouping over compatible indices and reports missing sources without exposing vectors', async () => {
    const f = fixture('synthetic_note');
    f.adapter.load = vi.fn(async reference => ({ ...f.source, reference,
      ...(reference.id === 'missing' ? {} : { index: { revision: 'r1', preparation: 'v1', space, vector: reference.id === 'b' ? [0.95,0.05] : [1,0] } }) }));
    const sources = ['a','b','missing'].map(id => ({ kind: 'synthetic_note', id }));
    const result = await f.create().groupSources({ sources });
    expect(result).toMatchObject({ status: 'partial', groups: [[sources[0],sources[1]]],
      sources: [{ status: 'ready' }, { status: 'ready' }, { status: 'unavailable', reason: 'index_missing' }] });
    expect(JSON.stringify(result)).not.toContain('vector');
    expect(f.embed).not.toHaveBeenCalled(); expect(f.store).not.toHaveBeenCalled();
    f.adapter.load = vi.fn(async () => { throw new Error('private storage details'); });
    expect(await f.create().readIndexes({ sources: [f.source.reference] })).toMatchObject([{ reason: 'storage_unavailable' }]);
    expect(await f.create().groupSources({ sources, minSimilarity: NaN })).toMatchObject({ status: 'unavailable', groups: [] });
  });
  it('keeps centroid grouping stable when one source could bridge unrelated groups', async () => {
    const f = fixture();
    const vectors: Record<string, number[]> = { a: [1,0], b: [0.8,0.6], c: [0.6,0.8], d: [0,1] };
    f.adapter.load = vi.fn(async reference => ({ ...f.source, reference,
      index: { revision: 'r1', preparation: 'v1', space, vector: vectors[reference.id]! } }));
    const result = await f.create().groupSources({ sources: Object.keys(vectors).map(id => ({ kind: 'ticket', id })), minSimilarity: 0.9 });
    expect(result.status).toBe('ok');
    expect(result.groups.map(group => group.map(reference => reference.id))).toEqual([['a'],['b','c'],['d']]);
    expect(f.embed).not.toHaveBeenCalled();
  });

});
