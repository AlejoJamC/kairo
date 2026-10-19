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
});
