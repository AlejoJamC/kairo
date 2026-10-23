import { createClient } from '@supabase/supabase-js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface LocalSupabaseTarget { url: string; serviceRoleKey: string }

export function localSupabaseTarget(env: Record<string, string | undefined> = process.env): LocalSupabaseTarget | null {
  if (env['RUN_SUPABASE_INTEGRATION'] !== '1') return null;
  const url = env['SUPABASE_URL'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) return null;
  let endpoint: URL;
  try { endpoint = new URL(url); } catch { throw new Error('Invalid local Supabase URL'); }
  if (!LOCAL_HOSTS.has(endpoint.hostname) || endpoint.protocol !== 'http:' || endpoint.port !== '54321' ||
    endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || env['NODE_ENV'] === 'production') {
    throw new Error('Supabase integration tests require the existing non-production local stack on port 54321; non-local and alternate endpoints are refused');
  }
  return { url, serviceRoleKey };
}

export function localSupabaseSqlUrl(value: string | undefined): string {
  let endpoint: URL;
  try { endpoint = new URL(value ?? ''); } catch { throw new Error('A local Supabase SQL connection is required'); }
  if (!['postgres:', 'postgresql:'].includes(endpoint.protocol) || !LOCAL_HOSTS.has(endpoint.hostname) || endpoint.port !== '54322' ||
    endpoint.pathname !== '/postgres' || [...endpoint.searchParams.keys()].some(key => key !== 'sslmode') ||
    !['disable', null].includes(endpoint.searchParams.get('sslmode'))) {
    throw new Error('Supabase SQL tests require the existing local database on port 54322');
  }
  return endpoint.toString();
}

export function createSemanticTestClient(target: LocalSupabaseTarget) {
  return createClient(target.url, target.serviceRoleKey, { auth: { persistSession: false } });
}
