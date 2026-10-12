/**
 * Credentials for integration tests that write to a Supabase database.
 *
 * Returns a target only when the run opts in with RUN_SUPABASE_INTEGRATION=1
 * and SUPABASE_URL points at a local stack. It never reads `.env.local`, which
 * holds the linked remote project: these suites insert and delete rows, and
 * must never run against it.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export interface LocalSupabaseTarget { url: string; serviceRoleKey: string }

export function localSupabaseTarget(env: Record<string, string | undefined> = process.env): LocalSupabaseTarget | null {
  if (env['RUN_SUPABASE_INTEGRATION'] !== '1') return null;
  const url = env['SUPABASE_URL'];
  const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) return null;
  let host: string;
  try { host = new URL(url).hostname; } catch { return null; }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error('RUN_SUPABASE_INTEGRATION refuses a non-local SUPABASE_URL: these tests write to the database');
  }
  return { url, serviceRoleKey };
}
