import {expect,test} from 'bun:test';
import {applyReviewChoices, reviewPage} from './review-memory';
import type {MemoryProposal} from './enrichment-memory';
const proposal:MemoryProposal={id:1,sourcePosition:1,sourceText:'Acme source',title:'Example',content:'Example knowledge',evidence:[],reviewReasons:[],decision:'pending_review',reviewer:'',targetPositions:[]};
test('only explicit choices change review status and preserve source content',()=>{
 const result=applyReviewChoices([proposal],{reviewer:'reviewer',choices:[{id:1,decision:'approved',targetPositions:[2],content:'replacement'}]});
 expect(result[0]).toMatchObject({content:proposal.content,decision:'approved',reviewer:'reviewer',targetPositions:[]});
 expect(proposal.decision).toBe('pending_review');
});
test('rejects missing reviewers and duplicate selections',()=>{
 for(const value of [{reviewer:'',choices:[]},{reviewer:'r',choices:[{id:1,decision:'approved',targetPositions:[1]},{id:1,decision:'rejected',targetPositions:[]}]}])expect(()=>applyReviewChoices([proposal],value)).toThrow();
});

test('review page embeds executable JavaScript without broken newline escapes',()=>{
 const script=reviewPage.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 expect(script).toBeDefined();
 expect(()=>new Function(script!)).not.toThrow();
});

test('review page renders Spanish characters rather than Unicode escape literals',()=>{
 expect(reviewPage).toContain('afirmación');
 expect(reviewPage).not.toMatch(/\\u[0-9a-fA-F]{4}/);
});

test('reviewing source support does not require or invent target tickets',()=>{
 const result=applyReviewChoices([proposal],{reviewer:'r',choices:[{id:1,decision:'approved'}]});
 expect(result[0]?.decision).toBe('approved');
 expect(result[0]?.targetPositions).toEqual([]);
 expect(reviewPage).not.toContain("className='targets'");
});
