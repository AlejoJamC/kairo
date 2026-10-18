import type { EmbeddingProvider } from '../packages/intelligence/src/providers/base';

/** Candidate vectors are local to the evaluation, not written to production storage. */
export class CandidateEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private endpoint: string;
  constructor(endpoint: string, model: string, dimensions: number) {
    this.endpoint=endpoint;this.model=model;this.dimensions=dimensions;
  }
  async embed(text:string):Promise<number[]> {
    const response=await fetch(`${this.endpoint}/api/embed`,{method:'POST',redirect:'error',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.model,input:text,truncate:true}),
      signal:AbortSignal.timeout(120_000)});
    if(!response.ok)throw new Error(`EVAL_OLLAMA_HTTP_${response.status}`);
    const data=await response.json() as {embeddings?:number[][]};
    const vector=data.embeddings?.[0];
    if(data.embeddings?.length!==1 || !Array.isArray(vector) || vector.length!==this.dimensions || vector.some(v=>!Number.isFinite(v)))throw new Error('EVAL_EMBEDDING_INVALID');
    return vector;
  }
  async embedBatch(texts:string[]):Promise<number[][]> {
    const vectors:number[][]=[];
    for(const text of texts)vectors.push(await this.embed(text));
    return vectors;
  }
}
