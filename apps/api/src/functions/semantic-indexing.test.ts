import { beforeEach, expect, mock, test } from 'bun:test';
import type { IndexResult } from '@kairo/intelligence';
type Job = { accountId: string; source: { kind: string; id: string }; revision: string; preparation: string; space: { provider: string; model: string; dimensions: number } };
type Context = { event: { id: string; data: Job }; step: { sendEvent: (id: string, event: unknown) => Promise<unknown>; run: <T>(id: string, fn: () => Promise<T>) => Promise<T>; waitForEvent: (id: string, options: unknown) => Promise<unknown> } };
let handler: (context: Context) => Promise<unknown>;
let options: { retries: number };
const index = mock(async (): Promise<IndexResult> => ({ status: 'failed', reason: 'disabled' }));
mock.module('../lib/inngest', () => ({ inngest: { createFunction: (config: { retries: number }, run: typeof handler) => { options = config; handler = run; return {}; } } }));
mock.module('../lib/supabase', () => ({ supabase: {} }));
mock.module('../lib/semantic-service', () => ({ createBackendSemanticService: () => ({ indexSource: index }) }));
await import('./semantic-indexing');
const data: Job = { accountId: '11111111-1111-4111-8111-111111111111', source: { kind: 'ticket', id: '22222222-2222-4222-8222-222222222222' }, revision: 'r1', preparation: 'ticket:subject-body:1000:v1', space: { provider: 'ollama', model: 'nomic-embed-text-v2-moe', dimensions: 768 } };
const run = async <T>(_id: string, fn: () => Promise<T>) => fn();
beforeEach(() => index.mockReset());
test('pause resumes in a new durable step without indexing while disabled', async () => {
  index.mockResolvedValueOnce({ status: 'failed', reason: 'disabled' }).mockResolvedValueOnce({ status: 'unchanged', revision: 'r1', space: data.space });
  const wait = mock(async () => ({ data: { accountId: '11111111-1111-4111-8111-111111111111' } }));
  expect(await handler({ event: { id: 'event', data }, step: { sendEvent: async () => ({}), run, waitForEvent: wait } })).toMatchObject({ status: 'unchanged' });
  expect(wait).toHaveBeenCalledTimes(1); expect(index).toHaveBeenCalledTimes(2);
});
test('transient errors fail the step for bounded Inngest retries', async () => {
  index.mockResolvedValue({ status: 'failed', reason: 'provider_unavailable' });
  await expect(handler({ event: { id: 'event', data }, step: { sendEvent: async () => ({}), run, waitForEvent: async () => null } })).rejects.toThrow('temporarily unavailable');
  expect(options.retries).toBe(5);
});
test('a superseded source terminates without overwriting it or retrying forever', async () => {
  index.mockResolvedValue({ status: 'failed', reason: 'revision_changed' });
  expect(await handler({ event: { id: 'event', data }, step: { sendEvent: async () => ({}), run, waitForEvent: async () => null } })).toMatchObject({ reason: 'revision_changed' });
  expect(index).toHaveBeenCalledTimes(1);
});
test('a configuration change is rejected before indexing rather than silently switching spaces', async () => {
  await expect(handler({ event: { id: 'event', data: { ...data, space: { ...data.space, model: 'acme-different' } } }, step: { sendEvent: async () => ({}), run, waitForEvent: async () => null } })).rejects.toThrow('configuration changed');
  expect(index).not.toHaveBeenCalled();
});

test('a permanent provider rejection terminates without requesting transient retries', async () => {
  index.mockResolvedValue({ status: 'failed', reason: 'provider_rejected' });
  await expect(handler({ event: { id: 'event', data }, step: { sendEvent: async () => ({}), run, waitForEvent: async () => null } })).rejects.toThrow('provider_rejected');
  expect(index).toHaveBeenCalledTimes(1);
});
