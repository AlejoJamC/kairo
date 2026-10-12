import { mock } from 'bun:test';
import type { LlmCallRecord } from '../packages/intelligence/src/harness/run-llm-feature';
import type { EvalCase } from './cases';
import { identity, storageFor, type Row } from './storage';

/** Run in its own Bun process: only persistence, retrieval and logging are isolated. */
export async function createRuntime(classifyOverride?: typeof import('../packages/intelligence/src/classification/classify').classifyEmailWithMeta) {
  let active: ReturnType<typeof storageFor> | undefined;
  const calls: LlmCallRecord[] = [];
  const current = () => { if (!active) throw new Error('No evaluation case selected'); return active; };
  const logger = async (record: LlmCallRecord) => { calls.push(record); return `acme-call-${calls.length}`; };
  mock.module('../apps/api/src/lib/supabase.js', () => ({ supabase: {
    from: (table: string) => current().db.from(table),
    rpc: (name: string, args: Row) => current().db.rpc(name, args),
  } }));
  mock.module('../apps/api/src/lib/llm-logging.js', () => ({ recordLlmCall: logger }));
  const contextModule = await import('../apps/api/src/lib/ticket-context');
  mock.module('../apps/api/src/lib/ticket-context.js', () => ({ ...contextModule,
    findRelevantKb: async () => ({ articles: current().retrieval.kbArticles, degraded: [] }),
    retrieveTicketContext: async () => current().retrieval,
  }));
  const { processDecisionWork } = await import('../apps/api/src/lib/decision-workflow');
  const { suggestReply } = await import('../apps/api/src/lib/reply-suggestion');
  const { buildEmailClassifierInput } = await import('../apps/api/src/lib/classifier-input');
  const { extractMailFacts } = await import('../apps/api/src/lib/email/mail-facts');
  const { classifyEmailWithMeta } = await import('../packages/intelligence/src/index');

  return async (example: EvalCase) => {
    active = storageFor(example);
    calls.length = 0;
    const prediction: Record<string, string> = {};
    let output: unknown;
    let abstain: boolean | null = null;
    if (example.contract === 'onboarding_triage') {
      const mailbox = example.mailbox ?? 'support@acme.com';
      const from = example.from ?? 'client@outside.com';
      const facts = extractMailFacts({ from, subject: example.subject, headers: { To: example.to ?? mailbox, Cc: example.cc ?? '' }, tenantMailbox: [mailbox] });
      facts.referencesCount = example.threadDepth ?? 0;
      const input = buildEmailClassifierInput({ stage: 'onboarding', from, subject: example.subject,
        bodyPlain: example.body, facts, context: { tenantMailbox: mailbox, tenantMailboxes: [mailbox] } });
      const result = await (classifyOverride ?? classifyEmailWithMeta)({ ...input, attachments: example.attachments }, { lang: example.lang });
      output = result;
      Object.assign(prediction, { type: result.result.type, priority: result.verdict.priority,
        urgency: result.verdict.urgency, category: result.verdict.category, tone: result.verdict.tone }, result.verdict.workflow?.judgments);
      abstain = result.abstain;
    } else if (example.contract === 'reply_suggestion') {
      output = await suggestReply(identity, { supabase: active.db, logger, retrieve: async () => current().retrieval });
      prediction['referencedKnowledge'] = String(!!(output as { referencedKbArticles: string[] } | null)?.referencedKbArticles.length);
    } else {
      await processDecisionWork({ id: 'acme-job', account_id: identity.accountId, ticket_id: identity.ticketId,
        message_id: example.contract === 'knowledge_impact' ? null : active.source.id,
        knowledge_version_id: active.versions[0]?.id ?? null, contract: example.contract, dedupe_key: 'acme-job' }, active.db);
      const history = active.writes.find(w => w.operation === 'ticket_decision_history')?.value;
      const result = history?.['result'] as Row | undefined;
      Object.assign(prediction, result?.['judgments']);
      if (result?.['nextAction'] !== undefined) prediction['nextAction'] = String(result['nextAction']);
      const enrichment = active.writes.find(w => w.operation === 'record_ticket_enrichment')?.value;
      if (example.contract === 'knowledge_impact') {
        prediction['skipped'] = String(!enrichment);
        if (enrichment) {
          prediction['useful'] = String(enrichment['p_useful']);
          prediction['contribution'] = String((enrichment['p_result'] as Row)['contribution']);
        }
      }
      output = active.writes;
    }
    const approvedIds = new Set(active.versions.filter(v => v.status === 'approved').map(v => v.id));
    const results = active.writes.flatMap(w => [w.value['result'], w.value['p_result']]).filter((r): r is Row => !!r && typeof r === 'object');
    const safety = {
      approvedSourcesOnly: results.every(r => !Array.isArray(r['sources']) || r['sources'].every((source: Row) => approvedIds.has(String(source['version'])))),
      proposalsOnly: results.every(r => r['authorization'] === 'human_review' && (!('execution' in r) || r['execution'] === 'not_executed')),
      inferredKnowledgeUnapproved: active.writes.filter(w => w.operation === 'save_email_knowledge').every(w =>
        (w.value['p_articles'] as Row[]).every(r => r['is_published'] === false) &&
        (w.value['p_learnings'] as Row[]).every(r => r['status'] === 'pending_review')),
      firstDeliveryIndependent: example.contract !== 'onboarding_triage' || (active.writes.length === 0 && calls.length === 0),
    };
    return { prediction, abstain, output, calls: [...calls], safety };
  };
}
