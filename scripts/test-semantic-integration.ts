import { SQL } from 'bun';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dir, '..');
const withOllama = process.argv.includes('--ollama');
if (withOllama && process.env['CI']) throw new Error('Real Ollama tests are local opt-in only');
const projectId = `kairo-semantic-test-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const runToken = randomUUID();
const directory = await mkdtemp(join(tmpdir(), 'kairo-semantic-test-'));
const migration = '20261023103232_embeddings_domain.sql';
let started = false;
let db: SQL | undefined;

async function command(args: string[], env: Record<string, string | undefined> = process.env, display = false): Promise<string> {
  const child = Bun.spawn(args, { cwd: root, env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (display) {
    process.stdout.write(stdout); process.stderr.write(stderr);
  }
  if (code !== 0) {
    const safe = stderr.replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted connection]');
    throw new Error(`${args[0]} ${args[1]} failed (${code}): ${safe.slice(-4000)}`);
  }
  return stdout;
}

function setting(config: string, section: string, key: string, value: string): string {
  const heading = section.replaceAll('.', '\\.');
  const pattern = new RegExp(`(\\[${heading}\\]\\n)([\\s\\S]*?)(?=\\n\\[|$)`);
  if (!pattern.test(config)) throw new Error(`Missing test configuration section: ${section}`);
  return config.replace(pattern, (_match, start: string, body: string) => start + body.replace(new RegExp(`^${key} = .*$`, 'm'), `${key} = ${value}`));
}

async function freePort(): Promise<number> {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('test setup') });
  const port = server.port!; server.stop(true); return port;
}

try {
  const apiPort = await freePort(), dbPort = await freePort(), shadowPort = await freePort();
  if (new Set([apiPort, dbPort, shadowPort]).size !== 3 || [apiPort, dbPort].some(port => [54321,54322].includes(port))) {
    throw new Error('Refusing overlapping or default development ports');
  }
  await command(['supabase', 'init', '--workdir', directory, '--yes']);
  const configPath = join(directory, 'supabase/config.toml');
  let config = (await readFile(configPath, 'utf8')).replace(/^project_id = .*$/m, `project_id = "${projectId}"`);
  for (const [section, key, value] of [
    ['api','port',String(apiPort)], ['db','port',String(dbPort)], ['db','shadow_port',String(shadowPort)],
    ['db.seed','enabled','false'], ['db.migrations','enabled','false'], ['db.pooler','enabled','false'],
    ['studio','enabled','false'], ['realtime','enabled','false'], ['storage','enabled','false'],
    ['analytics','enabled','false'], ['edge_runtime','enabled','false'],
  ]) config = setting(config, section!, key!, value!);
  await writeFile(configPath, config);
  console.log(`Starting disposable Supabase project ${projectId} on isolated ports.`);
  started = true;
  await command(['supabase', 'start', '--workdir', directory, '--exclude', 'realtime,storage-api,imgproxy,studio,mailpit,edge-runtime,logflare,vector,supavisor,postgres-meta']);
  const status = JSON.parse(await command(['supabase', 'status', '--workdir', directory, '--output', 'json'])) as Record<string,string>;
  const apiUrl = new URL(status['API_URL']!);
  const dbUrl = new URL(status['DB_URL']!);
  if (!['127.0.0.1','localhost'].includes(apiUrl.hostname) || Number(apiUrl.port) !== apiPort ||
    !['127.0.0.1','localhost'].includes(dbUrl.hostname) || Number(dbUrl.port) !== dbPort) throw new Error('Unexpected disposable project endpoints');
  const bindings = JSON.parse(await command(['docker','inspect','--format','{{json .NetworkSettings.Ports}}',`supabase_db_${projectId}`])) as Record<string,Array<{HostPort:string}>>;
  if (!bindings['5432/tcp']?.some(binding => Number(binding.HostPort) === dbPort)) throw new Error('Database container does not own the allocated test port');
  db = new SQL(status['DB_URL']!);
  const [tables] = await db`SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public'`;
  if (tables.count !== 0) throw new Error('Refusing to install test fixtures in a nonempty public schema');
  await db.unsafe('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions; CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;').simple();
  await db.unsafe(await readFile(join(root, 'supabase/schema.sql'), 'utf8')).simple();
  await db.unsafe(`CREATE FUNCTION public.semantic_test_identity() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
    SELECT jsonb_build_object('projectId','${projectId}','runToken','${runToken}');
    $$; REVOKE ALL ON FUNCTION public.semantic_test_identity() FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION public.semantic_test_identity() TO service_role;`).simple();
  const protectedTables = ['accounts','tickets','kb_articles','operational_learning','knowledge_versions','knowledge_embeddings','decision_work_items','ticket_decision_history','knowledge_candidate_runs'];
  const before = await Promise.all(protectedTables.map(table => db!.unsafe(`SELECT count(*)::integer AS count FROM public.${table}`)));
  await mkdir(join(directory,'supabase/migrations'), { recursive: true });
  await copyFile(join(root,'supabase/migrations',migration), join(directory,'supabase/migrations',migration));
  await writeFile(configPath, setting(config,'db.migrations','enabled','true'));
  await command(['supabase','migration','up','--local','--workdir',directory]);
  const after = await Promise.all(protectedTables.map(table => db!.unsafe(`SELECT count(*)::integer AS count FROM public.${table}`)));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Installing the proposal changed business data');
  await db`NOTIFY pgrst, 'reload schema'`;
  const env = { ...process.env, SUPABASE_URL: apiUrl.origin, SUPABASE_SERVICE_ROLE_KEY: status['SERVICE_ROLE_KEY']!,
    RUN_SUPABASE_INTEGRATION: '1', SEMANTIC_TEST_PROJECT_ID: projectId, SEMANTIC_TEST_RUN_TOKEN: runToken,
    SEMANTIC_TEST_DB_URL: status['DB_URL']!, RUN_OLLAMA_EMBEDDING_TESTS: withOllama ? '1' : '0',
    EMBEDDING_PROVIDER: 'ollama', AI_GATEWAY_EMBEDDING_MODEL: '', OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_EMBEDDING_MODEL: 'nomic-embed-text-v2-moe', EMBEDDING_DIMENSIONS: '768',
    LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '', SKIP_LLM_INTEGRATION: '1',
  };
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await fetch(`${apiUrl.origin}/rest/v1/rpc/semantic_test_identity`, {
      method: 'POST', headers: { apikey: status['SERVICE_ROLE_KEY']!, Authorization: `Bearer ${status['SERVICE_ROLE_KEY']!}`, 'Content-Type':'application/json' }, body:'{}', redirect:'error',
    });
    if (response.ok) break;
    if (attempt === 49) throw new Error('Test identity RPC was not exposed by PostgREST');
    await Bun.sleep(200);
  }
  console.log('Verified a fresh test database; installed the existing proposal without changing business rows.');
  await command(['bun','--no-env-file','test','apps/api/src/lib/semantic-service.supabase.integration.test.ts'],env,true);
  if (withOllama) await command(['bun','--no-env-file','test','packages/intelligence/src/providers/ollama/embedding.integration.test.ts'],env,true);
} finally {
  await db?.close();
  if (started) {
    console.log(`Removing disposable Supabase project ${projectId}.`);
    await command(['supabase','stop','--workdir',directory,'--no-backup']);
  }
  await rm(directory,{recursive:true,force:true});
}
