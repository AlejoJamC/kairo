import { describe, expect, it, mock, beforeEach } from 'bun:test';
// The workflow modules validate their environment on import; synthetic values keep this suite independent of file order.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
delete process.env['EMBEDDING_SIMILARITY_THRESHOLD'];
delete process.env['KNOWLEDGE_CANDIDATE_LIMIT'];
const decide = mock(async (_request: Record<string, unknown>): Promise<{data:{value:Record<string,unknown>;modelVersion:string};llmCallId:string}> => ({ data:{ value:{ contribution:{choice:'solution'} },modelVersion:'decision-model' },llmCallId:'decision-call' }));
const analyze = mock(async (_request: Record<string, unknown>) => ({ data:{ observations:[{dimension:'solution',statement:'Use the recovery procedure.',status:'supported',...(_request.promptId === 'knowledge-impact' ? {evidenceIds: (JSON.parse((_request.vars as {sources:string}).sources) as {id:string;authority:string}[]).filter(row => row.authority === 'approved_knowledge' || row.authority === 'message').map(row => row.id)} : {citations:[{sourceId:'version',quote:'Use account recovery.'}]})}],missing:[],waitingOn:null,resumeWhen:null },model:'draft-model',promptVersion:'1.0.0',llmCallId:'draft-call' }));
const propose = mock(async (_input: Record<string, unknown>) => ({status:'skipped',reason:'source_unavailable'}));
const embed = mock(async (_text: string) => [0.1, 0.2]);
const { processDecisionWork, recordWorkflowFailure } = await import('./decision-workflow');
type Deps = NonNullable<Parameters<typeof processDecisionWork>[2]>;
// Collaborators are injected: a module mock would leak into every other suite of the run.
const inject = (overrides: Partial<Deps> = {}): Deps => ({ decide: decide as unknown as Deps['decide'], analyze: analyze as unknown as Deps['analyze'],
  propose: propose as unknown as Deps['propose'], decisionProvider: () => ({ model: 'decision-model' }) as unknown as ReturnType<NonNullable<Deps['decisionProvider']>>,
  embed, ...overrides });
