import { describe, it, expect } from 'bun:test';
import { buildKbEmbeddingText, maybeGenerateKbEmbedding } from './kb-embedding.js';
import { backendFixture, space } from './semantic-service.test-fixture.js';

describe('article indexing', () => {
  it('preserves the article preparation builder', () => {
    expect(buildKbEmbeddingText('Acme','Content')).toBe('Acme\n\nContent');
    expect(buildKbEmbeddingText('','')).toBeNull();
  });
  it('indexes by persisted identity and revision', async () => {
    const f = backendFixture('kb_article');
    expect(await maybeGenerateKbEmbedding({ supabase: f.db, accountId: 'acme', articleId: 'source', title: 'Stale', content: 'Old', space, embedFn: f.embed })).toEqual({ status: 'ok' });
    expect(f.calls.find(call => call.name === 'store_semantic_index')?.args).toMatchObject({ p_revision: 'r1' });
  });
});
