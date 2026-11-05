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

/** How long an offer can stay unanswered before the owner is taken to have passed on the choice. */
export const ONBOARDING_OFFER_GRACE_MS = 30 * 60 * 1000;

/**
 * Settles an offer the owner left unanswered: the setup was shown (`onboarding_offered_at` is the
 * evidence), nothing was decided within the grace period, so the industry is recorded as `other`
 * and the onboarding as finished. An account that was never offered is left alone: nothing proves
 * the owner had the chance to choose. Returns whether it settled the account.
 */
export async function settleIgnoredOffer(db: DbClient, accountId: string, now: Date = new Date()): Promise<boolean> {
  const account = await db.from("accounts").select("industry, onboarding_offered_at, onboarding_completed_at").eq("id", accountId).maybeSingle();
  if (account.error) throw new Error(`Onboarding state unavailable: ${account.error.message}`);
  const row = account.data as { industry: string | null; onboarding_offered_at: string | null; onboarding_completed_at: string | null } | null;
  if (!row?.onboarding_offered_at || row.onboarding_completed_at) return false;
  if (now.getTime() - new Date(row.onboarding_offered_at).getTime() < ONBOARDING_OFFER_GRACE_MS) return false;

  const settled = await db.from("accounts")
    .update({ industry: row.industry ?? "other", onboarding_completed_at: now.toISOString() })
    .eq("id", accountId).is("onboarding_completed_at", null).select("id").maybeSingle();
  if (settled.error) throw new Error(`Onboarding state unavailable: ${settled.error.message}`);
  return Boolean(settled.data);
}

/** The part of an Inngest step the wait uses. */
export interface GateStep {
  run(id: string, fn: () => Promise<boolean>): Promise<boolean>;
  waitForEvent(id: string, options: { event: string; timeout: string; if: string }): Promise<unknown>;
}

export type OnboardingGateOutcome = "already_recorded" | "completed" | "recorded_during_wait" | "settled_as_other" | "timed_out";

/**
 * Holds Tier 2 and Tier 3 until the onboarding is recorded, whatever the owner chose (setup, skip,
 * or the dashboard overlay). Tier 1 has already read its emails by now. Each round first settles an
 * offer the owner ignored, then waits for the completion event; it also reads the account again, so
 * an event that raced the wait is not lost. After the last round the pass goes on without assigning
 * anything: with no proof the choice was offered, the account keeps being offered it.
 */
export async function waitForOnboarding(step: GateStep, db: DbClient, accountId: string): Promise<OnboardingGateOutcome> {
  if (await step.run("check-onboarding-recorded", () => isOnboardingRecorded(db, accountId))) return "already_recorded";
  for (let round = 0; round < ONBOARDING_WAIT_ROUNDS; round++) {
    if (await step.run(`settle-ignored-offer-${round}`, () => settleIgnoredOffer(db, accountId))) return "settled_as_other";
    const event = await step.waitForEvent(`await-onboarding-${round}`, {
      event: "onboarding/completed",
      timeout: ONBOARDING_WAIT_ROUND,
      if: `async.data.accountId == "${accountId}"`,
    });
    if (event) return "completed";
    if (await step.run(`recheck-onboarding-${round}`, () => isOnboardingRecorded(db, accountId))) return "recorded_during_wait";
  }
  return "timed_out";
}
