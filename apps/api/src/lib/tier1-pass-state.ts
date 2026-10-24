import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Where an account's onboarding pass stands, read from the rows Tier 1 writes
 * (one per email: classified, skipped or failed; the retry sweep keeps the tier).
 *
 * - `not_run` — no Tier 1 row: the pass never started.
 * - `failed`  — Tier 1 rows exist, none classified, some still `failed`: the
 *               pass ran into an error and produced nothing; it may run again.
 * - `done`    — something was classified, or every email was skipped.
 *
 * apps/landing/lib/onboarding-state.ts applies the same rule before dispatch.
 */
export type Tier1PassState = "not_run" | "failed" | "done";

async function hasTier1Row(db: DbClient, accountId: string, status?: string): Promise<boolean> {
  let query = db.from("messages").select("id").eq("account_id", accountId).eq("processing_tier", 1);
  if (status) query = query.eq("classification_status", status);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new Error(`Tier 1 pass state unavailable: ${error.message}`);
  return data !== null;
}

export async function tier1PassState(db: DbClient, accountId: string): Promise<Tier1PassState> {
  if (await hasTier1Row(db, accountId, "classified")) return "done";
  if (await hasTier1Row(db, accountId, "failed")) return "failed";
  return (await hasTier1Row(db, accountId)) ? "done" : "not_run";
}
