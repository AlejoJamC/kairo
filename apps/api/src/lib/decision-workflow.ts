import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  buildTicketVerdictQuestions, TicketAnswersSchema, knowledgeImpactQuestions, attentionRecommendation, createDecisionProvider, ProviderError, runDecisionFeature,
  workflowAnswersSchema, workflowQuestions, WORKFLOW_VERSION, runLlmFeature, ReferencedWorkflowAnalysisSchema, workflowEvidenceFragments, resolveWorkflowEvidence, WorkflowAnalysisSchema, groundWorkflowAnalysis, supportedNextAction, type WorkflowSource, type VectorSpace,
  resolveModelRoute, workflowLanguageSchema,
} from '@kairo/intelligence';
import { computeTicketOperationalSla, buildConfigByPriority } from '@kairo/types';
import { supabase } from './supabase.js';
import { recordLlmCall } from './llm-logging.js';
import { approvedWorkflowKnowledge, enqueueWorkflowKnowledge, knowledgeReferences, KnowledgeVersionSchema } from './workflow-knowledge.js';
import { resolveSenderIdentity } from './client-identity.js';
import { contractualSlaFor } from './sla.js';
import { proposeEmailKnowledge } from './email-knowledge.js';
import { createBackendSemanticService } from './semantic-service.js';

