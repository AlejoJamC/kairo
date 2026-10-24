import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

async function hasRow(
  client: DbClient,
  table: "oauth_credentials" | "messages",
  filters: Record<string, string | number>,
): Promise<boolean | null> {
  let query = client.from(table).select("id");
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  const { data, error } = await query.limit(1).maybeSingle();
  return error ? null : data !== null;
}

/**
 * Decides whether the login should dispatch the onboarding pass, and names the
 * attempt for the event id. Same rule as apps/api/src/lib/tier1-pass-state.ts,
 * read from the rows Tier 1 writes (one per email; the retry sweep keeps the tier):
 *
 * - no Tier 1 row — the pass never ran: dispatch (`not_run`);
 * - Tier 1 rows, none classified, some `failed` — the pass hit an error and
 *   produced nothing: dispatch again (`failed`);
 * - anything classified, or every email skipped — the pass is done: no dispatch.
 *
 * The account also needs a Gmail credential, which Tier 1 reads. The attempt
 * carries the hour, so repeated logins collapse into one run per hour while a
 * pass that failed earlier can still be dispatched again. Any lookup error
 * means no dispatch: the next login decides again.
 */
export async function onboardingDispatchAttempt(
  client: DbClient,
  accountId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const credential = await hasRow(client, "oauth_credentials", { account_id: accountId, provider: "gmail" });
  if (!credential) return null;

  const tier1 = { account_id: accountId, processing_tier: 1 };
  const classified = await hasRow(client, "messages", { ...tier1, classification_status: "classified" });
  if (classified !== false) return null;
  const failed = await hasRow(client, "messages", { ...tier1, classification_status: "failed" });
  if (failed === null) return null;
  const state = failed ? "failed" : await hasRow(client, "messages", tier1) === false ? "not_run" : null;
  if (state === null) return null;

  return `${state}:${now.toISOString().slice(0, 13)}`;
}
