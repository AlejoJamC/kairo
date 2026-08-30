import type { TicketType } from "@kairo/intelligence";
import { supabase } from "../../lib/supabase.js";
import type { ProposalStatus } from "./tier1-proposal-status.js";

export interface BackfillProposalInput {
  type: TicketType;
  /** The tenant's line of business, as it reached the classifier. */
  businessContext?: string;
  /**
   * Whether this account has earned the right to auto-approve this class, from
   * `ticket_type_auto_approval`. Earned from measured precision over a minimum
   * sample; never set by hand.
   */
  autoApprovalEnabled: boolean;
}

/**
 * Whether a `backfill` classification stands on its own.
 *
 * `backfill` is the stage name the rest of the pipeline already uses for
 * everything that is not the Tier 1 onboarding scan — see ClassifierStage in
 * lib/classifier-input.ts, which decides what body and what tenant context
 * these same call sites send. Tier 2 and Tier 3 are the ones that write a
 * proposal today.
 *
 * Two gates, and the first one is not negotiable by measurement.
 *
 * **Without the business context, nothing stands.** A classification made
 * without knowing what the company does is not trusted by default. The bench
 * backs the shape of it: the call to keep an email *out* of the queue drops
 * from 56-83% with the context to 32-47% without, and that is the call whose
 * error buries a real customer request. The `support` call holds either way
 * (92-97%), so this gate is stricter than the numbers require — deliberately,
 * because these tiers run with nobody watching at all.
 *
 * **With it, the class has to have earned the permission.** Per account, per
 * class, from precision measured over a minimum sample. Not from the model's
 * self-reported confidence, which was measured and does not separate right from
 * wrong (ADR-027), and not from a class hardcoded here: Tier 1 can name
 * `support` because a human is watching it, these tiers cannot.
 *
 * Everything else waits. `pending` is the honest state for a label nobody has
 * checked and nothing has vouched for.
 */
export function backfillProposalStatus(input: BackfillProposalInput): ProposalStatus {
  if (!input.businessContext) return "pending";
  return input.autoApprovalEnabled ? "auto_approved" : "pending";
}

/**
 * The classes this account may auto-approve, from `ticket_type_auto_approval`.
 *
 * Resolve once per run and reuse it for every email, the way the tenant context
 * already is — it is per-account state, not per-email state.
 *
 * Never throws, and an unreadable table yields nothing. Failing closed here
 * costs a review that was not needed; failing open would auto-approve on a
 * permission nobody could confirm.
 */
export async function autoApprovedTypes(accountId: string): Promise<TicketType[]> {
  try {
    const { data, error } = await supabase
      .from("ticket_type_auto_approval")
      .select("ticket_type")
      .eq("account_id", accountId)
      .eq("auto_approval_enabled", true);

    if (error) {
      console.warn(`[backfill-proposal-status] thresholds unreadable for account ${accountId}: ${error.message}`);
      return [];
    }
    return (data ?? []).map((r) => r.ticket_type as TicketType);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[backfill-proposal-status] thresholds unreadable for account ${accountId}: ${message}`);
    return [];
  }
}
