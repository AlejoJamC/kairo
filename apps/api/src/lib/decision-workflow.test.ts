import { describe, expect, it, mock, beforeEach, afterAll, spyOn } from 'bun:test';
const original = { ...await import('@kairo/intelligence') };
const decide = mock(async (_request: Record<string, unknown>): Promise<{data:{value:Record<string,unknown>;modelVersion:string};llmCallId:string}> => ({ data:{ value:{ contribution:{choice:'solution'} },modelVersion:'decision-model' },llmCallId:'decision-call' }));
const analyze = mock(async (_request: Record<string, unknown>) => ({ data:{ observations:[{dimension:'solution',statement:'Use the recovery procedure.',status:'supported',citations:[{sourceId:'version',quote:'Use account recovery.'}]}],missing:[],waitingOn:null,resumeWhen:null },model:'draft-model',promptVersion:'1.0.0',llmCallId:'draft-call' }));
const knowledgeModule = await import('./email-knowledge.js');
const propose = spyOn(knowledgeModule, 'proposeEmailKnowledge').mockResolvedValue({status:'skipped',reason:'source_unavailable'});
mock.module('@kairo/intelligence',()=>({...original,createDecisionProvider:()=>({model:'decision-model'}),runDecisionFeature:decide,runLlmFeature:analyze}));
afterAll(() => propose.mockRestore());
const { processDecisionWork } = await import('./decision-workflow');
const version = { id:'version',source_id:'article',account_id:'account',source_kind:'article',revision:1,status:'approved',snapshot:{content:'Use account recovery.'} };
const work = {id:'job',account_id:'account',ticket_id:'ticket',message_id:'message',knowledge_version_id:'version',contract:'knowledge_impact',dedupe_key:'job'};
function database(options: { current?:boolean; existing?:boolean; persistStatus?:string } = {}) {
  const saved: Record<string,unknown>[] = [];
  const rpc = mock(async (name:string,args:Record<string,unknown>) => {
    if (name === 'find_workflow_knowledge') return {data:[version],error:null};
    saved.push(args); return {data:options.persistStatus ?? 'enriched',error:null};
  });
  const from = (table:string) => {
    const result = { error:null, data: table === 'tickets' ? {id:'ticket',account_id:'account',subject:'Access',body_plain:'Need account recovery.',case_revision:2,priority:'P2',model_verdict:{urgency:'medium'},conversation_id:'conversation',client_id:null,assigned_to:null,status:'open',received_at:'2026-01-01T00:00:00Z'}
      : table === 'messages' ? [{id:'message',direction:'inbound',body_plain:'Need account recovery.',received_at:'2026-01-01T00:00:00Z'}]
      : table === 'accounts' ? {language:'en',business_context:'Acme provides account support.'}
      : table === 'current_knowledge' ? options.current === false ? null : version
      : table === 'ticket_decision_history' ? options.existing ? {id:'existing'} : null : [] };
    const chain = {select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,
      single:async()=> table === 'messages' ? {data:(result.data as unknown[])[0],error:null} : result,
      maybeSingle:async()=>result,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result).then(resolve),
      upsert:async(value:Record<string,unknown>)=>{saved.push(value);return {data:null,error:null};}};
    return chain;
  };
  return {db:{from,rpc} as unknown as NonNullable<Parameters<typeof processDecisionWork>[1]>,saved,rpc};
}
beforeEach(()=>{decide.mockClear();analyze.mockClear();propose.mockClear();});
describe('durable workflow execution',()=>{
  it('skips inference when that case and knowledge revision was already evaluated',async()=>{
    const {db}=database({existing:true});await processDecisionWork(work,db);
    expect(decide).not.toHaveBeenCalled();expect(analyze).not.toHaveBeenCalled();
  });
  it('does not evaluate withdrawn or superseded versions',async()=>{
    const {db}=database({current:false});await processDecisionWork(work,db);
    expect(decide).not.toHaveBeenCalled();
  });
  it('evaluates a scoped contribution and passes the exact case revision to atomic persistence',async()=>{
    const {db,saved}=database();await processDecisionWork(work,db);
    expect(decide).toHaveBeenCalledTimes(1);expect(analyze).toHaveBeenCalledTimes(1);expect(propose).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({p_revision:2,p_version_id:'version',p_useful:true,p_result:{contribution:'solution',authorization:'human_review',sources:[{id:'article',version:'version'}]}});
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'knowledge-impact',modelRole:'knowledge_draft'});
  });
  it('evaluates an initial ticket using its content even when enrichment has no incoming message',async()=>{
    const {db,saved}=database();
    await processDecisionWork({...work,message_id:null},db);
    expect(decide.mock.calls[0]?.[0]).toMatchObject({state:{source:null,case:{
      subject:'Access',body:'Need account recovery.',messages:[{body_plain:'Need account recovery.'}],
    }}});
    expect(saved[0]).toMatchObject({p_useful:true,p_revision:2});
    expect(propose).not.toHaveBeenCalled();
  });
  it('retries against fresh context after a concurrent case change',async()=>{
    const {db}=database({persistStatus:'stale_case'});
    await expect(processDecisionWork(work,db)).rejects.toMatchObject({retriable:true});
  });
  it('reconstructs history without asking for a new operational action',async()=>{
    const {db,saved}=database();
    decide.mockImplementationOnce(async()=>({data:{value:answers('historical'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'historical_learning'},db);
    const request = decide.mock.calls[0]?.[0];
    expect(Object.keys(request?.['questions'] as object)).toContain('outcome');
    expect(Object.keys(request?.['questions'] as object)).not.toContain('next_action');
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'historical-analysis'});
    expect(propose.mock.calls[0]?.[0]).toMatchObject({stage:'backfill'});
    expect(saved[0]).toMatchObject({contract:'historical_learning',result:{authorization:'human_review',execution:'not_executed'}});
  });
  it('preserves unaffected impact decisions when handling a follow-up',async()=>{
    const {db,saved}=database();
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db);
    const questions = decide.mock.calls[0]?.[0]?.['questions'] as object;
    expect(Object.keys(questions)).toContain('change');
    expect(Object.keys(questions)).not.toContain('priority');
    expect(Object.keys(questions)).not.toContain('urgency');
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'incoming-analysis'});
    expect(saved[0]).toMatchObject({result:{classificationProposal:{},attention:'unknown',nextAction:'request_information'}});
  });

});

function answers(stage:'historical'|'incoming') {
 const options:Record<string,string[]> = {
  request:['information','intervention','multiple','none','unknown'],priority_evidence:['supported','unknown','contradictory'],urgency_evidence:['supported','unknown','contradictory'],alternative:['available','unavailable','unknown'],
  ...(stage==='historical' ? {outcome:['confirmed','attempted','unresolved','unknown'],learning:['candidate','none','unknown']} : {change:['new_request','follow_up','new_evidence','confirmation','duplicate','unknown'],next_action:['request_information','respond','escalate','wait','resolve','none','unknown']}),
 };
 return Object.fromEntries(Object.entries(options).map(([key,values])=>{
  const selected = key==='next_action' ? 'request_information' : 'unknown';
  return [key,{type:'choice',choice:selected,confidence:1,probabilities:Object.fromEntries(values.map(value=>[value,Number(value===selected)]))}];
 }));
}
