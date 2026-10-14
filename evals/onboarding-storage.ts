import type { processDecisionWork } from '../apps/api/src/lib/decision-workflow';
import type { Row } from './storage';

export const accountId = 'acme-account';
export const userId = 'acme-owner';

/** Stateful service-test adapter. SQL triggers, transactions and RLS are not simulated. */
export function onboardingStorage(language: 'es' | 'en') {
  const tables: Record<string, Row[]> = Object.fromEntries([
    'tickets', 'messages', 'conversations', 'ticket_messages', 'ticket_decision_history',
    'ticket_state_history', 'clients', 'draft_contact', 'ticket_priority_sla_config',
    'tenant_sla_rules', 'kb_articles', 'operational_learning', 'current_knowledge', 'ticket_proposals',
  ].map(name => [name, []]));
  tables['accounts'] = [{ id: accountId, language, business_context: null }];
  tables['account_members'] = [{ account_id: accountId, user_id: userId, role: 'owner', status: 'active' }];
  const writes: { operation: string; value: Row }[] = [];
  let sequence = 0;
  const insert = (table: string, value: Row) => {
    const row = { id: `acme-row-${++sequence}`, ...value };
    tables[table]!.push(row);
    writes.push({ operation: table, value: structuredClone(row) });
    return row;
  };
  const adapter = {
    from(table: string) {
      if (!(table in tables)) throw new Error('Unsupported evaluation table');
      let rows = [...tables[table]!];
      let error: { code: string; message: string } | null = null;
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { rows = rows.filter(row => row[key] === value); return query; },
        neq(key: string, value: unknown) { rows = rows.filter(row => row[key] !== value); return query; },
        is(key: string, value: unknown) { rows = rows.filter(row => (row[key] ?? null) === value); return query; },
        in(key: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[key])); return query; },
        contains(key: string, values: unknown[]) { rows = rows.filter(row => Array.isArray(row[key]) && values.every(value => (row[key] as unknown[]).includes(value))); return query; },
        like(key: string, prefix: string) { rows = rows.filter(row => String(row[key]).startsWith(prefix.replace(/%$/, ''))); return query; },
        order(key: string, options: { ascending: boolean }) { rows.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1)); return query; },
        limit(size: number) { rows = rows.slice(0, size); return query; },
        insert(value: Row) {
          const keys = table === 'conversations' ? ['account_id', 'channel_integration_id', 'external_thread_id']
            : table === 'tickets' ? ['account_id', 'conversation_id'] : ['id'];
          if (tables[table]!.some(row => keys.every(key => value[key] !== undefined && row[key] === value[key]))) {
            rows = []; error = { code: '23505', message: 'Duplicate fixture row' }; return query;
          }
          rows = [insert(table, table === 'tickets' ? {
            case_revision: 1, ticket_number: tables[table]!.length + 1, merged_into_ticket_id: null,
            created_at: new Date().toISOString(), ...value,
          } : value)];
          return query;
        },
        upsert(value: Row, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
          const keys = (options?.onConflict ?? 'id').split(',');
          const existing = tables[table]!.find(row => keys.every(key => value[key] !== undefined && row[key] === value[key]));
          if (existing && options?.ignoreDuplicates) { rows = [existing]; return query; }
          if (existing) { Object.assign(existing, value); rows = [existing]; writes.push({ operation: table, value: structuredClone(existing) }); }
          else rows = [insert(table, value)];
          return query;
        },
        async single() { return { data: rows[0] ?? null, error }; },
        async maybeSingle() { return { data: rows[0] ?? null, error }; },
        then<T>(done: (value: { data: Row[]; error: typeof error }) => T | PromiseLike<T>) {
          return Promise.resolve({ data: rows, error }).then(done);
        },
      };
      return query;
    },
    async rpc(name: string, args: Row) {
      writes.push({ operation: name, value: structuredClone(args) });
      if (name === 'apply_ticket_transition') {
        const row = insert('ticket_state_history', { ticket_id: args['p_ticket_id'], to_state: args['p_to_state'], trigger: args['p_trigger'] });
        return { data: [{ outcome: 'applied', from_state: null, to_state: args['p_to_state'], history_id: row['id'] }], error: null };
      }
      if (name === 'save_email_knowledge') {
        const articles = (args['p_articles'] as Row[]).map(row => insert('kb_articles', row));
        for (const row of args['p_learnings'] as Row[]) insert('operational_learning', row);
        return { data: articles.map(row => row['id']), error: null };
      }
      throw new Error('Unsupported evaluation RPC');
    },
  };
  return { db: adapter as unknown as NonNullable<Parameters<typeof processDecisionWork>[1]>, tables, writes };
}
