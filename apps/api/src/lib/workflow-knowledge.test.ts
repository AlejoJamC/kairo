import { describe,expect,it,mock } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ProviderError } from '@kairo/intelligence';
import { approvedWorkflowKnowledge,enqueueWorkflowKnowledge,knowledgeEmbeddingText } from './workflow-knowledge.js';
import { backendFixture,space } from './semantic-service.test-fixture.js';
const knowledge = { id:'version',account_id:'acme',source_kind:'article' as const,source_id:'article',revision:1,status:'approved',snapshot:{ content:'Invented Acme instructions' } };
describe('approved workflow retrieval',()=>{
  it('preserves versioned evidence through the service',async()=>{
    const f = backendFixture('knowledge_version',{ knowledge_version:{ status:'ok',matches:[{ source:{kind:'knowledge_version',id:'article'},version:'version',revision:'r1',content:'Invented Acme instructions',authority:'approved_knowledge',method:'semantic',similarity:0.9,metadata:{knowledge} }] } });
    expect(await approvedWorkflowKnowledge('acme','Acme question',undefined,f.db,{embed:f.embed,space,threshold:0.85})).toEqual([knowledge]);
    expect(f.calls[0]?.args).toMatchObject({p_threshold:0.85,p_kind:'knowledge_version',p_account_id:'acme'});
  });
  it('blocks incomplete retrieval rather than claiming there is no knowledge',async()=>{
    const f = backendFixture('knowledge_version',{ knowledge_version:{status:'unavailable',reason:'index_missing',matches:[]} });
    await expect(approvedWorkflowKnowledge('acme','Acme',undefined,f.db,{embed:f.embed,space})).rejects.toBeInstanceOf(ProviderError);
  });
  it('keeps the version text preparation bounded',()=>{
    expect(knowledgeEmbeddingText({snapshot:{title:'Acme',content:'Instructions'}})).toBe('Acme\nInstructions');
    expect(knowledgeEmbeddingText({snapshot:{content:'x'.repeat(3000)}})).toHaveLength(2000);
  });
});

describe('knowledge scheduling consumer', () => {
  function storage(data: unknown, error: unknown = null, version: unknown = { id: 'version' }) {
    const rpc = mock(async (_name: string, _args: Record<string, unknown>) => ({ data, error }));
    const filters: Record<string, unknown> = {};
    const chain = { select: () => chain, eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      maybeSingle: async () => ({ data: version, error: null }) };
    const from = mock((_table: string) => chain);
    return { rpc, from, filters, db: { rpc, from } as unknown as SupabaseClient };
  }
  it('calls the existing account workflow without choosing models or traversing sources', async () => {
    const f = storage(3);
    await enqueueWorkflowKnowledge('acme', f.db);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith('enqueue_pending_knowledge', {
      p_account_id: 'acme', p_threshold: 0.8, p_limit: 25,
    });
    expect(f.from).not.toHaveBeenCalled();
  });
  it('checks ownership and retains the version selected by the publication workflow', async () => {
    const f = storage(0);
    await enqueueWorkflowKnowledge('acme', f.db, { versionId: 'version' });
    expect(f.filters).toEqual({ account_id: 'acme', id: 'version' });
    expect(f.rpc).toHaveBeenCalledWith('enqueue_knowledge_candidates', { p_version_id: 'version', p_threshold: 0.8, p_limit: 25 });
  });
  it('refuses a version outside the account before scheduling anything', async () => {
    const f = storage(0, null, null);
    await expect(enqueueWorkflowKnowledge('acme', f.db, { versionId: 'foreign' })).rejects.toBeInstanceOf(ProviderError);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('propagates invalid results and storage failures instead of claiming work completed', async () => {
    for (const f of [storage(-1), storage('invalid'), storage(null, { message: 'private storage details' })]) {
      await expect(enqueueWorkflowKnowledge('acme', f.db)).rejects.toBeInstanceOf(ProviderError);
    }
  });
});
