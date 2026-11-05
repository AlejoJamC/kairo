import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOnboardingRecorded, ONBOARDING_WAIT_ROUNDS, settleIgnoredOffer, waitForOnboarding, type GateStep } from "./onboarding-gate";

function db(tables: { accounts?: unknown; members?: unknown[]; profiles?: unknown[]; fail?: string }): SupabaseClient {
  const result = (table: string) => {
    if (tables.fail === table) return { data: null, error: { message: "timeout" } };
    if (table === "accounts") return { data: tables.accounts ?? null, error: null };
    return { data: table === "account_members" ? tables.members ?? [] : tables.profiles ?? [], error: null };
  };
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in"]) chain[method] = () => chain;
      chain.maybeSingle = async () => result(table);
      chain.then = (resolve: (value: unknown) => void) => resolve(result(table));
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("isOnboardingRecorded", () => {
  it("is true once the completion is recorded", async () => {
    expect(await isOnboardingRecorded(db({ accounts: { onboarding_completed_at: "2026-10-26T12:00:00Z" } }), "a")).toBe(true);
  });

  it("is false for an owner who has not finished", async () => {
    const state = db({ accounts: { onboarding_completed_at: null }, members: [{ user_id: "u" }], profiles: [{ company_name: null }] });
    expect(await isOnboardingRecorded(state, "a")).toBe(false);
  });

  it("treats an account that predates the record as finished when the owner has a company name", async () => {
    const state = db({ accounts: { onboarding_completed_at: null }, members: [{ user_id: "u" }], profiles: [{ company_name: "Acme" }] });
    expect(await isOnboardingRecorded(state, "a")).toBe(true);
  });

  it("fails instead of guessing when a read fails", async () => {
    await expect(isOnboardingRecorded(db({ fail: "accounts" }), "a")).rejects.toThrow("Onboarding state unavailable");
    await expect(isOnboardingRecorded(db({ accounts: { onboarding_completed_at: null }, fail: "account_members" }), "a")).rejects.toThrow("Onboarding state unavailable");
  });
});

// A fake Inngest step: `recordedAt` is what the account says on each read, `settledAt` whether an ignored offer is settled on each
// round, `eventAt` what each wait receives.
function fakeStep(options: { recordedAt?: (read: number) => boolean; settledAt?: (round: number) => boolean; eventAt?: (round: number) => boolean }) {
  const { recordedAt = () => false, settledAt = () => false, eventAt = () => false } = options;
  const calls: string[] = [];
  let reads = 0;
  const step: GateStep = {
    run: async (id) => {
      calls.push(id);
      return id.startsWith("settle-ignored-offer-") ? settledAt(Number(id.split("-").pop())) : recordedAt(reads++);
    },
    waitForEvent: async (id, waitOptions) => {
      calls.push(id);
      expect(waitOptions.event).toBe("onboarding/completed");
      expect(waitOptions.if).toBe('async.data.accountId == "acc-1"');
      return eventAt(Number(id.split("-").pop())) ? { name: waitOptions.event } : null;
    },
  };
  return { step, calls };
}

describe("waitForOnboarding", () => {
  const db = {} as SupabaseClient;

  it("lets Tier 2 start at once when the onboarding is already recorded", async () => {
    const { step, calls } = fakeStep({ recordedAt: () => true });
    expect(await waitForOnboarding(step, db, "acc-1")).toBe("already_recorded");
    expect(calls).toEqual(["check-onboarding-recorded"]);
  });

  it("holds Tier 2 until the completion event arrives", async () => {
    const { step, calls } = fakeStep({ eventAt: (round) => round === 2 });
    expect(await waitForOnboarding(step, db, "acc-1")).toBe("completed");
    expect(calls).toEqual([
      "check-onboarding-recorded",
      "settle-ignored-offer-0", "await-onboarding-0", "recheck-onboarding-0",
      "settle-ignored-offer-1", "await-onboarding-1", "recheck-onboarding-1",
      "settle-ignored-offer-2", "await-onboarding-2",
    ]);
  });

  it("finds a completion that raced the wait by reading the account again", async () => {
    const { step } = fakeStep({ recordedAt: (read) => read >= 3 });
    expect(await waitForOnboarding(step, db, "acc-1")).toBe("recorded_during_wait");
  });

  it("goes on once an offer the owner ignored has been settled as other", async () => {
    const { step, calls } = fakeStep({ settledAt: (round) => round === 1 });
    expect(await waitForOnboarding(step, db, "acc-1")).toBe("settled_as_other");
    expect(calls.at(-1)).toBe("settle-ignored-offer-1");
  });

  it("goes on without assigning anything after the last round", async () => {
    const { step, calls } = fakeStep({});
    expect(await waitForOnboarding(step, db, "acc-1")).toBe("timed_out");
    expect(calls).toHaveLength(1 + ONBOARDING_WAIT_ROUNDS * 3);
  });
});

// The accounts table as the settle reads and writes it.
function accounts(row: { industry: string | null; onboarding_offered_at: string | null; onboarding_completed_at: string | null } | null, options: { raced?: boolean; failRead?: boolean } = {}) {
  const writes: Array<Record<string, unknown>> = [];
  const db = {
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is"]) chain[method] = () => chain;
      chain.update = (values: Record<string, unknown>) => { writes.push(values); return chain; };
      chain.maybeSingle = async () => {
        if (options.failRead) return { data: null, error: { message: "timeout" } };
        // The update asks for the row back; a lost race returns nothing.
        return writes.length ? { data: options.raced ? null : { id: "acc-1" }, error: null } : { data: row, error: null };
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { db, writes };
}

const now = new Date("2026-11-05T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe("settleIgnoredOffer", () => {
  it("settles an offer left unanswered past the grace period as other", async () => {
    const { db, writes } = accounts({ industry: null, onboarding_offered_at: minutesAgo(45), onboarding_completed_at: null });
    expect(await settleIgnoredOffer(db, "acc-1", now)).toBe(true);
    expect(writes).toEqual([{ industry: "other", onboarding_completed_at: now.toISOString() }]);
  });

  it("leaves the offer alone while the owner may still be answering", async () => {
    const { db, writes } = accounts({ industry: null, onboarding_offered_at: minutesAgo(10), onboarding_completed_at: null });
    expect(await settleIgnoredOffer(db, "acc-1", now)).toBe(false);
    expect(writes).toEqual([]);
  });

  it("never assigns anything to an account that was not offered the choice", async () => {
    const { db, writes } = accounts({ industry: null, onboarding_offered_at: null, onboarding_completed_at: null });
    expect(await settleIgnoredOffer(db, "acc-1", now)).toBe(false);
    expect(writes).toEqual([]);
  });

  it("does nothing once the onboarding is finished", async () => {
    const { db, writes } = accounts({ industry: "legal", onboarding_offered_at: minutesAgo(90), onboarding_completed_at: minutesAgo(80) });
    expect(await settleIgnoredOffer(db, "acc-1", now)).toBe(false);
    expect(writes).toEqual([]);
  });

  it("does not report a settle that lost the race to the owner's own answer", async () => {
    const { db } = accounts({ industry: null, onboarding_offered_at: minutesAgo(45), onboarding_completed_at: null }, { raced: true });
    expect(await settleIgnoredOffer(db, "acc-1", now)).toBe(false);
  });

  it("fails instead of guessing when the account cannot be read", async () => {
    const { db } = accounts(null, { failRead: true });
    await expect(settleIgnoredOffer(db, "acc-1", now)).rejects.toThrow("Onboarding state unavailable");
  });
});
