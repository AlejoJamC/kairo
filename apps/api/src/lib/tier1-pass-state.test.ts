import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tier1PassState } from "./tier1-pass-state.js";

type Status = "classified" | "skipped" | "failed" | "failed_permanent" | "pending";
interface Row { processing_tier: number; classification_status: Status }

// A minimal `messages` table: each query narrows by the columns it filters on.
function db(rows: Row[], fail = false): SupabaseClient {
  return {
    from: () => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => { filters[column] = value; return chain; },
        limit: () => chain,
        maybeSingle: async () => {
          if (fail) return { data: null, error: { message: "connection timeout" } };
          const match = rows.find((row) => Object.entries(filters)
            .every(([column, value]) => column === "account_id" || row[column as keyof Row] === value));
          return { data: match ? { id: "row" } : null, error: null };
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("tier1PassState", () => {
  it("is not_run when Tier 1 never wrote a row", async () => {
    expect(await tier1PassState(db([]), "acme")).toBe("not_run");
  });

  it("ignores rows written by the ongoing poll", async () => {
    expect(await tier1PassState(db([{ processing_tier: 0, classification_status: "failed" }]), "acme")).toBe("not_run");
  });

  it("is failed when the pass classified nothing and left failed rows, even with skipped ones", async () => {
    const rows: Row[] = [
      { processing_tier: 1, classification_status: "skipped" },
      { processing_tier: 1, classification_status: "failed" },
    ];
    expect(await tier1PassState(db(rows), "acme")).toBe("failed");
  });

  it("is done once anything was classified, even if other rows failed", async () => {
    const rows: Row[] = [
      { processing_tier: 1, classification_status: "failed" },
      { processing_tier: 1, classification_status: "classified" },
    ];
    expect(await tier1PassState(db(rows), "acme")).toBe("done");
  });

  it("is done when every email was skipped", async () => {
    expect(await tier1PassState(db([{ processing_tier: 1, classification_status: "skipped" }]), "acme")).toBe("done");
  });

  it("throws when the state cannot be read, so the run retries instead of guessing", async () => {
    await expect(tier1PassState(db([], true), "acme")).rejects.toThrow("Tier 1 pass state unavailable");
  });
});
