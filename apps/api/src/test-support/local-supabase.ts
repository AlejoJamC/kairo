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

export interface IsolatedSemanticTarget extends LocalSupabaseTarget { projectId: string; runToken: string }

/** A loopback URL alone does not establish that a database is disposable. */
export function isolatedSemanticTarget(env: Record<string, string | undefined> = process.env): IsolatedSemanticTarget | null {
  const target = localSupabaseTarget(env);
  if (!target) return null;
  const url = new URL(target.url);
  const projectId = env['SEMANTIC_TEST_PROJECT_ID'];
  const runToken = env['SEMANTIC_TEST_RUN_TOKEN'];
  if (env['NODE_ENV'] === 'production' || url.protocol !== 'http:' || url.username || url.password ||
    !url.port || ['54321','54322'].includes(url.port) || !/^kairo-semantic-test-[a-f0-9]{12}$/.test(projectId ?? '') ||
    !/^[a-f0-9-]{36}$/.test(runToken ?? '')) {
    throw new Error('Semantic integration tests require the disposable test runner and refuse the normal development stack');
  }
  return { ...target, projectId: projectId!, runToken: runToken! };
}

export async function assertSemanticTestIdentity(target: IsolatedSemanticTarget): Promise<void> {
  const response = await fetch(`${new URL(target.url).origin}/rest/v1/rpc/semantic_test_identity`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
    headers: { apikey: target.serviceRoleKey, Authorization: `Bearer ${target.serviceRoleKey}`, 'Content-Type': 'application/json' }, body: '{}',
  });
  if (!response.ok) throw new Error('Disposable database identity is unavailable; refusing test writes');
  const identity = await response.json() as { projectId?: string; runToken?: string };
  if (identity.projectId !== target.projectId || identity.runToken !== target.runToken) {
    throw new Error('Disposable database identity mismatch; refusing test writes');
  }
}
