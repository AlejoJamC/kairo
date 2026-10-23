import { describe, it, expect } from 'bun:test';
import { buildEmbeddingText, maybeGenerateTicketEmbedding } from './ticket-embedding.js';
import { backendFixture, space } from './semantic-service.test-fixture.js';

describe('ticket indexing', () => {
  it('keeps the canonical text builder bounded', () => {
    expect(buildEmbeddingText('Subject','Body')).toBe('Subject\n\nBody');
    expect(buildEmbeddingText(' ',' ')).toBeNull();
    expect(buildEmbeddingText('Acme','x'.repeat(2000))?.length).toBe(1000);
  });
  it('indexes persisted text and uses account scope in every RPC', async () => {
    const f = backendFixture();
    const result = await maybeGenerateTicketEmbedding({ supabase: f.db, accountId: 'acme', ticketId: 'source', subject: 'Stale', bodyPreview: 'Old', space, embedFn: f.embed });
    expect(result).toEqual({ status: 'ok' });
    expect(f.embed).toHaveBeenCalledWith('Persisted Acme text',{ accountId: 'acme', ticketId: 'source' });
    expect(f.calls.every(call => call.args.p_account_id === 'acme')).toBe(true);
    expect(f.calls.find(call => call.name === 'store_semantic_index')?.args).toMatchObject({ p_revision: 'r1', p_model: 'acme', p_embedding: [1,0] });
  });
  it('does not hide provider failure as a successful index', async () => {
    const f = backendFixture();
    const result = await maybeGenerateTicketEmbedding({ supabase: f.db, accountId: 'acme', ticketId: 'source', subject: '', bodyPreview: '', space, embedFn: async () => { throw new Error('private provider details'); } });
    expect(result).toEqual({ status: 'failed', reason: 'provider_unavailable' });
  });
});
