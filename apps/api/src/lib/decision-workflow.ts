import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  buildTicketVerdictQuestions, TicketAnswersSchema, knowledgeImpactQuestions, attentionRecommendation, createDecisionProvider, ProviderError, runDecisionFeature,
  workflowAnswersSchema, workflowQuestions, WORKFLOW_VERSION, runLlmFeature, WorkflowAnalysisSchema, groundWorkflowAnalysis, supportedNextAction, type WorkflowSource,
} from '@kairo/intelligence';
import { computeTicketOperationalSla, buildConfigByPriority } from '@kairo/types';
import { supabase } from './supabase.js';
import { recordLlmCall } from './llm-logging.js';
import { approvedWorkflowKnowledge, knowledgeReferences, KnowledgeVersionSchema } from './workflow-knowledge.js';
import { proposeEmailKnowledge } from './email-knowledge.js';

export interface DecisionWork {
  id: string; account_id: string; ticket_id: string | null; message_id: string | null;
  knowledge_version_id: string | null; contract: string; dedupe_key: string;
}
export function evaluationKey(ticketId: string, revision: number, versionId: string) {
  return `impact:${ticketId}:${revision}:${versionId}`;
}
export async function recordWorkflowResult(input: {
  accountId: string; ticketId: string; messageId?: string; contract: string; revision: number;
  status: string; result: unknown; key: string; userId?: string;
}, db = supabase) {
  const { error } = await db.from('ticket_decision_history').upsert({
    account_id: input.accountId, ticket_id: input.ticketId, message_id: input.messageId ?? null,
    contract: input.contract, contract_version: WORKFLOW_VERSION, case_revision: input.revision,
    status: input.status, result: input.result, idempotency_key: input.key, actor_user_id: input.userId ?? null,
  }, { onConflict: 'account_id,idempotency_key', ignoreDuplicates: true });
  if (error) throw new ProviderError('Decision history persistence failed', true);
}

