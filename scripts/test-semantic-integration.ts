import { resolve } from 'node:path';
import { localSupabaseTarget, localSupabaseSqlUrl } from '../apps/api/src/test-support/local-supabase';

const root = resolve(import.meta.dir, '..');
const withOllama = process.argv.includes('--ollama');
const withFlow = process.argv.includes('--semantic-flow');
if (process.argv.slice(2).some(arg => !['--ollama', '--semantic-flow'].includes(arg))) throw new Error('Unsupported integration option');
if (withOllama && process.env['CI']) throw new Error('Real Ollama tests are local opt-in only');

async function run(args: string[], env: Record<string, string | undefined> = process.env, display = false): Promise<string> {
  const child = Bun.spawn(args, { cwd: root, env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (display) { process.stdout.write(stdout); process.stderr.write(stderr); }
  if (code !== 0) throw new Error('Local Supabase is unavailable or the integration checks failed; no services were started and no schema was installed');
  return stdout;
}

const status = JSON.parse(await run(['supabase', 'status', '--output', 'json'])) as Record<string, string>;
const target = localSupabaseTarget({ ...process.env, RUN_SUPABASE_INTEGRATION: '1',
  SUPABASE_URL: status['API_URL'], SUPABASE_SERVICE_ROLE_KEY: status['SERVICE_ROLE_KEY'] });
if (!target) throw new Error('The existing local Supabase connection is unavailable');
const databaseUrl = localSupabaseSqlUrl(status['DB_URL']);
const env = { ...process.env, SUPABASE_URL: target.url, SUPABASE_SERVICE_ROLE_KEY: status['SERVICE_ROLE_KEY']!,
  RUN_SUPABASE_INTEGRATION: '1', SUPABASE_DB_URL: databaseUrl, RUN_OLLAMA_EMBEDDING_TESTS: withOllama ? '1' : '0',
  EMBEDDING_PROVIDER: 'ollama', AI_GATEWAY_EMBEDDING_MODEL: '', OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  OLLAMA_EMBEDDING_MODEL: 'nomic-embed-text-v2-moe', EMBEDDING_DIMENSIONS: '768',
  LANGFUSE_PUBLIC_KEY: '', LANGFUSE_SECRET_KEY: '', SKIP_LLM_INTEGRATION: '1',
};
if (withFlow) Object.assign(env, {
  RUN_SEMANTIC_FLOW_EVAL: '1', NODE_ENV: 'test', INTELLIGENCE_PROVIDER: 'ollama', TEXT_PROVIDER: 'ollama', CLASSIFICATION_MODE: 'language',
  AI_GATEWAY_API_KEY: 'acme-simulated-key', AI_GATEWAY_ASSISTANT_MODEL: 'acme/flow-assistant',
  AI_GATEWAY_CLASSIFICATION_MODEL: '', AI_GATEWAY_REPLY_MODEL: '', AI_GATEWAY_KNOWLEDGE_DRAFT_MODEL: '',
  AI_GATEWAY_EVIDENCE_ANALYSIS_MODEL: '', AI_GATEWAY_TEXT_MODEL: '', AI_GATEWAY_MODEL: '',
  AI_GATEWAY_DECISION_MODEL: 'typesafe-ai/jev', AI_GATEWAY_KNOWLEDGE_DECISION_MODEL: 'typesafe-ai/jev',
  AI_GATEWAY_VALIDATION_MODEL: 'typesafe-ai/jev', INTELLIGENCE_ENSEMBLE: '',
  FEATURE_FLAG_ENABLE_EMAIL_KNOWLEDGE: 'true', FEATURE_FLAG_ENABLE_TICKET_ACKNOWLEDGEMENT: 'false',
  FEATURE_FLAG_ENABLE_CONTACT_EXTRACTION: 'false', FEATURE_FLAG_ENABLE_JEV_SHADOW_CLASSIFICATION: 'false', JEV_CANARY_MAILBOXES: '',
});

console.log('Using the existing local Supabase on ports 54321/54322. No instance creation, migrations or reset.');
await run(['bun', '--no-env-file', 'test', withFlow ? 'evals/semantic-flow.test.ts' : 'apps/api/src/lib/semantic-service.supabase.integration.test.ts'], env, true);
if (withOllama) await run(['bun', '--no-env-file', 'test', 'packages/intelligence/src/providers/ollama/embedding.integration.test.ts'], env, true);
