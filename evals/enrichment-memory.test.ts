import { expect, test } from 'bun:test';
import { collectMemoryProposals, reviewedMemory } from './enrichment-memory';

const row = (dataset: string) => ({status:'completed',case:{id:1,dataset,body:'Acme provides account recovery.'},output:{tables:{
  operational_learning:[{status:'pending_review',summary:'Account recovery is available.',evidence:{title:'Recovery',quotes:['account recovery'],reasons:['human_validation_required']}}],kb_articles:[],
}}});

test('imports real-dataset proposals without synthetic controls or automatic approval',()=>{
  const proposals=collectMemoryProposals({rows:[row('main'),row('synthetic')]},'main');
  expect(proposals).toHaveLength(1);
  expect(proposals[0]).toMatchObject({sourcePosition:1,decision:'pending_review',reviewer:'',targetPositions:[],evidence:['account recovery']});
  expect(()=>reviewedMemory(proposals,proposals,[1])).toThrow('EVAL_REVIEW_NO_APPROVALS');
});

test('requires an explicit reviewer and existing target positions before loading approved memory',()=>{
  const original=collectMemoryProposals({rows:[row('main')]},'main');
  const accepted={...original[0]!,decision:'approved' as const,reviewer:'reviewer',targetPositions:[2]};
  expect(()=>reviewedMemory(original,[{...accepted,reviewer:''}],[1,2])).toThrow('EVAL_REVIEW_APPROVAL_INCOMPLETE');
  expect(()=>reviewedMemory(original,[accepted],[1])).toThrow('EVAL_REVIEW_APPROVAL_INCOMPLETE');
  expect(reviewedMemory(original,[accepted],[1,2])).toEqual({cases:[{position:2,knowledge:[{content:accepted.content,status:'approved'}]}]});
});

test('rejects altered source knowledge and preserves reviewed exclusions',()=>{
  const original=collectMemoryProposals({rows:[row('main')]},'main');
  expect(()=>reviewedMemory(original,[{...original[0]!,content:'Invented policy.'}],[1])).toThrow('EVAL_REVIEW_SOURCE_CHANGED');
  expect(()=>reviewedMemory(original,[{...original[0]!,decision:'rejected'}],[1])).toThrow('EVAL_REVIEW_NO_APPROVALS');
});

test('approved knowledge without manual targets becomes a pool for automatic candidate selection',()=>{
 const original=collectMemoryProposals({rows:[row('main')]},'main');
 const accepted={...original[0]!,decision:'approved' as const,reviewer:'reviewer',targetPositions:[]};
 expect(reviewedMemory(original,[accepted],[1,2])).toMatchObject({cases:[],approvedPool:[{id:1,content:accepted.content}]});
});
