import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SemanticOperationSignal } from '@kairo/intelligence';
const realIntelligence = { ...await import('@kairo/intelligence') };
const signals: SemanticOperationSignal[] = [];
mock.module('@kairo/intelligence', () => ({ ...realIntelligence,
  observeSemanticOperation: (info: Parameters<typeof realIntelligence.observeSemanticOperation>[0],
    run: Parameters<typeof realIntelligence.observeSemanticOperation>[1], summarize: Parameters<typeof realIntelligence.observeSemanticOperation>[2]) =>
    realIntelligence.observeSemanticOperation(info, run, summarize, signal => signals.push(signal)),
}));
afterAll(() => mock.module('@kairo/intelligence', () => realIntelligence));
const send = mock(async (_events: unknown) => ({ ids: ['accepted'] }));
mock.module('./inngest', () => ({ inngest: { send } }));
const { requestSemanticIndexing } = await import('./semantic-indexing');
const account = '11111111-1111-4111-8111-111111111111';
const source = { kind: 'ticket' as const, id: '22222222-2222-4222-8222-222222222222' };
let owner = account;
const rpc = mock(async () => ({ data: { accountId: owner, reference: source, revision: 'r1' }, error: null }));
const db = { rpc } as unknown as SupabaseClient;
beforeEach(() => { owner = account; send.mockClear(); rpc.mockClear(); signals.length = 0; delete process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS']; });
test('acceptance returns the persisted event identity only after the durable transport confirms', async () => {
  const result = await requestSemanticIndexing(db, account, [source]);
  expect(result).toMatchObject({ status: 'accepted', requests: [{ eventId: 'accepted', revision: 'r1', source }] });
  expect(send).toHaveBeenCalledTimes(1);
  expect(signals).toMatchObject([{ operation: 'submit', outcome: 'accepted', generation: 'none' }]);
  expect(JSON.stringify(signals)).not.toContain(account);
  expect(JSON.stringify(signals)).not.toContain(source.id);
});
test('a foreign reference is rejected before any job is submitted', async () => {
  owner = '33333333-3333-4333-8333-333333333333';
  await expect(requestSemanticIndexing(db, account, [source])).rejects.toThrow('source unavailable');
  expect(send).not.toHaveBeenCalled();
});
test('global off performs neither source reads nor durable submissions', async () => {
  const provider = process.env['EMBEDDING_PROVIDER'];
  process.env['EMBEDDING_PROVIDER'] = 'invalid';
  process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS'] = 'false';
  try {
    expect(await requestSemanticIndexing(db, account, [source])).toEqual({ status: 'disabled' });
    expect(send).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
    expect(signals).toMatchObject([{ outcome: 'disabled', space: null, reason: 'disabled' }]);
  } finally {
    delete process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS'];
    if (provider === undefined) delete process.env['EMBEDDING_PROVIDER']; else process.env['EMBEDDING_PROVIDER'] = provider;
  }
});
test('transport failure cannot be reported as accepted', async () => {
  send.mockImplementationOnce(async () => { throw new Error('Unavailable'); });
  await expect(requestSemanticIndexing(db, account, [source])).rejects.toThrow('Unavailable');
  expect(signals).toMatchObject([{ outcome: 'failed', reason: 'storage_unavailable' }]);
});
test('disabling the domain while loading a selection prevents its submission', async () => {
  rpc.mockImplementationOnce(async () => {
    process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS'] = 'false';
    return { data: { accountId: account, reference: source, revision: 'r1' }, error: null };
  });
  try {
    expect(await requestSemanticIndexing(db, account, [source])).toEqual({ status: 'disabled' });
    expect(send).not.toHaveBeenCalled();
  } finally { delete process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS']; }
});
