import type { EvalCase } from './cases';
import type { processDecisionWork } from '../apps/api/src/lib/decision-workflow';

export type Row = Record<string, unknown>;
export const identity = { accountId: 'acme-account', ticketId: 'acme-ticket', userId: 'acme-agent' };

/** Persistence and retrieval fixtures, never a substitute for database safety tests. */
export function storageFor(example: EvalCase) {
  const messages = (example.messages ?? [{ direction: 'inbound', body: example.body }]).map((m, i) => ({
    id: `acme-message-${i}`, account_id: identity.accountId, conversation_id: 'acme-conversation',
    direction: m.direction, body_plain: m.body, received_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  const source = [...messages].reverse().find(m => m.direction === 'inbound')!;
  const versions = (example.knowledge ?? []).map((k, i) => ({
    id: `acme-version-${i}`, account_id: identity.accountId, source_id: `acme-article-${i}`,
    source_kind: 'article', revision: 1, status: k.status, snapshot: { title: 'Support procedure', content: k.content },
  }));
  const tables: Record<string, Row[]> = {
    tickets: [{ id: identity.ticketId, account_id: identity.accountId, case_revision: 1,
      subject: example.subject, body_plain: example.body, conversation_id: 'acme-conversation',
      client_id: null, assigned_to: identity.userId, status: 'open', priority: 'P2', ticket_type: 'support',
      category: 'account', emotion: 'neutral', received_at: messages[0]!.received_at, model_verdict: { urgency: 'medium' } }],
    messages, ticket_messages: messages.map(m => ({ ticket_id: identity.ticketId, message_id: m.id })),
    accounts: [{ id: identity.accountId, language: example.lang, business_context: example.businessContext ?? null }],
    account_members: [{ account_id: identity.accountId, user_id: identity.userId, role: 'agent', status: 'active' }],
    clients: [], ticket_priority_sla_config: [], tenant_sla_rules: [], kb_articles: [], operational_learning: [],
    knowledge_versions: versions, current_knowledge: versions.filter(v => v.status === 'approved'), ticket_decision_history: [],
  };
  const writes: { operation: string; value: Row }[] = [];
  const db = {
    from(table: string) {
      if (!(table in tables)) throw new Error('Unsupported evaluation table');
      let rows = [...tables[table]!];
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter(r => r[key] === value); return query; },
        contains(key: string, values: unknown[]) { rows = rows.filter(r => Array.isArray(r[key]) && values.every(v => (r[key] as unknown[]).includes(v))); return query; },
        like(key: string, value: string) { rows = rows.filter(r => String(r[key]).startsWith(value.replace(/%$/, ''))); return query; },
        order(key: string, options: { ascending: boolean }) { rows.sort((a,b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1)); return query; },
        limit(n: number) { rows = rows.slice(0, n); return query; },
        async single() { return { data: rows[0] ?? null, error: null }; },
        async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
        async upsert(value: Row) { writes.push({ operation: table, value }); tables[table]!.push(value); return { data: null, error: null }; },
        then<T>(resolve: (value: { data: Row[]; error: null }) => T | PromiseLike<T>) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      if (name === 'find_workflow_knowledge') return { data: versions, error: null };
      if (!['record_ticket_enrichment', 'save_email_knowledge', 'save_reply_decision'].includes(name)) throw new Error('Unsupported evaluation RPC');
      writes.push({ operation: name, value: args });
      return { data: name === 'save_email_knowledge' ? [] : name === 'save_reply_decision' ? 'acme-proposal' : 'enriched', error: null };
    },
  };
  return { db: db as unknown as NonNullable<Parameters<typeof processDecisionWork>[1]>, tables, source, versions, writes,
    retrieval: { kbArticles: versions.filter(v => v.status === 'approved').map(v => ({ id: v.source_id,
      title: v.snapshot.title, content: v.snapshot.content, tags: [], similarity: 1 })), resolvedCases: [], degraded: [] } };
}
