import {expect,test} from 'bun:test';
import {selectBySimilarity,embeddingDimension,candidateSimilarityThreshold} from './enrichment-candidates';
test('starts candidate selection at 0.7 and preserves explicit higher thresholds',()=>{
 expect(candidateSimilarityThreshold(undefined)).toBe(0.7);
 for(const threshold of [0.7,0.8,0.9]) expect(candidateSimilarityThreshold(String(threshold))).toBe(threshold);
 for(const value of ['0.69','0.91','invalid']) expect(()=>candidateSimilarityThreshold(value)).toThrow('EVAL_CANDIDATE_CONFIG');
 const tickets=[{position:1,vector:[0.75,Math.sqrt(1-0.75**2)]}];
 const knowledge=[{id:1,vector:[1,0]}];
 expect(selectBySimilarity(tickets,knowledge,candidateSimilarityThreshold(undefined),25)).toHaveLength(1);
 expect(selectBySimilarity(tickets,knowledge,0.8,25)).toHaveLength(0);
});
test('selects candidates by vectors without manual destinations or relevance labels',()=>{
 expect(selectBySimilarity([{position:1,vector:[1,0]},{position:2,vector:[0,1]}],[{id:9,vector:[1,0]}],0.8,25)).toEqual([{position:1,knowledgeId:9,similarity:1}]);
});
test('applies the per-knowledge limit and rejects unusable vectors',()=>{
 expect(selectBySimilarity([{position:2,vector:[1,0]},{position:1,vector:[1,0]}],[{id:9,vector:[1,0]}],0.8,1)[0]?.position).toBe(1);
 expect(()=>selectBySimilarity([{position:1,vector:[0,0]}],[{id:9,vector:[1,0]}],0.8,1)).toThrow();
});

test('uses the declared local embedding dimension instead of database storage dimensions',()=>{
 expect(embeddingDimension({capabilities:['embedding'],model_info:{'example.embedding_length':768}})).toBe(768);
 expect(()=>embeddingDimension({capabilities:['completion'],model_info:{'example.embedding_length':768}})).toThrow('EVAL_MODEL_NOT_EMBEDDING');
 expect(()=>embeddingDimension({capabilities:['embedding'],model_info:{}})).toThrow('EVAL_EMBEDDING_METADATA');
});
