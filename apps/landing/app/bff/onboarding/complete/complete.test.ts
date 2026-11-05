import { beforeEach, describe, expect, it, mock } from "bun:test";

interface State {
  user: { id: string } | null;
  member: { account_id: string; role?: string; accounts?: unknown } | null;
  alreadyCompleted: boolean;
  updateError: boolean;
  update?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  dispatched: string[];
}
const state: State = { user: null, member: null, alreadyCompleted: false, updateError: false, filters: [], dispatched: [] };

function mockClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order", "limit", "is"]) {
        chain[method] = (column?: string, value?: unknown) => {
          if (table === "accounts" && method === "is") state.filters.push([column as string, value]);
          return chain;
        };
      }
      chain.update = (values: Record<string, unknown>) => { state.update = values; return chain; };
      chain.maybeSingle = async () => {
        if (table === "account_members") return { data: state.member, error: null };
        if (state.updateError) return { data: null, error: { message: "db down" } };
        return { data: state.alreadyCompleted ? null : { id: "acc", business_context: state.update?.business_context }, error: null };
      };
      return chain;
    },
  };
}

mock.module("@/lib/supabase/server", () => ({
  getUserFromRequest: async () => ({ data: { user: state.user }, error: state.user ? null : { message: "no session" } }),
  createClient: async () => mockClient(),
  createClientForRequest: async () => mockClient(),
}));
mock.module("@/lib/inngest", () => ({
  dispatchOnboardingCompleted: async (accountId: string) => { state.dispatched.push(accountId); return "dispatched"; },
}));

const { POST } = await import("./route");
const { GET: getAccount, PATCH: updateAccount } = await import("../../account/current/route");

const call = (body: unknown) => POST(new Request("http://127.0.0.1:3000/bff/onboarding/complete", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  Object.assign(state, { user: { id: "u1" }, member: { account_id: "acc" }, alreadyCompleted: false, updateError: false, update: undefined, filters: [], dispatched: [] });
});

describe("POST /bff/onboarding/complete", () => {
  it("rejects a request without a session", async () => {
    state.user = null;
    expect((await call({})).status).toBe(401);
    expect(state.dispatched).toEqual([]);
  });

  it("rejects an unknown industry and a non-text business context", async () => {
    expect((await call({ industry: "pirates" })).status).toBe(400);
    expect((await call({ business_context: 4 })).status).toBe(400);
    expect(state.update).toBeUndefined();
  });

  it("rejects members who are not owner or admin", async () => {
    state.member = null;
    expect((await call({})).status).toBe(403);
  });

  it("records the industry and the business context as written by the owner", async () => {
    const response = await call({ industry: "legal", business_context: "  We help families with paperwork.  " });
    expect(response.status).toBe(200);
    expect(state.update).toMatchObject({
      industry: "legal",
      business_context: "We help families with paperwork.",
      business_context_source: "manual",
    });
    expect(typeof state.update?.onboarding_completed_at).toBe("string");
    expect(state.dispatched).toEqual(["acc"]);
  });

  it("records an omission as the default industry without touching the business context", async () => {
    const response = await call({ industry: null, business_context: null });
    expect(response.status).toBe(200);
    expect(state.update).toMatchObject({ industry: "other" });
    expect(state.update).not.toHaveProperty("business_context");
    expect(typeof state.update?.onboarding_completed_at).toBe("string");
  });

  it("accepts the other option", async () => {
    expect((await call({ industry: "other" })).status).toBe(200);
    expect(state.update).toMatchObject({ industry: "other" });
  });

  it("writes only while the completion is not recorded, so a retry keeps what was saved", async () => {
    state.alreadyCompleted = true;
    const response = await call({ industry: "financial" });
    expect(state.filters).toContainEqual(["onboarding_completed_at", null]);
    expect(await response.json()).toMatchObject({ success: true, already_completed: true });
    expect(state.dispatched).toEqual(["acc"]);
  });

  it("reports a failed save and does not dispatch", async () => {
    state.updateError = true;
    expect((await call({ industry: "financial" })).status).toBe(500);
    expect(state.dispatched).toEqual([]);
  });
});

describe("/bff/account/current", () => {
  const request = (body: unknown) => new Request("http://127.0.0.1:3000/bff/account/current", { method: "PATCH", body: JSON.stringify(body) });

  it("returns the industry's saved value and the account's business context", async () => {
    state.member = { account_id: "acc", role: "owner", accounts: { id: "acc", industry: "legal", business_context: "A description", plans: null } };
    const response = await getAccount(new Request("http://127.0.0.1:3000/bff/account/current"));
    expect(await response.json()).toMatchObject({ industry: "legal", business_context: "A description" });
  });

  it("allows an owner to update only the business context", async () => {
    state.member = { account_id: "acc", role: "owner" };
    const response = await updateAccount(request({ account_id: "acc", business_context: "  A description  " }));
    expect(response.status).toBe(200);
    expect(state.update).toMatchObject({ business_context: "A description", business_context_source: "manual" });
    expect(state.update).not.toHaveProperty("industry");
    expect(await response.json()).toEqual({ business_context: "A description" });
  });

  it("allows an admin to clear the optional description", async () => {
    state.member = { account_id: "acc", role: "admin" };
    expect((await updateAccount(request({ account_id: "acc", business_context: "  " }))).status).toBe(200);
    expect(state.update).toMatchObject({ business_context: null, business_context_source: null });
  });

  it("rejects missing sessions, non-admins, and a different account", async () => {
    state.user = null;
    expect((await updateAccount(request({ account_id: "acc", business_context: "text" }))).status).toBe(401);
    state.user = { id: "u1" };
    state.member = { account_id: "acc", role: "agent" };
    expect((await updateAccount(request({ account_id: "acc", business_context: "text" }))).status).toBe(403);
    state.member = { account_id: "acc", role: "owner" };
    expect((await updateAccount(request({ account_id: "other", business_context: "text" }))).status).toBe(403);
    expect(state.update).toBeUndefined();
  });

  it("rejects invalid or oversized descriptions and reports a failed save", async () => {
    state.member = { account_id: "acc", role: "owner" };
    expect((await updateAccount(request({ account_id: "acc", business_context: 1 }))).status).toBe(400);
    expect((await updateAccount(request({ account_id: "acc", business_context: "x".repeat(2501) }))).status).toBe(400);
    state.updateError = true;
    expect((await updateAccount(request({ account_id: "acc", business_context: "text" }))).status).toBe(500);
  });
});