export interface DecisionWork {
  id: string; account_id: string; ticket_id: string | null; message_id: string | null;
  knowledge_version_id: string | null; contract: string; dedupe_key: string;
  case_revision?: number;
}
export interface DecisionWorkDeps {
  embed?: (text: string) => Promise<number[]>;
  space?: VectorSpace;
  decide?: typeof runDecisionFeature;
  analyze?: typeof runLlmFeature;
  decisionProvider?: (role: 'classification' | 'knowledge_decision') => ReturnType<typeof createDecisionProvider>;
  propose?: typeof proposeEmailKnowledge;
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

export async function recordWorkflowFailure(work: DecisionWork & { attempts: number }, failure: { retriable: boolean; error: string }, db = supabase) {
  if (!work.ticket_id) return;
  let revision = work.case_revision;
  const revisionSource = revision === undefined ? 'observed_after_failure' : 'attempted_case';
  if (revision === undefined) {
    const { data, error } = await db.from('tickets').select('case_revision').eq('account_id', work.account_id).eq('id', work.ticket_id).single();
    if (error || !data) throw new ProviderError('Failure revision unavailable', true);
    revision = data.case_revision;
  }
  await recordWorkflowResult({ accountId: work.account_id, ticketId: work.ticket_id, messageId: work.message_id ?? undefined,
    contract: work.contract, revision: revision!, status: 'failed', key: `failure:${work.id}:${work.attempts}`,
    result: { missing: ['processing_failed'], execution: 'not_executed', retryable: failure.retriable,
      error: failure.error, attempt: work.attempts, revisionSource } }, db);
}

async function ticketContext(work: DecisionWork, db = supabase, deps: DecisionWorkDeps = {}) {
  const { data: ticket, error } = await db.from('tickets').select('*').eq('account_id', work.account_id).eq('id', work.ticket_id).maybeSingle();
  if (error || !ticket) throw new ProviderError('Decision ticket unavailable', true);
  work.case_revision = ticket.case_revision;
  const [messages, directory, sla, settings, contracts, source, assignee] = await Promise.all([
    ticket.conversation_id ? db.from('messages').select('id,direction,body_plain,received_at').eq('account_id', work.account_id).eq('conversation_id', ticket.conversation_id).order('received_at', { ascending: false }).limit(30) : Promise.resolve({ data: [], error: null }),
    resolveSenderIdentity(db, work.account_id, ticket.from_email, { contacts: true, displayName: ticket.from_name ?? null }).then(data => ({ data, error: null }), () => ({ data: null, error: true })),
    db.from('ticket_priority_sla_config').select('*').eq('account_id', work.account_id),
    db.from('accounts').select('business_context,language').eq('id', work.account_id).single(),
    db.from('tenant_sla_rules').select('id,ticket_type,plan_tier,response_hours,resolution_hours').eq('account_id',work.account_id),
    work.message_id ? db.from('messages').select('id,direction,body_plain,received_at').eq('account_id',work.account_id).eq('id',work.message_id).single() : Promise.resolve({ data:null,error:null }),
    ticket.assigned_to ? db.from('account_members').select('user_id,role,status').eq('account_id',work.account_id).eq('user_id',ticket.assigned_to).maybeSingle() : Promise.resolve({ data:null,error:null }),
  ]);
  if (messages.error || directory.error || !directory.data || sla.error || settings.error || contracts.error || source.error || assignee.error) throw new ProviderError('Decision context lookup failed', true);
  const { identity, client } = directory.data;
  const history = [...(messages.data ?? [])].reverse().map(row => ({ ...row, body_plain: String(row.body_plain ?? '').slice(0,2000) }));
  const incoming = source.data ? { ...source.data, body_plain: String(source.data.body_plain ?? '').slice(0,8000) } : null;
  const versions = await approvedWorkflowKnowledge(work.account_id, [ticket.subject, incoming?.body_plain ?? ticket.body_plain].join('\n'), ticket.id, db, { embed: deps.embed, space: deps.space });
  const sources: WorkflowSource[] = history.filter(row => row.id !== incoming?.id).map(row => ({ id: row.id as string, text: String(row.body_plain ?? ''), authority: 'message' }));
  if (incoming) sources.push({ id: incoming.id, text: incoming.body_plain ?? '', authority: 'message' });
  sources.push(...versions.map(row => ({ id: row.id, text: String(row.snapshot['content'] ?? row.snapshot['summary'] ?? '').slice(0,2000), authority: 'approved_knowledge' as const })));
  if (client) sources.push({ id: 'directory', text: JSON.stringify({ ...client, authority: identity.authority }), authority: 'directory' });
  const contractualSla = contractualSlaFor(contracts.data ?? [], ticket.ticket_type, client?.plan_type);
  sources.push({ id: 'configuration', text: JSON.stringify({ businessContext: settings.data?.business_context, contractualSla }), authority: 'configuration' });
  return { ticket, history, incoming, versions, sources, language: settings.data?.language === 'en' ? 'en' as const : 'es' as const,
    state: { source: incoming ?? null, previousCase: { status: ticket.status, verdict: ticket.model_verdict, messages: history.filter(row => row.id !== work.message_id && (!incoming || row.received_at <= incoming.received_at)).map(row => ({ id: row.id, direction: row.direction, receivedAt: row.received_at })) },
      businessContext: settings.data?.business_context?.slice(0,2500) ?? null, client,
      approvedKnowledge: knowledgeReferences(versions).map(ref => ({ ...ref, content: ref.content.slice(0,2000) })), operationalSla: computeTicketOperationalSla(ticket, buildConfigByPriority(sla.data ?? [])),
      identity, assignedTo: ticket.assigned_to, contractualSla, assignee: assignee.data,
      evidence: { truncated: history.length === 30 || (messages.data ?? []).some(row => (row.body_plain?.length ?? 0)>2000) || (source.data?.body_plain?.length ?? 0)>8000, missing: [...(identity.authority === 'authorized' ? [] : ['verified_client']), ...(settings.data?.business_context ? [] : ['business_context'])] } } };
}

async function analyzeContext(ctx: Awaited<ReturnType<typeof ticketContext>>, work: DecisionWork, promptId: string, deps: DecisionWorkDeps) {
  const referenced = work.contract === 'knowledge_impact';
  const context = referenced ? {
    case: { subject: ctx.ticket.subject, body: ctx.ticket.body_plain, status: ctx.ticket.status, messages: ctx.history },
    businessContext: ctx.state.businessContext, approvedKnowledge: ctx.state.approvedKnowledge,
  } : ctx.state;
  const result = await (deps.analyze ?? runLlmFeature)<z.infer<typeof WorkflowAnalysisSchema> | z.infer<typeof ReferencedWorkflowAnalysisSchema>>({ feature: `${work.contract}_evidence`, promptId, modelRole: 'evidence_analysis',
    lang: ctx.language, schema: referenced ? ReferencedWorkflowAnalysisSchema : WorkflowAnalysisSchema,
    vars: { context: JSON.stringify(context), sources: JSON.stringify(referenced ? workflowEvidenceFragments(ctx.sources) : ctx.sources) },
    // Sized to the schema's maximum answer (20 quoted observations), not to a typical one.
    options: { maxTokens: 8192, temperature: 0 }, context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall });
  return { ...(referenced ? resolveWorkflowEvidence(ReferencedWorkflowAnalysisSchema.parse(result.data), ctx.sources) : groundWorkflowAnalysis(WorkflowAnalysisSchema.parse(result.data), ctx.sources)), model: result.model, promptVersion: result.promptVersion, callId: result.llmCallId };
}

async function ensureKnowledgeEmbedding(work: DecisionWork, db: typeof supabase, deps: DecisionWorkDeps): Promise<void> {
  if (!work.knowledge_version_id) return;
  const service = createBackendSemanticService({ db, embed: deps.embed, space: deps.space,
    scope: { accountId: work.account_id, actor: { kind: 'workflow', id: work.id }, permissions: ['index'] } });
  const result = await service.indexSource({ source: { kind: 'knowledge_version', id: work.knowledge_version_id } });
  // Withdrawn and replaced versions still need their existing withdrawal workflow.
  if (result.status === 'failed' && result.reason !== 'not_found') throw new ProviderError('Knowledge index unavailable', true);
}

const decisionProvider = (deps: DecisionWorkDeps, role: 'classification' | 'knowledge_decision' = 'knowledge_decision') => deps.decisionProvider?.(role) ?? createDecisionProvider('gateway', role);

export async function processDecisionWork(work: DecisionWork, db = supabase, deps: DecisionWorkDeps = {}) {
  if (work.contract === 'knowledge_change') {
    if (!work.knowledge_version_id) throw new ProviderError('Knowledge version missing', false);
    await ensureKnowledgeEmbedding(work, db, deps);
    await enqueueWorkflowKnowledge(work.account_id, db, { versionId: work.knowledge_version_id });
    return;
  }
  const ctx = await ticketContext(work, db, deps);
  if (work.contract === 'knowledge_impact') {
    const key = evaluationKey(ctx.ticket.id, ctx.ticket.case_revision, work.knowledge_version_id!);
    const { data: prior, error: priorError } = await db.from('ticket_decision_history').select('id').eq('account_id', work.account_id).eq('idempotency_key', key).maybeSingle();
    if (priorError) throw new ProviderError('Knowledge evaluation lookup failed', true);
    if (prior) return;
    const { data: row, error } = await db.from('current_knowledge').select('*').eq('account_id', work.account_id).eq('id', work.knowledge_version_id).maybeSingle();
    if (error) throw new ProviderError('Knowledge revision lookup failed', true);
    if (!row) return;
    const version = KnowledgeVersionSchema.parse(row);
    const impact = await (deps.decide ?? runDecisionFeature)({ feature: 'knowledge_impact', provider: decisionProvider(deps),
      state: { ...ctx.state,
        case: { subject: ctx.ticket.subject, body: ctx.ticket.body_plain, messages: ctx.history },
        knowledge: knowledgeReferences([version])[0] },
      questions: knowledgeImpactQuestions(), context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall,
      versions: { state: WORKFLOW_VERSION, questions: WORKFLOW_VERSION } });
    const answer = z.object({ contribution: z.object({ choice: z.enum(['solution','correction','action','none','unknown']) }) }).parse(impact.data.value);
    const contribution = !['none','unknown'].includes(answer.contribution.choice);
    const analysis = contribution ? await analyzeContext({ ...ctx, state: { ...ctx.state, approvedKnowledge: knowledgeReferences([version]) }, sources: ctx.sources.filter(source => source.authority !== 'approved_knowledge').concat({ id: version.id, text: String(version.snapshot['content'] ?? version.snapshot['summary'] ?? ''), authority: 'approved_knowledge' }) }, work, 'knowledge-impact', deps) : null;
    const useful = contribution && !!analysis?.observations.some(row => row.citations.some(citation => citation.sourceId === version.id));
    if (analysis && !useful && (analysis.observations.length > 0 || analysis.missing.some(item => item.startsWith('unsupported_')))) {
      throw new ProviderError('Knowledge contribution lacks valid approved source references', true);
    }
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
  const analysis = await analyzeContext(ctx, work, stage === 'backfill' ? 'historical-analysis' : 'incoming-analysis', deps);
  const affected = stage === 'new_email' ? analysis.observations.map(row => row.dimension) : [];
  const classificationQuestions = buildTicketVerdictQuestions(stage);
  const affectedQuestions = {
    ...(affected.includes('impact') || affected.includes('alternative') ? { priority: classificationQuestions['priority'] } : {}),
    ...(affected.includes('deadline') ? { urgency: classificationQuestions['urgency'] } : {}),
  };
  const state = { ...ctx.state, analysis, body: ctx.incoming?.body_plain ?? ctx.ticket.body_plain };
  const questions = { ...workflowQuestions(stage), ...affectedQuestions };
  let judgments: Record<string, string>;
  let model: string;
  let callId: string | null;
  let classificationProposal: { priority?: string; urgency?: string };
  if (stage === 'new_email' && !deps.decisionProvider && resolveModelRoute('classification').capability === 'language') {
    const schema = workflowLanguageSchema(stage).extend({
      ...('priority' in affectedQuestions ? { priority: TicketAnswersSchema.shape.priority.shape.choice } : {}),
      ...('urgency' in affectedQuestions ? { urgency: TicketAnswersSchema.shape.urgency.shape.choice } : {}),
    });
    const result = await (deps.analyze ?? runLlmFeature)({ feature: work.contract, promptId: 'incoming-decision', modelRole: 'classification',
      lang: ctx.language, schema, vars: { context: JSON.stringify(state), questions: JSON.stringify(questions) },
      options: { maxTokens: 1500, temperature: 0 }, context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall });
    judgments = workflowLanguageSchema(stage).parse(result.data) as Record<string, string>;
    const values = schema.parse(result.data);
    classificationProposal = { ...('priority' in affectedQuestions ? { priority: values.priority } : {}), ...('urgency' in affectedQuestions ? { urgency: values.urgency } : {}) };
    model = result.model; callId = result.llmCallId;
  } else {
    const decision = await (deps.decide ?? runDecisionFeature)({ feature: work.contract,
      provider: decisionProvider(deps, stage === 'new_email' ? 'classification' : 'knowledge_decision'), state, questions,
      context: { accountId: work.account_id, ticketId: ctx.ticket.id }, logger: recordLlmCall,
      versions: { state: WORKFLOW_VERSION, questions: WORKFLOW_VERSION } });
    const answers = workflowAnswersSchema(stage).parse(decision.data.value);
    judgments = Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer.choice]));
    const raw = decision.data.value as Record<string,unknown>;
    classificationProposal = {
      ...('priority' in affectedQuestions ? { priority: TicketAnswersSchema.shape.priority.parse(raw['priority']).choice } : {}),
      ...('urgency' in affectedQuestions ? { urgency: TicketAnswersSchema.shape.urgency.parse(raw['urgency']).choice } : {}),
    };
    model = decision.data.modelVersion; callId = decision.llmCallId;
  }
  const verdict = ctx.ticket.model_verdict ?? {};
  const knowledge = work.message_id ? await (deps.propose ?? proposeEmailKnowledge)({ accountId: work.account_id, ticketId: ctx.ticket.id, messageId: work.message_id, stage }, { db }) : { status: 'skipped', reason: 'source_unavailable' };
  await recordWorkflowResult({ accountId: work.account_id, ticketId: ctx.ticket.id, messageId: work.message_id ?? undefined,
    contract: work.contract, revision: ctx.ticket.case_revision, key,
    status: 'pending_human_review',
    result: { judgments, classificationProposal, analysis, identity: ctx.state.identity, assignedTo: ctx.ticket.assigned_to,
      attention: attentionRecommendation(classificationProposal.priority ?? ctx.ticket.priority, judgments['urgency_evidence'] === 'supported' ? classificationProposal.urgency ?? verdict.urgency : null),
      sla: ctx.state.operationalSla, contractualSla: ctx.state.contractualSla, sources: knowledgeReferences(ctx.versions), evidence: ctx.state.evidence,
      nextAction: supportedNextAction(judgments['next_action'], analysis, ctx.state.assignee?.status === 'active' ? ctx.ticket.assigned_to : null), authorization: 'human_review', execution: 'not_executed', knowledge,
      model, callId, missing: analysis.missing } }, db);
}

export function sourceFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
