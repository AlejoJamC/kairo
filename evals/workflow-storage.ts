import { onboardingStorage, accountId, userId } from './onboarding-storage';
import type { Scenario } from './workflow-scenarios';
import type { Row } from './storage';

/** SQL-boundary fixtures only. They provide observable writes, not proof of database transactions or permissions. */
export function workflowStorage(example: Scenario) {
  const storage = onboardingStorage(example.lang);
  const { tables, writes } = storage;
  for (const name of ['knowledge_versions', 'knowledge_embeddings', 'classification_feedback', 'ticket_notes']) tables[name] = [];
  const ticketId = 'acme-ticket';
  const messages = (example.messages ?? [{ direction: 'inbound', body: example.body }]).map((row, i) => ({
    id: `acme-message-${i}`, account_id: accountId, conversation_id: 'acme-conversation',
    direction: row.direction, body_plain: row.body, processing_tier: null,
    received_at: example.dataset === 'synthetic' ? new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString() : example.messageTimes?.[i] ?? null,
  }));
  tables['messages'] = messages;
  tables['ticket_messages'] = messages.map(row => ({ ticket_id: ticketId, message_id: row.id }));
  const source = [...messages].reverse().find(row => row.direction === 'inbound');
  if (!source) throw new Error('EVAL_SOURCE_MISSING');
  const ticket: Row = { id: ticketId, account_id: accountId, case_revision: messages.length,
    subject: example.subject, body_plain: messages[0]!.body_plain, conversation_id: 'acme-conversation',
    client_id: null, from_email: example.from ?? '', assigned_to: userId, assignment_source: 'auto',
    status: 'open', priority: 'P2', category: 'account', ticket_type: 'support', emotion: 'neutral',
    model_verdict: { urgency: 'medium' }, classification_tier: 1, received_at: messages[0]!.received_at,
    knowledge_context: {}, first_viewed_at: null, human_modified_at: null };
  if (example.dataset !== 'synthetic') {
    // No prior classification is supplied by these corpus labels for a different workflow.
    Object.assign(ticket, { priority: null, category: null, ticket_type: null, emotion: null, model_verdict: {} });
  }
  if (example.human === 'viewed') ticket['first_viewed_at'] = new Date().toISOString();
  if (example.human === 'modified') ticket['human_modified_at'] = new Date().toISOString();
  if (example.human === 'assigned') tables['ticket_activity_log']!.push({ ticket_id: ticketId, actor_type: 'human' });
  tables['tickets'] = [ticket];
  tables['accounts']![0]!['business_context'] = example.businessContext ?? null;
  tables['account_members']![0]!['role'] = 'agent';
  tables['account_members']![0]!['status'] = example.member ?? 'active';
  if (example.priorDecision) tables['ticket_decision_history']!.push({
    account_id: accountId, ticket_id: ticketId, idempotency_key: 'acme-prior-decision',
    contract: 'incoming_email_decision', result: { authorization: 'human_review', nextAction: 'request_information' },
  });
  for (const [i, item] of (example.knowledge ?? []).entries()) {
    const version: Row = { id: `acme-version-${i}`, account_id: accountId, source_kind: 'article',
      source_id: `acme-article-${i}`, revision: 1, status: example.approve && i === 0 ? 'pending_review' : item.status,
      snapshot: { title: 'Support procedure', content: item.content, ticket_ids: [ticketId] } };
    tables['knowledge_versions']!.push(version);
    tables['kb_articles']!.push({ id: version['source_id'], account_id: accountId, title: 'Support procedure',
      content: item.content, is_published: version['status'] === 'approved', tags: [] });
  }
  const current = () => {
    const latest = new Map<string, Row>();
    for (const row of tables['knowledge_versions']!) {
      const key = `${row['account_id']}:${row['source_kind']}:${row['source_id']}`;
      if (Number(row['revision']) > Number(latest.get(key)?.['revision'] ?? 0)) latest.set(key, row);
    }
    return [...latest.values()].filter(row => row['status'] === 'approved' && row['account_id'] === accountId);
  };
  const from = storage.db.from.bind(storage.db);
  storage.db.from = ((table: string) => {
    if (table === 'current_knowledge') tables[table] = current();
    return from(table);
  }) as typeof storage.db.from;
  const memberAllowed = () => tables['account_members']!.some(row => row['account_id'] === accountId && row['user_id'] === userId && row['status'] === 'active' && ['owner','admin','supervisor','agent'].includes(String(row['role'])));
  let raceApplied = false;
  let rejection: string | null = null;
  const beforeSave = () => {
    if (raceApplied) return;
    raceApplied = true;
    if (example.human === 'view_during_save') ticket['first_viewed_at'] = new Date().toISOString();
    if (example.race === 'case') { ticket['case_revision'] = Number(ticket['case_revision']) + 1; ticket['human_modified_at'] = new Date().toISOString(); }
    if (example.race === 'knowledge') for (const version of tables['knowledge_versions']!) version['status'] = 'withdrawn';
  };
  const saveHistory = (row: Row) => {
    if (!tables['ticket_decision_history']!.some(item => item['idempotency_key'] === row['idempotency_key'])) {
      tables['ticket_decision_history']!.push(structuredClone(row));
      writes.push({ operation: 'ticket_decision_history', value: structuredClone(row) });
    }
  };
  const rpc = storage.db.rpc.bind(storage.db);
  storage.db.rpc = (async (name: string, args: Row) => {
    const ok = (data: unknown) => ({ data, error: null });
    const fail = (message: string) => {
      rejection = message === 'Permission denied' ? 'permission' : message === 'Case changed' ? 'case_changed' : 'knowledge_changed';
      return { data: null, error: { message } };
    };
    if (name === 'find_workflow_knowledge') return ok(current());
    if (name === 'review_workflow_knowledge') {
      if (!memberAllowed()) return fail('Permission denied');
      const prior = tables['knowledge_versions']!.find(row => row['id'] === args['p_version_id']);
      if (!prior) return fail('Knowledge changed');
      const version = { ...structuredClone(prior), id: `${String(prior['id'])}-reviewed`, revision: Number(prior['revision']) + 1,
        status: args['p_decision'], actor_user_id: userId };
      tables['knowledge_versions']!.push(version);
      writes.push({ operation: name, value: structuredClone(args) });
      return ok(version.id);
    }
    if (name === 'enqueue_knowledge_candidates') {
      writes.push({ operation: name, value: structuredClone(args) });
      const version = current().find(row => row['id'] === args['p_version_id']);
      if (!version) return ok(0);
      const key = `impact:${ticketId}:${String(ticket['case_revision'])}:${String(version['id'])}`;
      if (!tables['decision_work_items']!.some(row => row['dedupe_key'] === key)) tables['decision_work_items']!.push({
        id: 'acme-impact-job', account_id: accountId, ticket_id: ticketId, message_id: null,
        knowledge_version_id: version['id'], contract: 'knowledge_impact', dedupe_key: key,
      });
      return ok(1);
    }
    if (name === 'record_ticket_enrichment') {
      beforeSave();
      if (tables['ticket_decision_history']!.some(row => row['idempotency_key'] === args['p_key'])) return ok('already_evaluated');
      if (ticket['case_revision'] !== args['p_revision']) { rejection = 'case_changed'; return ok('stale_case'); }
      const version = current().find(row => row['id'] === args['p_version_id']);
      if (!version) return ok('stale_knowledge');
      const touched = !!ticket['first_viewed_at'] || !!ticket['human_modified_at'] || tables['ticket_activity_log']!.some(row => row['actor_type'] === 'human');
      const status = !args['p_useful'] ? 'evaluated_without_contribution' : touched ? 'pending_human_review' : 'enriched';
      saveHistory({ account_id: accountId, ticket_id: ticketId, contract: 'knowledge_impact', case_revision: args['p_revision'],
        knowledge_version_id: version['id'], idempotency_key: args['p_key'], status, result: args['p_result'] });
      if (status === 'enriched') (ticket['knowledge_context'] as Row)[String(version['source_id'])] = { versionId: version['id'], result: args['p_result'] };
      writes.push({ operation: name, value: structuredClone(args) });
      return ok(status);
    }
    if (name === 'save_reply_decision') {
      beforeSave();
      if (!memberAllowed()) return fail('Permission denied');
      if (ticket['case_revision'] !== args['p_revision']) return fail('Case changed');
      const result = args['p_result'] as Row;
      if ((result['sources'] as Row[]).some(ref => !current().some(row => row['id'] === ref['version']))) return fail('Knowledge changed');
      const previous = tables['ticket_decision_history']!.find(row => row['idempotency_key'] === args['p_key']);
      if (previous) return ok((previous['result'] as Row)['proposalId']);
      const proposalId = `acme-reply-${tables['ticket_proposals']!.length}`;
      tables['ticket_proposals']!.push({ id: proposalId, ticket_id: ticketId, ...(args['p_proposal'] as Row), status: 'pending' });
      saveHistory({ account_id: accountId, ticket_id: ticketId, contract: 'reply_suggestion', idempotency_key: args['p_key'],
        status: 'proposed', result: { ...result, proposalId } });
      writes.push({ operation: name, value: structuredClone(args) });
      return ok(proposalId);
    }
    return rpc(name as never, args as never);
  }) as unknown as typeof storage.db.rpc;
  return { ...storage, ticket, source, current, get rejection() { return rejection; }, identity: { accountId, ticketId, userId } };
}
