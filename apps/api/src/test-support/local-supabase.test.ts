import { describe, expect, it } from 'bun:test';
import { localSupabaseTarget, localSupabaseSqlUrl } from './local-supabase';

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

describe('existing local Supabase connections', () => {
  const settings = { RUN_SUPABASE_INTEGRATION: '1', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' };
  it('rejects alternate ports, URL credentials, redirects through paths and production', () => {
    for (const override of [
      { SUPABASE_URL: 'http://127.0.0.1:56381' }, { SUPABASE_URL: 'http://synthetic@127.0.0.1:54321' },
      { SUPABASE_URL: 'http://127.0.0.1:54321/other' }, { SUPABASE_URL: 'https://localhost:54321' },
      { NODE_ENV: 'production' },
    ]) expect(() => localSupabaseTarget({ ...settings, ...override })).toThrow();
  });
  it('requires the existing local SQL endpoint and rejects remote and alternate connections', () => {
    expect(localSupabaseSqlUrl('postgresql://postgres:synthetic@127.0.0.1:54322/postgres')).toContain(':54322/postgres');
    for (const url of [undefined, 'invalid', 'postgresql://postgres:synthetic@db.acme.com:54322/postgres',
      'postgresql://postgres:synthetic@127.0.0.1:56382/postgres', 'postgresql://postgres:synthetic@127.0.0.1:54322/postgres?host=db.acme.com']) {
      expect(() => localSupabaseSqlUrl(url)).toThrow();
    }
  });
});
