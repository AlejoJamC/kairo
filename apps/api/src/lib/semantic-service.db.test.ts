import { beforeAll, afterAll, describe, it, expect, mock } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createBackendSemanticService } from './semantic-service.js';
import { findRelevantKb } from './ticket-context.js';
import { approvedWorkflowKnowledge } from './workflow-knowledge.js';
import { sharedAgentTools } from './agent-tools.js';
import { OllamaEmbeddingProvider } from '@kairo/intelligence';
import { maybeGenerateTicketEmbedding } from './ticket-embedding.js';

const runSql = process.env['RUN_SEMANTIC_SQL_TESTS'] === '1';
const db = runSql ? new PGlite({ extensions: { vector } }) : null!;
const root = new URL('../../../../',import.meta.url);
const vec = `[${[1,...Array<number>(767).fill(0)].join(',')}]`;
let legacy: Awaited<ReturnType<typeof fixture>>;
let installationBefore: Awaited<ReturnType<typeof installationState>>;
async function query<T>(text: string, args: unknown[] = []) { return (await db.query<T>(text,args)).rows; }
async function installationState() {
  return Promise.all(['tickets','kb_articles','knowledge_versions','knowledge_embeddings','decision_work_items','ticket_decision_history','knowledge_candidate_runs','operational_learning','accounts','messages'].map(table =>
    query(`SELECT to_jsonb(source) AS row FROM ${table} source ORDER BY to_jsonb(source)::text`)));
}
const section = (source: string,start: string,end: string) => {
  const offset = source.indexOf(start);
  if (offset < 0) throw new Error('Missing SQL fixture definition');
  return source.slice(offset,source.indexOf(end,offset)+end.length);
};
beforeAll(async()=>{
  if (!runSql) return;
  await db.exec(`CREATE SCHEMA extensions; CREATE EXTENSION vector WITH SCHEMA extensions;
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE messages(id uuid PRIMARY KEY);
    CREATE TABLE accounts(id uuid PRIMARY KEY);
    CREATE TABLE operational_learning(id uuid PRIMARY KEY,account_id uuid,status text,summary text,evidence jsonb,reviewed_by uuid);
    CREATE TABLE decision_work_items(id uuid DEFAULT gen_random_uuid(),account_id uuid,ticket_id uuid,knowledge_version_id uuid,contract text,dedupe_key text,UNIQUE(account_id,dedupe_key));`);
  const schema = await readFile(new URL('supabase/schema.sql',root),'utf8');
  for (const table of ['tickets','kb_articles']) await db.exec(section(schema,`CREATE TABLE IF NOT EXISTS "public"."${table}" (`,'\n);'));
  await db.exec('ALTER TABLE tickets ADD PRIMARY KEY(id); ALTER TABLE kb_articles ADD PRIMARY KEY(id);');
  await db.exec(`ALTER TABLE tickets ALTER COLUMN ticket_number ADD GENERATED ALWAYS AS IDENTITY; ALTER TABLE tickets ADD COLUMN IF NOT EXISTS case_revision bigint DEFAULT 0; ALTER TABLE tickets ADD COLUMN IF NOT EXISTS knowledge_context jsonb DEFAULT '{}';`);
  const workflow = await readFile(new URL('supabase/migrations/20261012090531_decision_workflows_and_knowledge_history.sql',root),'utf8');
  await db.exec(`ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS review_status text; ALTER TABLE kb_articles ADD COLUMN IF NOT EXISTS reviewed_by uuid;`);
  await db.exec(section(workflow,'CREATE TABLE public.knowledge_versions (','\n);'));
  await db.exec(section(workflow,'CREATE TABLE public.knowledge_embeddings (','\n);'));
  await db.exec(section(workflow,'CREATE TABLE public.knowledge_candidate_runs (','\n);'));
  await db.exec(section(workflow,'CREATE TABLE public.ticket_decision_history (','\n);'));
  await db.exec("ALTER TABLE decision_work_items ADD COLUMN status text DEFAULT 'pending';");
  await db.exec(section(workflow,'CREATE FUNCTION public.record_knowledge_version()','\n$$;'));
  await db.exec(`CREATE TRIGGER kb_version AFTER INSERT OR UPDATE OR DELETE ON kb_articles FOR EACH ROW EXECUTE FUNCTION record_knowledge_version();`);
  await db.exec(section(workflow,'CREATE VIEW public.latest_knowledge','WHERE status=\'approved\';'));
  await db.exec(section(workflow,'CREATE FUNCTION public.enqueue_knowledge_candidates(','\n$$;'));
  await db.exec(section(workflow,'CREATE FUNCTION public.enqueue_pending_knowledge(','\n$$;'));
  legacy = await fixture();
  installationBefore = await installationState();
  await db.exec(await readFile(new URL('supabase/migrations/20261023103232_embeddings_domain.sql',root),'utf8'));
},30000);
afterAll(async()=>{ if (db) await db.close(); });
async function fixture() {
  const account=randomUUID(),ticket=randomUUID(),article=randomUUID();
  await query('INSERT INTO accounts(id) VALUES($1)',[account]);
  await query("INSERT INTO tickets(id,account_id,subject,body_plain,status) VALUES($1,$2,'Acme access','Invented case','resolved')",[ticket,account]);
  await query("INSERT INTO kb_articles(id,account_id,title,content,is_published) VALUES($1,$2,'Acme policy','Invented approved instructions',true)",[article,account]);
  const [{id:version}] = await query<{id:string}>('SELECT id FROM current_knowledge WHERE source_id=$1',[article]);
  return {account,ticket,article,version};
}
async function index(account: string,kind: string,id: string,model='acme',revision?: string) {
  const [{source}] = await query<{source:{revision:string;preparation:string}}>('SELECT semantic_source($1,$2,$3) AS source',[account,kind,id]);
  return (await query<{status:string}>('SELECT store_semantic_index($1,$2,$3,$4,$5,$6,$7,768,$8::extensions.vector) AS status',
    [account,kind,id,revision ?? source.revision,source.preparation,'synthetic',model,vec]))[0].status;
}
async function search(account: string,kind: string,ticket?: string) {
  return (await query<{result:{status:string;reason?:string;matches:Array<{source:{id:string};version?:string;method:string;similarity?:number}>}}>(
    'SELECT retrieve_semantic_sources($1,$2,$3,$4::extensions.vector,$5,$6,768,$7,0.75,12,$8,false,NULL) AS result',
    [account,kind,kind==='ticket'?'similar_cases':'approved_knowledge',vec,'synthetic','acme',ticket ?? null,kind==='ticket'?'resolved,ai_resolved':null]))[0].result;
}
const adapterDb = {
  async rpc(name: string, args: Record<string, unknown>) {
    const entries = Object.entries(args);
    const parameters = entries.map(([key], index) => key === 'p_ids'
      ? `${key}=>ARRAY(SELECT jsonb_array_elements_text($${index + 1}::jsonb)::uuid)`
      : `${key}=>$${index + 1}${key === 'p_query' || key === 'p_embedding' ? '::extensions.vector' : ''}`).join(',');
    const values = entries.map(([key, value]) => ['p_query','p_embedding','p_ids'].includes(key) ? JSON.stringify(value) : value);
    if (name === 'semantic_sources') return { data: await query(`SELECT * FROM ${name}(${parameters})`, values), error: null };
    const [{ result }] = await query<{result:unknown}>(`SELECT ${name}(${parameters}) AS result`, values);
    return { data: result, error: null };
  },
} as unknown as SupabaseClient;
describe.skipIf(!runSql)('semantic SQL guarantees',()=>{
  it('installs the service without rewriting business data or queueing work', async () => {
    expect(await installationState()).toEqual(installationBefore);
    expect(await query("SELECT id FROM decision_work_items WHERE account_id=$1 AND contract='semantic_index'",[legacy.account])).toHaveLength(0);
    expect(await query('SELECT source_id FROM semantic_indexes WHERE account_id=$1',[legacy.account])).toHaveLength(0);
    expect((await search(legacy.account,'knowledge_version')).reason).toBe('index_missing');
  });
  it('indexes every initial source without rewriting any business representation', async () => {
    const f = await fixture();
    const before = await installationState();
    for (const [kind,id] of [['ticket',f.ticket],['kb_article',f.article],['knowledge_version',f.version]]) {
      expect(await index(f.account,kind!,id!)).toBe('indexed');
    }
    expect(await installationState()).toEqual(before);
    expect(await query('SELECT source_id FROM semantic_indexes WHERE account_id=$1',[f.account])).toHaveLength(3);
  });
  it('reads and groups compatible indices through the public batch contract without generating vectors', async () => {
    const f = await fixture(), other = await fixture();
    await index(f.account,'ticket',f.ticket); await index(other.account,'ticket',other.ticket);
    const embed = mock(async () => { throw new Error('Reading stored indices must not generate vectors'); });
    const service = createBackendSemanticService({ db: adapterDb, embed, space: { provider: 'synthetic', model: 'acme', dimensions: 768 },
      scope: { accountId: f.account, actor: { kind: 'workflow', id: 'synthetic' }, permissions: ['retrieve'] } });
    const sources = [f.ticket,other.ticket].map(id => ({ kind: 'ticket', id }));
    expect(await service.readIndexes({ sources })).toMatchObject([{ status: 'ready' }, { status: 'unavailable', reason: 'not_found' }]);
    expect(await service.groupSources({ sources })).toMatchObject({ status: 'partial', groups: [[sources[0]]] });
    expect(embed).not.toHaveBeenCalled();
  });
  it('does not invent identity for legacy vectors and never compares different models',async()=>{
    const f=await fixture();
    expect((await search(f.account,'knowledge_version')).reason).toBe('index_missing');
    await query('UPDATE kb_articles SET embedding=$2::extensions.vector WHERE id=$1',[f.article,vec]);
    expect((await search(f.account,'knowledge_version')).reason).toBe('index_incompatible');
    await index(f.account,'knowledge_version',f.version,'other-model');
    expect((await search(f.account,'knowledge_version')).reason).toBe('index_incompatible');
    expect((await search(f.account,'knowledge_version')).matches).toEqual([]);
    await index(f.account,'knowledge_version',f.version);
    expect((await search(f.account,'knowledge_version')).matches[0]?.version).toBe(f.version);
  });
  it('rejects foreign source references even with privileged access',async()=>{
    const f=await fixture(),other=await fixture();
    expect((await query<{source:unknown}>('SELECT semantic_source($1,$2,$3) AS source',[other.account,'ticket',f.ticket]))[0].source).toBeNull();
    expect((await search(other.account,'ticket',f.ticket)).reason).toBe('not_found');
  });
  it('uses CAS for late writes and replaces an index without duplicating rows',async()=>{
    const f=await fixture();
    const [{source}] = await query<{source:{revision:string}}>('SELECT semantic_source($1,$2,$3) AS source',[f.account,'ticket',f.ticket]);
    await query("UPDATE tickets SET body_plain='New invented body' WHERE id=$1",[f.ticket]);
    expect(await index(f.account,'ticket',f.ticket,'acme',source.revision)).toBe('revision_changed');
    await index(f.account,'ticket',f.ticket); await index(f.account,'ticket',f.ticket);
    expect(await query('SELECT source_id FROM semantic_indexes WHERE account_id=$1',[f.account])).toHaveLength(1);
  });
  it('rejects a knowledge vector when publication changes while the provider is running', async () => {
    const f = await fixture();
    const service = createBackendSemanticService({ db: adapterDb, space:{provider:'synthetic',model:'acme',dimensions:768},
      scope:{accountId:f.account,actor:{kind:'workflow',id:'publication-race'},permissions:['index']},
      embed:async()=>{
        await query('UPDATE kb_articles SET is_published=false WHERE id=$1',[f.article]);
        return JSON.parse(vec) as number[];
      } });
    expect(await service.indexSource({source:{kind:'knowledge_version',id:f.version}})).toEqual({status:'failed',reason:'revision_changed'});
    expect(await query('SELECT source_id FROM semantic_indexes WHERE account_id=$1',[f.account])).toHaveLength(0);
  });
  it('excludes superseded, withdrawn and rejected knowledge and avoids legacy duplicates',async()=>{
    const f=await fixture(); await index(f.account,'knowledge_version',f.version);
    expect((await search(f.account,'kb_article')).matches).toHaveLength(0);
    for (const status of ['pending_review','rejected','approved','withdrawn']) {
      await query("UPDATE kb_articles SET is_published=$2,review_status=$3,content=content||' updated' WHERE id=$1",[f.article,status==='approved',status]);
      expect((await search(f.account,'knowledge_version')).matches.some(match=>match.version===f.version)).toBe(false);
    }
  });
  it('returns an explicit approved link without pretending it has a similarity score',async()=>{
    const f=await fixture();
    // Immutable versions are inserted by source publication; this synthetic source has an explicit case link.
    await query("INSERT INTO knowledge_versions(account_id,source_kind,source_id,status,snapshot) VALUES($1,'learning',$2,'approved',jsonb_build_object('summary','Invented policy','ticket_ids',jsonb_build_array($3::text)))",[f.account,randomUUID(),f.ticket]);
    await index(f.account,'knowledge_version',f.version);
    const result=await search(f.account,'knowledge_version',f.ticket);
    const linked=result.matches.find(match=>match.method==='explicit_link');
    expect(linked).toBeDefined(); expect(linked?.similarity).toBeNull();
  });
  it('treats a successful empty account differently from missing indices',async()=>{
    const account=randomUUID(); await query('INSERT INTO accounts(id) VALUES($1)',[account]);
    expect(await search(account,'knowledge_version')).toMatchObject({status:'ok',matches:[]});
  });
  it('uses real SQL through backend adapters, including cache reuse and canonical preparation', async () => {
    const f = await fixture();
    const embed = mock(async (_text: string) => JSON.parse(vec) as number[]);
    const service = createBackendSemanticService({ db: adapterDb, embed, space: {provider:'synthetic',model:'acme',dimensions:768},
      scope: {accountId:f.account,actor:{kind:'workflow',id:'synthetic'},permissions:['retrieve','index'],ticketId:f.ticket} });
    expect((await service.indexSource({source:{kind:'ticket',id:f.ticket}})).status).toBe('indexed');
    expect(embed).toHaveBeenCalledWith('Acme access\n\nInvented case');
    expect((await service.indexSource({source:{kind:'ticket',id:f.ticket}})).status).toBe('unchanged');
    embed.mockClear();
    expect((await service.retrieve({purpose:'similar_cases',query:{source:{kind:'ticket',id:f.ticket}},sources:['ticket']})).status).toBe('ok');
    expect(embed).not.toHaveBeenCalled();
  });
  it('shares approved version references between ticket context and the agent memory tool', async () => {
    const f = await fixture(); await index(f.account,'knowledge_version',f.version);
    const deps = {space:{provider:'synthetic',model:'acme',dimensions:768},embed:async()=>JSON.parse(vec) as number[]};
    const context = await findRelevantKb({accountId:f.account,ticketId:f.ticket,queryText:'Acme'}, {supabase:adapterDb,...deps});
    expect(context.degraded).toEqual([]);
    expect(context.articles[0]).toMatchObject({id:f.article,evidence:{version:f.version,authority:'approved_knowledge'}});
    const result = await sharedAgentTools({feature:'synthetic',accountId:f.account}, {
      db:adapterDb, tenantSettings:async()=>({language:'en',businessContext:'Acme support.'}), approvedLearnings:async()=>[],
      approvedKnowledge:(account,query,ticket,storage)=>approvedWorkflowKnowledge(account,query,ticket,storage,deps),
    }).read_account_memory!.execute({query:'Acme'});
    expect(result).toMatchObject({status:'completed',missing:[],data:{approvedKnowledge:[{id:f.article,version:f.version}]}});
  });
  it('keeps indexed cases valid after status changes and handles every allowed final status', async () => {
    const f = await fixture(); await index(f.account,'ticket',f.ticket);
    for (const status of ['open','awaiting_customer','in_progress','resolved','ai_resolved','escalated','reopened','closed']) {
      await query('UPDATE tickets SET status=$2 WHERE id=$1',[f.ticket,status]);
      const result = await search(f.account,'ticket');
      expect(result.matches.length).toBe(['resolved','ai_resolved'].includes(status) ? 1 : 0);
      expect(result.status).toBe('ok');
    }
  });
  it('leaves source selection with the application consumer instead of scheduling work on source edits', async () => {
    const f = await fixture();
    const count = async () => (await query<{n:number}>("SELECT count(*)::integer AS n FROM decision_work_items WHERE ticket_id=$1 AND contract='semantic_index'",[f.ticket]))[0].n;
    expect(await count()).toBe(0);
    await query("UPDATE tickets SET body_plain='Changed Acme text' WHERE id=$1",[f.ticket]);
    await query("UPDATE tickets SET body_plain='Invented case' WHERE id=$1",[f.ticket]);
    expect(await count()).toBe(0);
    expect(await maybeGenerateTicketEmbedding({supabase:adapterDb,accountId:f.account,ticketId:f.ticket,subject:'Caller copy',bodyPreview:'Caller copy',
      space:{provider:'synthetic',model:'acme',dimensions:768},embedFn:async()=>JSON.parse(vec) as number[]})).toEqual({status:'ok'});
    expect(await query('SELECT source_id FROM semantic_indexes WHERE account_id=$1',[f.account])).toHaveLength(1);
  });
  it('lets the workflow consume compatible vectors without copying them to business tables', async () => {
    const f = await fixture();
    await query("UPDATE tickets SET status='open' WHERE id=$1",[f.ticket]);
    await index(f.account,'ticket',f.ticket,'other-model'); await index(f.account,'knowledge_version',f.version);
    expect((await query<{queued:number}>('SELECT enqueue_knowledge_candidates($1) AS queued',[f.version]))[0].queued).toBe(0);
    expect(await query("SELECT id FROM decision_work_items WHERE account_id=$1 AND contract='knowledge_impact'",[f.account])).toHaveLength(0);
    await index(f.account,'ticket',f.ticket);
    expect((await query<{queued:number}>('SELECT enqueue_knowledge_candidates($1) AS queued',[f.version]))[0].queued).toBe(1);
    expect(await query("SELECT id FROM decision_work_items WHERE account_id=$1 AND contract='knowledge_impact'",[f.account])).toHaveLength(1);
  });
  it('prevents browser credentials from executing privileged index functions', async () => {
    await db.exec('SET ROLE authenticated');
    try {
      await expect(query('SELECT semantic_source($1,$2,$3)',[legacy.account,'ticket',legacy.ticket])).rejects.toMatchObject({code:'42501'});
    } finally { await db.exec('RESET ROLE'); }
  });
});

