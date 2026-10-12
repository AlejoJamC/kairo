import { loadPromptTemplate, extractPromptVersion } from '../harness/template';
import { buildTicketVerdictQuestions } from './decision-questions';
import { describe, expect, it } from 'bun:test';
import { attentionRecommendation, workflowContract, workflowFields, workflowLanguageSchema } from './workflow-contract';
import { buildPrompt, getPromptVersion } from './prompt';
import { groundWorkflowAnalysis, supportedNextAction, type WorkflowAnalysis } from './workflow-analysis';

const message = { subject: 'Access issue', body: 'I need help with access.', from: 'client@outside.com' };
const unknowns = { request:'unknown', priority_evidence:'unknown', urgency_evidence:'unknown' };
describe('workflow boundaries', () => {
  it('uses bounded onboarding questions and never demands historical outcomes or a solution', async () => {
    expect(workflowFields('onboarding')).toEqual(['request','priority_evidence','urgency_evidence']);
    expect(workflowLanguageSchema('onboarding').safeParse(unknowns).success).toBe(true);
    expect(await buildPrompt({ ...message, stage:'onboarding' },'en')).toContain('Do not investigate historical outcomes');
  });
  it('requires different outputs for history and incoming changes', () => {
    expect(workflowFields('backfill')).toContain('outcome');
    expect(workflowFields('backfill')).not.toContain('next_action');
    expect(workflowFields('new_email')).toContain('change');
    expect(workflowFields('new_email')).not.toContain('learning');
    expect(workflowLanguageSchema('backfill').safeParse({ ...unknowns,alternative:'unknown',change:'new_request',next_action:'respond' }).success).toBe(false);
    expect(workflowContract('manual')).toBe('message_triage');
  });
  it('bounds every isolated-message classification, including missing and manual stages', () => {
    for (const stage of [undefined, 'manual', 'backfill', 'new_email', 'onboarding'] as const) {
      const questions = buildTicketVerdictQuestions(stage);
      for (const field of ['outcome', 'learning', 'change', 'next_action']) expect(questions).not.toHaveProperty(field);
      expect(workflowLanguageSchema(stage, 'message').safeParse(unknowns).success).toBe(true);
    }
    expect(workflowContract(undefined)).toBe('message_triage');
  });
  it('versions the actual contract and composes historical drafting from the shared template', async () => {
    for (const lang of ['en', 'es'] as const) {
      const contract = await loadPromptTemplate('historical_learning', lang);
      expect(await getPromptVersion(lang, 'backfill')).toContain(`:historical_learning:${extractPromptVersion(contract)}:`);
      const shared = await loadPromptTemplate('email-knowledge', lang);
      const historical = await loadPromptTemplate('historical-knowledge', lang);
      expect(historical.split(shared)).toHaveLength(2);
      expect(extractPromptVersion(historical)).toContain(`+email-knowledge:${extractPromptVersion(shared)}`);
    }
  });
  it('records distinct prompt versions for each route', async () => {
    const versions = await Promise.all(['onboarding','backfill','new_email'].map(stage => getPromptVersion('en',stage as 'onboarding'|'backfill'|'new_email')));
    expect(new Set(versions).size).toBe(3);
  });
  it('keeps all nine attention recommendations separate from the queue score and preserves unknown urgency', () => {
    expect(['P1','P2','P3'].map(p => ['high','medium','low'].map(u => attentionRecommendation(p,u)))).toEqual([
      ['immediate','soon','monitor'], ['rapid','soon','normal'], ['rapid','normal','can_wait'],
    ]);
    expect(attentionRecommendation('P1',null)).toBe('unknown');
  });
});
describe('evidence and action limits', () => {
  const base: WorkflowAnalysis = { observations:[], missing:[], waitingOn:null, resumeWhen:null };
  it('does not turn a quoted threat into a verified loss', () => {
    const analysis = groundWorkflowAnalysis({ ...base, observations:[{ dimension:'impact',statement:'A loss is claimed.',status:'supported',citations:[{sourceId:'email',quote:'A fine will be charged.'}]}] },[{id:'email',text:'A fine will be charged.',authority:'message'}]);
    expect(analysis.observations[0]?.status).toBe('reported');
  });
  it('rejects fabricated quotes and records the missing support', () => {
    const analysis = groundWorkflowAnalysis({ ...base, observations:[{dimension:'alternative',statement:'A fallback is available.',status:'supported',citations:[{sourceId:'email',quote:'Use the backup.'}]}] },[{id:'email',text:'The system is down.',authority:'message'}]);
    expect(analysis.observations).toEqual([]);
    expect(analysis.missing).toContain('unsupported_alternative');
  });
  it('requires a responsible person and resumption condition before proposing a wait', () => {
    expect(supportedNextAction('wait',base,'agent')).toBe('request_information');
    expect(supportedNextAction('wait',{...base,waitingOn:'Customer',resumeWhen:'Customer supplies the missing reference.'},'agent')).toBe('wait');
    expect(supportedNextAction('resolve',base,'agent')).toBe('request_information');
  });
});
