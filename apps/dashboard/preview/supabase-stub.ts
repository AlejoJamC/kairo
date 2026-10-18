import { drafts, tickets, profile } from "./fixtures";

const tables: Record<string, unknown[]> = {
  tickets,
  draft_contact: drafts,
  profiles: [profile],
  ticket_proposals: [],
  account_members: [],
};

function builder(table: string) {
  const rows = () => tables[table] ?? [];
  const result = (data: unknown) => ({ data, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "in", "order", "limit", "range", "update", "insert", "upsert", "delete", "is", "gte", "lte", "ilike", "or"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => result(rows()[0] ?? null);
  chain.single = async () => result(rows()[0] ?? null);
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result(rows()));
  return chain;
}

const channel = () => {
  const c: Record<string, unknown> = {};
  c.on = () => c;
  c.subscribe = () => c;
  c.unsubscribe = () => undefined;
  return c;
};

export function createClient() {
  return {
    from: builder,
    rpc: async () => ({ data: null, error: null }),
    channel,
    removeChannel: () => undefined,
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      updateUser: async () => ({ data: null, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  };
}
