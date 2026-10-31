import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isOnboardingRecorded } from "./onboarding-gate";

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
