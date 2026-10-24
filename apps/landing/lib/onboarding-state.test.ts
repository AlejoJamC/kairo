import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onboardingDispatchAttempt } from "./onboarding-state";

type Status = "classified" | "skipped" | "failed" | "failed_permanent";
interface Message { processing_tier: number; classification_status: Status }

// Minimal tables: each query matches rows on the columns it filters by.
function client(opts: { credential?: boolean; messages?: Message[]; failTable?: "oauth_credentials" | "messages" }): SupabaseClient {
  return {
    from: (table: "oauth_credentials" | "messages") => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
        limit: () => chain,
        maybeSingle: async () => {
          if (opts.failTable === table) return { data: null, error: { message: "connection timeout" } };
          if (table === "oauth_credentials") return { data: opts.credential ? { id: "cred" } : null, error: null };
          const match = (opts.messages ?? []).find((row) => Object.entries(filters)
            .every(([column, value]) => column === "account_id" || row[column as keyof Message] === value));
          return { data: match ? { id: "msg" } : null, error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const now = new Date("2026-10-24T22:41:00Z");

describe("onboardingDispatchAttempt", () => {
  it("dispatches a pass that never ran", async () => {
    expect(await onboardingDispatchAttempt(client({ credential: true }), "acme", now)).toBe("not_run:2026-10-24T22");
  });

  it("ignores rows written by the ongoing poll", async () => {
    const messages: Message[] = [{ processing_tier: 0, classification_status: "failed" }];
    expect(await onboardingDispatchAttempt(client({ credential: true, messages }), "acme", now)).toBe("not_run:2026-10-24T22");
  });

  it("dispatches again a pass that classified nothing and left failed rows", async () => {
    const messages: Message[] = [
      { processing_tier: 1, classification_status: "skipped" },
      { processing_tier: 1, classification_status: "failed" },
    ];
    expect(await onboardingDispatchAttempt(client({ credential: true, messages }), "acme", now)).toBe("failed:2026-10-24T22");
  });

  it("does not dispatch once anything was classified", async () => {
    const messages: Message[] = [
      { processing_tier: 1, classification_status: "failed" },
      { processing_tier: 1, classification_status: "classified" },
    ];
    expect(await onboardingDispatchAttempt(client({ credential: true, messages }), "acme", now)).toBeNull();
  });

  it("does not dispatch when every email was skipped", async () => {
    const messages: Message[] = [{ processing_tier: 1, classification_status: "skipped" }];
    expect(await onboardingDispatchAttempt(client({ credential: true, messages }), "acme", now)).toBeNull();
  });

  it("does not dispatch without a Gmail credential", async () => {
    expect(await onboardingDispatchAttempt(client({ credential: false }), "acme", now)).toBeNull();
  });

  it("does not dispatch when a lookup fails", async () => {
    expect(await onboardingDispatchAttempt(client({ credential: true, failTable: "oauth_credentials" }), "acme", now)).toBeNull();
    expect(await onboardingDispatchAttempt(client({ credential: true, failTable: "messages" }), "acme", now)).toBeNull();
  });
});