async function ticketContext(work: DecisionWork, db = supabase) {
  const { data: ticket, error } = await db.from('tickets').select('*').eq('account_id', work.account_id).eq('id', work.ticket_id).maybeSingle();
  if (error || !ticket) throw new ProviderError('Decision ticket unavailable', true);
  const [messages, client, sla, settings, contracts, source, assignee] = await Promise.all([
    ticket.conversation_id ? db.from('messages').select('id,direction,body_plain,received_at').eq('account_id', work.account_id).eq('conversation_id', ticket.conversation_id).order('received_at', { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
    ticket.client_id ? db.from('clients').select('id,plan_type,sla_level,authorized_emails,contact_persons').eq('account_id', work.account_id).eq('id', ticket.client_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    db.from('ticket_priority_sla_config').select('*').eq('account_id', work.account_id),
    db.from('accounts').select('business_context,language').eq('id', work.account_id).single(),
    db.from('tenant_sla_rules').select('id,ticket_type,plan_tier,response_hours,resolution_hours').eq('account_id',work.account_id),
    work.message_id ? db.from('messages').select('id,direction,body_plain,received_at').eq('account_id',work.account_id).eq('id',work.message_id).single() : Promise.resolve({ data:null,error:null }),
    ticket.assigned_to ? db.from('account_members').select('user_id,role,status').eq('account_id',work.account_id).eq('user_id',ticket.assigned_to).maybeSingle() : Promise.resolve({ data:null,error:null }),
  ]);
  if (messages.error || client.error || sla.error || settings.error || contracts.error || source.error || assignee.error) throw new ProviderError('Decision context lookup failed', true);
  const history = [...(messages.data ?? [])].reverse().map(row => ({ ...row, body_plain: String(row.body_plain ?? '').slice(0,2000) }));
  const incoming = source.data ? { ...source.data, body_plain: String(source.data.body_plain ?? '').slice(0,8000) } : null;
  const versions = await approvedWorkflowKnowledge(work.account_id, [ticket.subject, incoming?.body_plain ?? ticket.body_plain].join('\n'), ticket.id, db);
  const sources: WorkflowSource[] = history.filter(row => row.id !== incoming?.id).map(row => ({ id: row.id as string, text: String(row.body_plain ?? ''), authority: 'message' }));
  if (incoming) sources.push({ id: incoming.id, text: incoming.body_plain ?? '', authority: 'message' });
  sources.push(...versions.map(row => ({ id: row.id, text: String(row.snapshot['content'] ?? row.snapshot['summary'] ?? '').slice(0,2000), authority: 'approved_knowledge' as const })));
  if (client.data) sources.push({ id: 'directory', text: JSON.stringify(client.data), authority: 'directory' });
  const contractualSla = contracts.data?.find(row => row.ticket_type === ticket.ticket_type && row.plan_tier === (client.data?.plan_type ?? 'none')) ?? null;
  sources.push({ id: 'configuration', text: JSON.stringify({ businessContext: settings.data?.business_context, contractualSla }), authority: 'configuration' });
  return { ticket, history, incoming, versions, sources, language: settings.data?.language === 'en' ? 'en' as const : 'es' as const,
    state: { source: incoming ?? null, previousCase: { status: ticket.status, verdict: ticket.model_verdict, messages: history.filter(row => row.id !== work.message_id && (!incoming || row.received_at <= incoming.received_at)).map(row => ({ id: row.id, direction: row.direction, receivedAt: row.received_at })) },
      businessContext: settings.data?.business_context?.slice(0,2500) ?? null, client: client.data,
      approvedKnowledge: knowledgeReferences(versions).map(ref => ({ ...ref, content: ref.content.slice(0,2000) })), operationalSla: computeTicketOperationalSla(ticket, buildConfigByPriority(sla.data ?? [])),
      identity: { clientId: ticket.client_id, authority: 'unknown' }, assignedTo: ticket.assigned_to, contractualSla, assignee: assignee.data,
      evidence: { truncated: history.length === 30 || (messages.data ?? []).some(row => (row.body_plain?.length ?? 0)>2000) || (source.data?.body_plain?.length ?? 0)>8000, missing: [...(client.data ? [] : ['verified_client']), ...(settings.data?.business_context ? [] : ['business_context'])] } } };
}

async function analyzeContext(ctx: Awaited<ReturnType<typeof ticketContext>>, work: DecisionWork, promptId: string) {
  const result = await runLlmFeature({ feature: `${work.contract}_evidence`, promptId, modelRole: 'knowledge_draft',
    lang: ctx.language, schema: WorkflowAnalysisSchema,
    vars: { context: JSON.stringify(ctx.state), sources: JSON.stringify(ctx.sources) },
    options: { maxTokens: 2000, temperature: 0 }, context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall });
  return { ...groundWorkflowAnalysis(result.data, ctx.sources), model: result.model, promptVersion: result.promptVersion, callId: result.llmCallId };
}

export async function processDecisionWork(work: DecisionWork, db = supabase) {
  if (work.contract === 'knowledge_change') {
    const { error } = await db.rpc('enqueue_knowledge_candidates', { p_version_id: work.knowledge_version_id });
    if (error) throw new ProviderError('Knowledge candidate selection failed', true);
    return;
  }
  const ctx = await ticketContext(work, db);
  if (work.contract === 'knowledge_impact') {
    const key = evaluationKey(ctx.ticket.id, ctx.ticket.case_revision, work.knowledge_version_id!);
    const { data: prior, error: priorError } = await db.from('ticket_decision_history').select('id').eq('account_id', work.account_id).eq('idempotency_key', key).maybeSingle();
    if (priorError) throw new ProviderError('Knowledge evaluation lookup failed', true);
    if (prior) return;
    const { data: row, error } = await db.from('current_knowledge').select('*').eq('account_id', work.account_id).eq('id', work.knowledge_version_id).maybeSingle();
    if (error) throw new ProviderError('Knowledge revision lookup failed', true);
    if (!row) return;
    const version = KnowledgeVersionSchema.parse(row);
    const impact = await runDecisionFeature({ feature: 'knowledge_impact', provider: createDecisionProvider('gateway', 'knowledge_decision'),
      state: { ...ctx.state,
        case: { subject: ctx.ticket.subject, body: ctx.ticket.body_plain, messages: ctx.history },
        knowledge: knowledgeReferences([version])[0] },
      questions: knowledgeImpactQuestions(), context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall,
      versions: { state: WORKFLOW_VERSION, questions: WORKFLOW_VERSION } });
    const answer = z.object({ contribution: z.object({ choice: z.enum(['solution','correction','action','none','unknown']) }) }).parse(impact.data.value);
    const contribution = !['none','unknown'].includes(answer.contribution.choice);
    const analysis = contribution ? await analyzeContext({ ...ctx, state: { ...ctx.state, approvedKnowledge: knowledgeReferences([version]) }, sources: ctx.sources.filter(source => source.authority !== 'approved_knowledge').concat({ id: version.id, text: String(version.snapshot['content'] ?? version.snapshot['summary'] ?? ''), authority: 'approved_knowledge' }) }, work, 'knowledge-impact') : null;
    const useful = contribution && !!analysis?.observations.some(row => row.citations.some(citation => citation.sourceId === version.id));
    const { data: status, error: persistError } = await db.rpc('record_ticket_enrichment', {
      p_account_id: work.account_id, p_ticket_id: ctx.ticket.id, p_revision: ctx.ticket.case_revision,
      p_version_id: version.id, p_key: key, p_useful: useful,
      p_result: { contribution: answer.contribution.choice, analysis, sources: knowledgeReferences([version]),
        model: impact.data.modelVersion, callId: impact.llmCallId, authorization: 'human_review',
        missing: answer.contribution.choice === 'unknown' ? ['applicability_evidence'] : [] },
    });
    if (persistError || status === 'stale_case') throw new ProviderError('Case changed before enrichment; retry with current context', true);
    return;
  }
  const stage = work.contract === 'historical_learning' ? 'backfill' : 'new_email';
  const key = `workflow:${work.dedupe_key}`;
  const { data: existing, error } = await db.from('ticket_decision_history').select('id').eq('account_id', work.account_id).eq('idempotency_key', key).maybeSingle();
  if (error) throw new ProviderError('Decision history lookup failed', true);
  if (existing) return;
  const analysis = await analyzeContext(ctx, work, stage === 'backfill' ? 'historical-analysis' : 'incoming-analysis');
  const affected = stage === 'new_email' ? analysis.observations.map(row => row.dimension) : [];
  const classificationQuestions = buildTicketVerdictQuestions(stage);
  const affectedQuestions = {
    ...(affected.includes('impact') || affected.includes('alternative') ? { priority: classificationQuestions['priority'] } : {}),
    ...(affected.includes('deadline') ? { urgency: classificationQuestions['urgency'] } : {}),
  };
  const decision = await runDecisionFeature({ feature: work.contract, provider: createDecisionProvider('gateway', 'knowledge_decision'),
    state: { ...ctx.state, analysis, body: ctx.incoming?.body_plain ?? ctx.ticket.body_plain }, questions: { ...workflowQuestions(stage), ...affectedQuestions },
    context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall,
    versions: { state: WORKFLOW_VERSION, questions: WORKFLOW_VERSION } });
  const answers = workflowAnswersSchema(stage).parse(decision.data.value);
  const judgments = Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer.choice]));
  const verdict = ctx.ticket.model_verdict ?? {};
  const raw = decision.data.value as Record<string,unknown>;
  const classificationProposal = {
    ...('priority' in affectedQuestions ? { priority: TicketAnswersSchema.shape.priority.parse(raw['priority']).choice } : {}),
    ...('urgency' in affectedQuestions ? { urgency: TicketAnswersSchema.shape.urgency.parse(raw['urgency']).choice } : {}),
  };
  const knowledge = work.message_id ? await proposeEmailKnowledge({ accountId: work.account_id, ticketId: ctx.ticket.id, messageId: work.message_id, stage }, { db }) : { status: 'skipped', reason: 'source_unavailable' };
  await recordWorkflowResult({ accountId: work.account_id, ticketId: ctx.ticket.id, messageId: work.message_id ?? undefined,
    contract: work.contract, revision: ctx.ticket.case_revision, key,
    status: ctx.versions.length ? 'pending_human_review' : 'pending_knowledge',
    result: { judgments, classificationProposal, analysis, identity: ctx.state.identity, assignedTo: ctx.ticket.assigned_to,
      attention: attentionRecommendation(classificationProposal.priority ?? ctx.ticket.priority, judgments['urgency_evidence'] === 'supported' ? classificationProposal.urgency ?? verdict.urgency : null),
      sla: ctx.state.operationalSla, contractualSla: ctx.state.contractualSla, sources: knowledgeReferences(ctx.versions), evidence: ctx.state.evidence,
      nextAction: supportedNextAction(judgments['next_action'], analysis, ctx.state.assignee?.status === 'active' ? ctx.ticket.assigned_to : null), authorization: 'human_review', execution: 'not_executed', knowledge,
      model: decision.data.modelVersion, callId: decision.llmCallId,
      missing: ctx.versions.length ? [] : ['approved_knowledge'] } }, db);
}

export function sourceFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
