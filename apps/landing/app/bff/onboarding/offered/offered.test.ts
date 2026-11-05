import { beforeEach, describe, expect, it, mock } from "bun:test";

interface State {
  user: { id: string } | null;
  member: { account_id: string } | null;
  updateError: boolean;
  update?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}
const state: State = { user: null, member: null, updateError: false, filters: [] };

mock.module("@/lib/supabase/server", () => ({
  getUserFromRequest: async () => ({ data: { user: state.user }, error: state.user ? null : { message: "no session" } }),
  createClientForRequest: async () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "in", "order", "limit"]) chain[method] = () => chain;
      chain.eq = () => chain;
      chain.is = (column: string, value: unknown) => {
        state.filters.push([column, value]);
        return table === "accounts" && state.filters.length >= 2 ? Promise.resolve({ error: state.updateError ? { message: "db" } : null }) : chain;
      };
      chain.update = (values: Record<string, unknown>) => { state.update = values; return chain; };
      chain.maybeSingle = async () => ({ data: state.member, error: null });
      return chain;
    },
  }),
}));

const { POST } = await import("./route");
const call = () => POST(new Request("http://127.0.0.1:3000/bff/onboarding/offered", { method: "POST" }));

beforeEach(() => {
  Object.assign(state, { user: { id: "u1" }, member: { account_id: "acc" }, updateError: false, update: undefined, filters: [] });
});

describe("POST /bff/onboarding/offered", () => {
  it("rejects a request without a session", async () => {
    state.user = null;
    expect((await call()).status).toBe(401);
    expect(state.update).toBeUndefined();
  });

  it("rejects members who are not owner or admin", async () => {
    state.member = null;
    expect((await call()).status).toBe(403);
  });

  it("records the first offer only, and never on an account that already finished", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(typeof state.update?.onboarding_offered_at).toBe("string");
    expect(state.filters).toEqual([["onboarding_completed_at", null], ["onboarding_offered_at", null]]);
  });

  it("reports a failed write", async () => {
    state.updateError = true;
    expect((await call()).status).toBe(500);
  });
});
