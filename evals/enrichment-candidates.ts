import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { CandidateEmbeddingProvider } from './local-embedding';
import { localOllamaEndpoint } from '../packages/intelligence/src/providers/ollama/local-endpoint';
import { createEmbeddingProvider } from '../packages/intelligence/src/config/providers';
import { resolveModelRoute } from '../packages/intelligence/src/config/model-roles';
import { readPrivate, writePrivate, writeHumanLabels } from './private-files';
import { memoryDirectory, enrichmentMemoryCommand } from './enrichment-memory';
import { loadCorpus } from './corpus';
import { resultsRoot } from './results';
import { guardNetwork } from './network';
import type { WorkflowMemory } from './workflow-scenarios';

export function selectBySimilarity(tickets: {position:number;vector:number[]}[], knowledge: {id:number;vector:number[]}[], threshold:number, limit:number) {
  function cosine(a:number[],b:number[]) {
    if(!a.length || a.length!==b.length || [...a,...b].some(v=>!Number.isFinite(v)))throw new Error('EVAL_EMBEDDING_INVALID');
    const norm=Math.sqrt(a.reduce((s,v)=>s+v*v,0)*b.reduce((s,v)=>s+v*v,0));
    if(!norm)throw new Error('EVAL_EMBEDDING_INVALID');
    return a.reduce((s,v,i)=>s+v*b[i]!,0)/norm;
  }
  return knowledge.flatMap(item=>tickets.map(ticket=>({position:ticket.position,knowledgeId:item.id,similarity:cosine(item.vector,ticket.vector)}))
    .filter(pair=>pair.similarity>=threshold).sort((a,b)=>b.similarity-a.similarity || a.position-b.position).slice(0,limit));
}
export function candidateSimilarityThreshold(value: string | undefined): number {
  const threshold = Number(value ?? 0.7);
  if (!Number.isFinite(threshold) || threshold < 0.7 || threshold > 0.9) throw new Error('EVAL_CANDIDATE_CONFIG');
  return threshold;
}
export async function selectEnrichmentCandidates(dataset:string) {
  if(dataset!=='main' && dataset!=='coverage')throw new Error('EVAL_ARGUMENTS');
  await enrichmentMemoryCommand(['apply-review',dataset]);
  const path=resolve(memoryDirectory(dataset),'approved-memory.json');
  const memory=JSON.parse(await readPrivate(path)) as WorkflowMemory & {review:unknown};
  const pool=memory.approvedPool ?? [];
  if(!pool.length)throw new Error('EVAL_REVIEW_NO_APPROVALS');
  const corpus=await loadCorpus(dataset);
  const threshold=candidateSimilarityThreshold(process.env['EMBEDDING_SIMILARITY_THRESHOLD']);
  const limit=Number(process.env['KNOWLEDGE_CANDIDATE_LIMIT'] ?? 25);
  if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('EVAL_CANDIDATE_CONFIG');
  const route=resolveModelRoute('embedding');
  const provider=await candidateEmbeddingProvider();
  const cachePath=resolve(resultsRoot,'enrichment',dataset,'candidate-embeddings.json');
  let cache:Record<string,number[]>={};
  try { cache=JSON.parse(await readPrivate(cachePath)); } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('EVAL_EMBEDDING_CACHE'); }
  const key=(text:string)=>createHash('sha256').update(JSON.stringify([route,provider.dimensions,route.provider==='ollama' ? 'api/embed' : 'gateway',text])).digest('hex');
  const ticketTexts=corpus.map(row=>({position:row.id,text:`${row.subject ?? ''}\n${row.body}`.trim().slice(0,2000)}));
  const knowledgeTexts=pool.map(row=>({id:row.id,text:`${row.title}\n${row.content}`.trim().slice(0,2000)}));
  const missing=new Map([...ticketTexts,...knowledgeTexts].filter(row=>!cache[key(row.text)]).map(row=>[key(row.text),row.text]));
  console.log(JSON.stringify({dataset,step:'candidate_selection',route,approvedKnowledge:pool.length,corpusCases:corpus.length,maximumEmbeddingCalls:missing.size,dimensions:provider.dimensions,threshold,candidateLimitPerKnowledge:limit}));
  const originalFetch=globalThis.fetch;
  let failedStatus:number|null=null;
  const diagnosticTransport=Object.assign(async (input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1])=>{
    const response=await originalFetch(input,init);
    if(!response.ok){failedStatus=response.status;await writePrivate(resolve(resultsRoot,'enrichment',dataset,'candidate-failure.json'),{route,status:response.status,body:await response.clone().text()});}
    return response;
  },originalFetch) as typeof fetch;
  const network=guardNetwork(Math.max(1,missing.size),diagnosticTransport);
  globalThis.fetch=network.fetch;
  try {
    for(const [id,text] of missing){cache[id]=await provider.embed(text);await writePrivate(cachePath,cache);}
  }catch(error){
    const message=error instanceof Error ? error.message : '';
    if(failedStatus!==null)throw new Error(`EVAL_EMBEDDING_HTTP_${failedStatus}`);
    if(/^EVAL_[A-Z_]+$/.test(message))throw error;
    if(message.includes('dimensions do not match'))throw new Error('EVAL_EMBEDDING_DIMENSION_MISMATCH');
    throw new Error('EVAL_EMBEDDING_REQUEST_FAILED');
  }finally{globalThis.fetch=originalFetch;}
  const pairs=selectBySimilarity(ticketTexts.map(row=>({position:row.position,vector:cache[key(row.text)]!})),knowledgeTexts.map(row=>({id:row.id,vector:cache[key(row.text)]!})),threshold,limit);
  const cases=new Map<number,WorkflowMemory['cases'][number]>();
  for(const pair of pairs){const target=cases.get(pair.position) ?? {position:pair.position,knowledge:[]};target.knowledge.push({content:pool.find(row=>row.id===pair.knowledgeId)!.content,status:'approved'});cases.set(pair.position,target);}
  await writeHumanLabels(path,{...memory,cases:[...cases.values()],selection:{route,threshold,limit,pairs,method:'cosine similarity over configured embeddings'}});
  return {dataset,approvedKnowledge:pool.length,candidatePairs:pairs.length,tickets:cases.size,embeddingRequests:network.requests.length,maximumEnrichmentCalls:pairs.length*2+14,ready:pairs.length>0};
}

