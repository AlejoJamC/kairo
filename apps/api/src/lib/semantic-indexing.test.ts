import { beforeEach, expect, mock, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
const send = mock(async (_events: unknown) => ({ ids: ['accepted'] }));
mock.module('./inngest', () => ({ inngest: { send } }));
const { requestSemanticIndexing } = await import('./semantic-indexing');
const account = '11111111-1111-4111-8111-111111111111';
const source = { kind: 'ticket' as const, id: '22222222-2222-4222-8222-222222222222' };
let owner = account;
const rpc = mock(async () => ({ data: { accountId: owner, reference: source, revision: 'r1' }, error: null }));
const db = { rpc } as unknown as SupabaseClient;
beforeEach(() => { owner = account; send.mockClear(); rpc.mockClear(); delete process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS']; });
test('acceptance returns the persisted event identity only after the durable transport confirms', async () => {
  const result = await requestSemanticIndexing(db, account, [source]);
  expect(result).toMatchObject({ status: 'accepted', requests: [{ eventId: 'accepted', revision: 'r1', source }] });
  expect(send).toHaveBeenCalledTimes(1);
});
test('a foreign reference is rejected before any job is submitted', async () => {
  owner = '33333333-3333-4333-8333-333333333333';
  await expect(requestSemanticIndexing(db, account, [source])).rejects.toThrow('source unavailable');
  expect(send).not.toHaveBeenCalled();
});
test('global off performs neither source reads nor durable submissions', async () => {
  process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS'] = 'false';
  try {
    expect(await requestSemanticIndexing(db, account, [source])).toEqual({ status: 'disabled' });
    expect(send).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  } finally { delete process.env['FEATURE_FLAG_ENABLE_EMBEDDINGS']; }
});
test('transport failure cannot be reported as accepted', async () => {
  send.mockImplementationOnce(async () => { throw new Error('Unavailable'); });
  await expect(requestSemanticIndexing(db, account, [source])).rejects.toThrow('Unavailable');
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
