import { describe,expect,it } from 'bun:test';
import { ProviderError } from '@kairo/intelligence';
import { approvedWorkflowKnowledge,knowledgeEmbeddingText } from './workflow-knowledge.js';
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
