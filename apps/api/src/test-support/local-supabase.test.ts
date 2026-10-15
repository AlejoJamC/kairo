import { describe, expect, it } from 'bun:test';
import { localSupabaseTarget } from './local-supabase';

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