const runOllama = runSql && process.env['RUN_OLLAMA_EMBEDDING_TESTS'] === '1';

describe.skipIf(!runOllama)('Ollama semantic integration — real local embeddings', () => {
  const endpoint = 'http://127.0.0.1:11434';
  const model = 'nomic-embed-text-v2-moe';
  const provider = new OllamaEmbeddingProvider(endpoint, model, 768);
  const space = { provider: 'ollama', model, dimensions: 768 };
  let originalFetch: typeof fetch;

  beforeAll(async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== endpoint) throw new Error('Ollama integration tests only permit loopback HTTP on port 11434');
      return originalFetch(input, { ...init, redirect: 'error' });
    }) as typeof fetch;
    const response = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(5000) });
    expect(response.ok).toBe(true);
    const tags = await response.json() as { models: { name: string }[] };
    if (!tags.models.some(entry => entry.name === model || entry.name === `${model}:latest`)) {
      throw new Error('Install the local model first: ollama pull nomic-embed-text-v2-moe');
    }
  }, 10000);
  afterAll(() => { if (originalFetch) globalThis.fetch = originalFetch; });

  async function liveFixture() {
    const account = randomUUID();
    await query('INSERT INTO accounts(id) VALUES($1)', [account]);
    const password = randomUUID(), delivery = randomUUID();
    await query(`INSERT INTO kb_articles(id,account_id,title,content,is_published) VALUES
      ($1,$3,'Password recovery','To reset an Acme login password, open the sign-in page, choose Forgot password and follow the password reset link.',true),
      ($2,$3,'Delivery tracking','To track an Acme parcel shipment, open the delivery tracking page and enter the carrier tracking number.',true)`,
    [password,delivery,account]);
    const versions = await query<{id:string;source_id:string}>('SELECT id,source_id FROM current_knowledge WHERE account_id=$1', [account]);
    const passwordVersion = versions.find(entry => entry.source_id === password)!.id;
    const deliveryVersion = versions.find(entry => entry.source_id === delivery)!.id;
    let calls = 0;
    const embed = async (text: string) => { calls++; return provider.embed(text); };
    const service = createBackendSemanticService({ db:adapterDb,space,embed,profile:{threshold:0},
      scope:{accountId:account,actor:{kind:'workflow',id:'ollama-integration'},permissions:['index','retrieve']} });
    for (const id of [passwordVersion,deliveryVersion]) {
      expect((await service.indexSource({source:{kind:'knowledge_version',id}})).status).toBe('indexed');
    }
    return {account,password,passwordVersion,deliveryVersion,service,embed,calls:()=>calls};
  }

  it('gets finite nonzero 768-dimensional vectors from the actual Ollama provider', async () => {
    const embedding = await provider.embed('Reset the Acme account password.');
    expect(embedding).toHaveLength(768);
    expect(embedding.every(Number.isFinite)).toBe(true);
    expect(embedding.some(value => value !== 0)).toBe(true);
  }, 180000);

  it('stores real embeddings and does not regenerate an unchanged version', async () => {
    const f = await liveFixture();
    const before = f.calls();
    expect((await f.service.indexSource({source:{kind:'knowledge_version',id:f.passwordVersion}})).status).toBe('unchanged');
    expect(f.calls()).toBe(before);
    const rows = await query<{provider:string;model:string;dimensions:number}>(
      'SELECT provider,model,dimensions FROM semantic_indexes WHERE account_id=$1', [f.account]);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.provider === 'ollama' && row.model === model && row.dimensions === 768)).toBe(true);
  }, 180000);

  it('ranks a password paraphrase above an unrelated delivery article using pgvector', async () => {
    const f = await liveFixture();
    // A permissive test profile measures relative ranking, not production threshold calibration.
    const found = await f.service.retrieve({purpose:'approved_knowledge',sources:['knowledge_version'],
      query:{text:'How do I regain access when I have forgotten my login password?'}});
    expect(found.status).toBe('ok');
    expect(found.matches[0]?.version).toBe(f.passwordVersion);
    expect(found.matches[0]?.similarity).toBeGreaterThan(found.matches.find(match => match.version === f.deliveryVersion)?.similarity ?? -1);
  }, 180000);

  it('never returns another account knowledge even when its wording is identical', async () => {
    const f = await liveFixture(), other = await liveFixture();
    const found = await f.service.retrieve({purpose:'approved_knowledge',sources:['knowledge_version'],query:{text:'Acme password recovery'}});
    expect(found.status).toBe('ok');
    expect(found.matches.length).toBeGreaterThan(0);
    expect(found.matches.every(match => match.version === f.passwordVersion || match.version === f.deliveryVersion)).toBe(true);
    expect(found.matches.some(match => match.version === other.passwordVersion)).toBe(false);
  }, 180000);

  it('stops returning withdrawn knowledge even though its real embedding remains stored', async () => {
    const f = await liveFixture();
    await query('UPDATE kb_articles SET is_published=false WHERE id=$1', [f.password]);
    const found = await f.service.retrieve({purpose:'approved_knowledge',sources:['knowledge_version'],query:{text:'Acme password recovery'}});
    expect(found.status).toBe('ok');
    expect(found.matches.some(match => match.version === f.passwordVersion)).toBe(false);
    expect(await query('SELECT source_id FROM semantic_indexes WHERE source_id=$1', [f.passwordVersion])).toHaveLength(1);
  }, 180000);

  it('executes the agent memory tool using real local retrieval and approved version references', async () => {
    const f = await liveFixture();
    const result = await sharedAgentTools({feature:'ollama-integration',accountId:f.account}, {
      db:adapterDb,tenantSettings:async()=>({language:'en',businessContext:'Acme support.'}),approvedLearnings:async()=>[],
      approvedKnowledge:(account,text,ticket,storage)=>approvedWorkflowKnowledge(account,text,ticket,storage,{space,embed:f.embed,threshold:0}),
    }).read_account_memory!.execute({query:'I forgot my login password'});
    expect(result).toMatchObject({status:'completed',missing:[],authorization:'read'});
    expect((result.data['approvedKnowledge'] as {version:string}[]).some(reference => reference.version === f.passwordVersion)).toBe(true);
  }, 180000);
});