export function embeddingDimension(metadata: unknown): number {
  if(!metadata || typeof metadata!=='object')throw new Error('EVAL_EMBEDDING_METADATA');
  const value=metadata as {capabilities?:unknown;model_info?:Record<string,unknown>};
  if(!Array.isArray(value.capabilities)||!value.capabilities.includes('embedding'))throw new Error('EVAL_MODEL_NOT_EMBEDDING');
  const dimensions=Object.entries(value.model_info ?? {}).filter(([key])=>key.endsWith('.embedding_length')).map(([,length])=>length);
  if(dimensions.length!==1 || typeof dimensions[0]!=='number' || !Number.isSafeInteger(dimensions[0]) || dimensions[0]<1)throw new Error('EVAL_EMBEDDING_METADATA');
  return dimensions[0];
}
async function candidateEmbeddingProvider() {
  const route=resolveModelRoute('embedding');
  if(route.provider!=='ollama')return createEmbeddingProvider();
  const endpoint=localOllamaEndpoint(process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434');
  let response:Response;
  try { response=await fetch(`${endpoint}/api/show`,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:route.model}),signal:AbortSignal.timeout(5000)}); }
  catch { throw new Error('EVAL_OLLAMA_UNAVAILABLE'); }
  if(response.status===404)throw new Error('EVAL_OLLAMA_MODEL_MISSING');
  if(!response.ok)throw new Error('EVAL_EMBEDDING_METADATA');
  // These vectors are compared in memory; production database dimensions do not apply.
  return new CandidateEmbeddingProvider(endpoint,route.model,embeddingDimension(await response.json()));
}
