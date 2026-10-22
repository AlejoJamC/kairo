import { describe, expect, it } from 'bun:test';
import { localSupabaseTarget, isolatedSemanticTarget, assertSemanticTestIdentity } from './local-supabase';

describe('localSupabaseTarget', () => {
  it('stays off unless the run opts in', () => {
    expect(localSupabaseTarget({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })).toBeNull();
  });

  it('accepts a local stack', () => {
    expect(localSupabaseTarget({ RUN_SUPABASE_INTEGRATION: '1', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }))
      .toEqual({ url: 'http://127.0.0.1:54321', serviceRoleKey: 'synthetic' });
    expect(localSupabaseTarget({ RUN_SUPABASE_INTEGRATION: '1', SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' })).not.toBeNull();
  });

  it('refuses a remote project even when the run opts in', () => {
    expect(() => localSupabaseTarget({ RUN_SUPABASE_INTEGRATION: '1', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }))
      .toThrow(/non-local/);
  });
});

describe('isolated semantic test target', () => {
  const settings = { RUN_SUPABASE_INTEGRATION: '1', SUPABASE_URL: 'http://127.0.0.1:56381', SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
    SEMANTIC_TEST_PROJECT_ID: 'kairo-semantic-test-abcdef123456', SEMANTIC_TEST_RUN_TOKEN: '11111111-1111-4111-8111-111111111111' };
  it('refuses default development ports, missing proof, remote URLs and production', () => {
    for (const override of [
      { SUPABASE_URL: 'http://127.0.0.1:54321' }, { SEMANTIC_TEST_PROJECT_ID: '' }, { SEMANTIC_TEST_RUN_TOKEN: '' },
      { SUPABASE_URL: 'https://example.supabase.co' }, { NODE_ENV: 'production' },
    ]) expect(() => isolatedSemanticTarget({ ...settings, ...override })).toThrow();
    expect(isolatedSemanticTarget({})).toBeNull();
  });
  it('accepts only a runner-created target and requires matching server identity before writes', async () => {
    const target = isolatedSemanticTarget(settings)!;
    const original = globalThis.fetch;
    try {
      for (const identity of [{}, { projectId: target.projectId, runToken: 'wrong' }]) {
        globalThis.fetch = (async () => Response.json(identity)) as unknown as typeof fetch;
        await expect(assertSemanticTestIdentity(target)).rejects.toThrow('identity mismatch');
      }
      globalThis.fetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
      await expect(assertSemanticTestIdentity(target)).rejects.toThrow('refusing test writes');
      globalThis.fetch = (async () => Response.json({ projectId: target.projectId, runToken: target.runToken })) as unknown as typeof fetch;
      await expect(assertSemanticTestIdentity(target)).resolves.toBeUndefined();
    } finally { globalThis.fetch = original; }
  });
});
