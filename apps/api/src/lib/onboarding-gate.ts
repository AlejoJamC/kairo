import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/** Each wait ends after this long so a completion that raced the wait is found by the next read. */
export const ONBOARDING_WAIT_ROUND = "10m";
/** Rounds before the pipeline continues with the default settings (24 hours). */
export const ONBOARDING_WAIT_ROUNDS = 144;

/**
 * Whether the owner already finished or skipped the onboarding walkthrough.
 * Accounts that predate the completion record count as finished when their
 * owner's profile has a company name, which the wizard saves last.
 * apps/landing/lib/onboarding-state.ts applies the same rule at sign-in.
 */
export async function isOnboardingRecorded(db: DbClient, accountId: string): Promise<boolean> {
  const account = await db.from("accounts").select("onboarding_completed_at").eq("id", accountId).maybeSingle();
  if (account.error) throw new Error(`Onboarding state unavailable: ${account.error.message}`);
  if (account.data?.onboarding_completed_at) return true;

  const owners = await db.from("account_members").select("user_id").eq("account_id", accountId)
    .eq("role", "owner").eq("status", "active");
  if (owners.error) throw new Error(`Onboarding state unavailable: ${owners.error.message}`);
  const ownerIds = (owners.data ?? []).map((row) => row.user_id as string);
  if (ownerIds.length === 0) return false;

  const profiles = await db.from("profiles").select("company_name").in("id", ownerIds);
  if (profiles.error) throw new Error(`Onboarding state unavailable: ${profiles.error.message}`);
  return (profiles.data ?? []).some((row) => Boolean((row.company_name as string | null)?.trim()));
}