const version = { id:'version',source_id:'article',account_id:'account',source_kind:'article',revision:1,status:'approved',snapshot:{content:'Use account recovery.'} };
const work = {id:'job',account_id:'account',ticket_id:'ticket',message_id:'message',knowledge_version_id:'version',contract:'knowledge_impact',dedupe_key:'job'};
function database(options: { knowledge?:boolean; current?:boolean; existing?:boolean; persistStatus?:string; embedded?:boolean; clients?:Record<string,unknown>[]; contracts?:Record<string,unknown>[]; contacts?:Record<string,unknown>[] } = {}) {
  const saved: Record<string,unknown>[] = [];
  const rpc = mock(async (name:string,args:Record<string,unknown>) => {
    if (name === 'find_workflow_knowledge') return {data:options.knowledge === false ? [] : [version],error:null};
    saved.push(args); return {data:options.persistStatus ?? 'enriched',error:null};
  });
  const from = (table:string) => {
    const result = { error:null, data: table === 'tickets' ? {id:'ticket',account_id:'account',subject:'Access',body_plain:'Need account recovery.',case_revision:2,priority:'P2',model_verdict:{urgency:'medium'},conversation_id:'conversation',client_id:null,from_email:'client@outside.com',ticket_type:'support',assigned_to:null,status:'open',received_at:'2026-01-01T00:00:00Z'}
      : table === 'messages' ? [{id:'message',direction:'inbound',body_plain:'Need account recovery.',received_at:'2026-01-01T00:00:00Z'}]
      : table === 'accounts' ? {language:'en',business_context:'Acme provides account support.'}
      : table === 'current_knowledge' || table === 'knowledge_versions' ? options.current === false ? null : version
      : table === 'knowledge_embeddings' ? options.embedded ? {version_id:'version'} : null
      : table === 'clients' ? options.clients ?? []
      : table === 'draft_contact' ? options.contacts ?? []
      : table === 'tenant_sla_rules' ? options.contracts ?? []
      : table === 'ticket_decision_history' ? options.existing ? {id:'existing'} : null : [] };
    const chain = {select:()=>chain,eq:()=>chain,is:()=>chain,neq:()=>chain,order:()=>chain,limit:()=>chain,
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
    const {db}=database({existing:true});await processDecisionWork(work,db,inject());
    expect(decide).not.toHaveBeenCalled();expect(analyze).not.toHaveBeenCalled();
  });
  it('does not evaluate withdrawn or superseded versions',async()=>{
    const {db}=database({current:false});await processDecisionWork(work,db,inject());
    expect(decide).not.toHaveBeenCalled();
  });
  it('evaluates a scoped contribution and passes the exact case revision to atomic persistence',async()=>{
    const {db,saved}=database();await processDecisionWork(work,db,inject());
    expect(decide).toHaveBeenCalledTimes(1);expect(analyze).toHaveBeenCalledTimes(1);expect(propose).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({p_revision:2,p_version_id:'version',p_useful:true,p_result:{contribution:'solution',authorization:'human_review',sources:[{id:'article',version:'version'}]}});
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'knowledge-impact',modelRole:'evidence_analysis'});
  });
  it('does not persist missing knowledge references as an evaluation without contribution', async () => {
    for (const invalid of [false, true]) {
      const {db,saved} = database();
      const incomplete = async (request: Record<string, unknown>) => {
        const fragments = JSON.parse((request.vars as {sources:string}).sources) as {id:string;authority:string}[];
        return {data:{observations:[{dimension:'solution',statement:'Use recovery.',status:'supported',
          evidenceIds: invalid ? ['unknown-fragment'] : [fragments.find(row => row.authority === 'message')!.id]}],
          missing:[],waitingOn:null,resumeWhen:null},model:'evidence',promptVersion:'1.1.0',llmCallId:'call'};
      };
      await expect(processDecisionWork(work,db,inject({analyze:incomplete as unknown as Deps['analyze']}))).rejects.toMatchObject({retriable:true});
      expect(saved).toHaveLength(0);
    }
  });
  it('allows an explicit absence of applicable evidence without inventing a contribution', async () => {
    const {db,saved}=database();
    const empty = async () => ({data:{observations:[],missing:['applicability'],waitingOn:null,resumeWhen:null},model:'evidence',promptVersion:'1.1.0',llmCallId:'call'});
    await processDecisionWork(work,db,inject({analyze:empty as unknown as Deps['analyze']}));
    expect(saved[0]).toMatchObject({p_useful:false});
  });
  it('evaluates an initial ticket using its content even when enrichment has no incoming message',async()=>{
    const {db,saved}=database();
    await processDecisionWork({...work,message_id:null},db,inject());
    expect(decide.mock.calls[0]?.[0]).toMatchObject({state:{source:null,case:{
      subject:'Access',body:'Need account recovery.',messages:[{body_plain:'Need account recovery.'}],
    }}});
    expect(saved[0]).toMatchObject({p_useful:true,p_revision:2});
    const context = JSON.parse((analyze.mock.calls[0]![0]['vars'] as {context:string}).context);
    expect(context.case).toMatchObject({body:'Need account recovery.',status:'open'});
    expect(context.case.messages).toHaveLength(1);
    expect(context.approvedKnowledge).toHaveLength(1);
    expect(context).not.toHaveProperty('identity');
    expect(context).not.toHaveProperty('evidence');
    expect(context).not.toHaveProperty('assignedTo');

    expect(propose).not.toHaveBeenCalled();
  });
  it('retries against fresh context after a concurrent case change',async()=>{
    const {db}=database({persistStatus:'stale_case'});
    await expect(processDecisionWork(work,db,inject())).rejects.toMatchObject({retriable:true});
  });
  it('reconstructs history without asking for a new operational action',async()=>{
    const {db,saved}=database();
    decide.mockImplementationOnce(async()=>({data:{value:answers('historical'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'historical_learning'},db,inject());
    const request = decide.mock.calls[0]?.[0];
    expect(Object.keys(request?.['questions'] as object)).toContain('outcome');
    expect(Object.keys(request?.['questions'] as object)).not.toContain('next_action');
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'historical-analysis',options:{maxTokens:8192}});
    expect(propose.mock.calls[0]?.[0]).toMatchObject({stage:'backfill'});
    expect(saved[0]).toMatchObject({contract:'historical_learning',result:{authorization:'human_review',execution:'not_executed'}});
  });
  it('preserves unaffected impact decisions when handling a follow-up',async()=>{
    const {db,saved}=database();
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject());
    const questions = decide.mock.calls[0]?.[0]?.['questions'] as object;
    expect(Object.keys(questions)).toContain('change');
    expect(Object.keys(questions)).not.toContain('priority');
    expect(Object.keys(questions)).not.toContain('urgency');
    expect(analyze.mock.calls[0]?.[0]).toMatchObject({promptId:'incoming-analysis'});
    expect(saved[0]).toMatchObject({result:{classificationProposal:{},attention:'unknown',nextAction:'request_information'}});
  });

  it('verifies an authorized sender and applies the contract of its capitalized plan',async()=>{
    const {db,saved}=database({ clients:[{id:'client-outside',plan_type:'Enterprise',sla_level:'Critical',authorized_emails:['Client@Outside.com']}],
      contracts:[{id:'enterprise-support',ticket_type:'support',plan_tier:'enterprise',response_hours:1,resolution_hours:8}] });
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject());
    expect(saved[0]).toMatchObject({result:{identity:{clientId:'client-outside',authority:'authorized'},contractualSla:{id:'enterprise-support'}}});
    expect((saved[0] as {result:{evidence:{missing:string[]}}}).result.evidence.missing).not.toContain('verified_client');
  });
  it('keeps an unlisted sender unverified and reports the missing verification',async()=>{
    const {db,saved}=database({ clients:[{id:'client-outside',plan_type:'Pro',sla_level:'Standard',authorized_emails:['ops@outside.com']}] });
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject());
    expect(saved[0]).toMatchObject({result:{identity:{clientId:null,authority:'same_domain',candidateClientId:'client-outside'},contractualSla:null}});
    expect((saved[0] as {result:{evidence:{missing:string[]}}}).result.evidence.missing).toContain('verified_client');
  });

  it('identifies the sender from the contact pipeline when no client lists it',async()=>{
    const {db,saved}=database({ contacts:[{id:'contact-1',email:'client@outside.com',display_name:'Synthetic Person',organization:'Outside Logistics',status:'confirmed'}] });
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'decision-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject());
    expect(saved[0]).toMatchObject({result:{identity:{clientId:null,contact:{id:'contact-1',status:'confirmed'},sender:{email:'client@outside.com',organization:'Outside Logistics'}},contractualSla:null}});
  });

  it('uses the classification role for incoming decisions and does not invent a missing KB dependency', async () => {
    const {db,saved} = database({knowledge:false});
    const provider = mock((_role: 'classification' | 'knowledge_decision') => ({model:'classification-model'}) as ReturnType<NonNullable<Deps['decisionProvider']>>);
    decide.mockImplementationOnce(async()=>({data:{value:answers('incoming'),modelVersion:'classification-model'},llmCallId:'call'}));
    await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject({decisionProvider:provider}));
    expect(provider).toHaveBeenCalledWith('classification');
    expect(saved[0]).toMatchObject({status:'pending_human_review',result:{sources:[]}});
    expect((saved[0]?.result as {missing:string[]}).missing).not.toContain('approved_knowledge');
  });
  it('supports a language classification model for incoming case judgments', async () => {
    const {db,saved} = database();
    const before = process.env.CLASSIFICATION_MODE;
    process.env.CLASSIFICATION_MODE = 'language';
    try {
      const run = mock(async (request:Record<string,unknown>) => request.modelRole === 'classification'
        ? {data:Object.fromEntries(Object.entries(answers('incoming')).map(([key,value])=>[key,value.choice])),model:'language-classifier',llmCallId:'case-call',promptVersion:'1.0.0'}
        : analyze(request));
      await processDecisionWork({...work,contract:'incoming_email_decision'},db,inject({decisionProvider:undefined,analyze:run as unknown as Deps['analyze']}));
      expect(decide).not.toHaveBeenCalled();
      expect(run.mock.calls.map(([request])=>request.modelRole)).toEqual(['evidence_analysis','classification']);
      expect(saved[0]).toMatchObject({result:{model:'language-classifier',callId:'case-call'}});
    } finally { if(before === undefined) delete process.env.CLASSIFICATION_MODE; else process.env.CLASSIFICATION_MODE = before; }
  });
  it('records a failed attempt against its actual revision, or explicitly labels a later observation', async () => {
    for (const revision of [7,undefined]) {
      const {db,saved} = database();
      await recordWorkflowFailure({...work,case_revision:revision,attempts:1},{retriable:true,error:'processing_failed'},db);
      expect(saved[0]).toMatchObject({case_revision:revision ?? 2,status:'failed',result:{revisionSource:revision === undefined ? 'observed_after_failure' : 'attempted_case'}});
    }
  });

  it('embeds an approved version before selecting tickets, with the configured threshold and limit',async()=>{
    const {db,saved,rpc}=database(); const vector=mock(async (_text: string)=>[0.3,0.4]);
    await processDecisionWork({...work,contract:'knowledge_change',ticket_id:null,message_id:null},db,inject({embed:vector}));
    expect(vector).toHaveBeenCalledWith('Use account recovery.');
    expect(saved).toContainEqual(expect.objectContaining({version_id:'version',embedding:[0.3,0.4],source:'workflow'}));
    expect(rpc).toHaveBeenCalledWith('enqueue_knowledge_candidates',{p_version_id:'version',p_threshold:0.8,p_limit:25});
  });
  it('does not embed a version that already has a vector',async()=>{
    const {db}=database({embedded:true}); const vector=mock(async (_text: string)=>[0.3]);
    await processDecisionWork({...work,contract:'knowledge_change',ticket_id:null,message_id:null},db,inject({embed:vector}));
    expect(vector).not.toHaveBeenCalled();
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
