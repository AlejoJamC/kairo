import {expect,test,mock} from 'bun:test';
import {CandidateEmbeddingProvider} from './local-embedding';
test('uses the current embedding endpoint and explicit context truncation',async()=>{
 const original=globalThis.fetch;let sent:Record<string,unknown>={};
 globalThis.fetch=Object.assign(mock(async(input:unknown,init?:RequestInit)=>{
  expect(String(input)).toBe('http://localhost:11434/api/embed');sent=JSON.parse(String(init?.body));
  return Response.json({embeddings:[[0.2,0.8]]});
 }),original) as typeof fetch;
 try{expect(await new CandidateEmbeddingProvider('http://localhost:11434','acme/embedding',2).embed('Synthetic source')).toEqual([0.2,0.8]);expect(sent).toEqual({model:'acme/embedding',input:'Synthetic source',truncate:true});}
 finally{globalThis.fetch=original;}
});
test('does not accept empty vectors or hide HTTP status',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [response,message] of [[Response.json({embeddings:[]}),'EVAL_EMBEDDING_INVALID'],[new Response('',{status:500}),'EVAL_OLLAMA_HTTP_500']] as const){
   globalThis.fetch=Object.assign(async()=>response,original) as typeof fetch;
   await expect(new CandidateEmbeddingProvider('http://localhost:11434','acme/embedding',2).embed('Synthetic source')).rejects.toThrow(message);
  }
 }finally{globalThis.fetch=original;}
});
