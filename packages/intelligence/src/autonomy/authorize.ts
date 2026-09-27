// ---------------------------------------------------------------------------
// KAI-55 — the trust-policy layer the plan calls for: combine what a
// provider claims about one call with what the account has earned about the
// class, into one authorization. Pure function, no I/O — apps/api's
// tier1/backfill proposal-status gates (backfillProposalDecision,
// tier1ProposalDecision) already implement the abstain / business-context /
// earned-permission gates this reuses; this is not a replacement for them,
// it is the one addition their own comment names as deliberately withheld:
//
//   "Not from the model's self-reported confidence, which was measured and
//   does not separate right from wrong (ADR-027)"
//
// That finding was about Anthropic/Ollama. It does not generalize to every
// provider by default — passing `calibratedConfidence` is opt-in per call,
// and a caller may only pass it for a provider whose confidence was
// separately measured to be trustworthy on the axes that determine
// ticket_type; the measurement is provisional on a small eval sample until a
// replay confirms it holds, which is why a confident call still only
// reaches `automatic` after the account has separately earned auto-approval
// for the class — a single well-calibrated call is not a substitute for
// measured account-level precision, it is an extra condition on top of it.
//
// Not wired into any pipeline call site. Wiring a real decision source into
// tier1/backfill's gates needs a canary — one account, one low-risk class,
// reversible, with rollback conditions none of which are decided yet.
// ---------------------------------------------------------------------------

export type ActionMode = 'automatic' | 'suggestion' | 'human_required';

export type ActionAuthorizationReason =
  | 'abstain'
  | 'no_business_context'
  | 'auto_approval_not_earned'
  | 'low_calibrated_confidence'
  | 'auto_approval_earned';

export interface ActionAuthorization {
  allowed: boolean;
  mode: ActionMode;
  reason: ActionAuthorizationReason;
}

export interface AuthorizeTicketTypeActionInput {
  /** From `ticket_type_auto_approval` (`computeTrustStatsByType` / `resolveAutoApprovalEnabled`): this account has earned auto-approval for this ticket_type. */
  autoApprovalEnabled: boolean;
  /** A second opinion disagreed with this call's type — same meaning as tier1ProposalDecision/backfillProposalDecision's `abstain`. */
  abstain: boolean;
  /** backfill only (per backfillProposalDecision); omit for tier1, where a human is already watching and this gate does not apply. */
  hasBusinessContext?: boolean;
  /**
   * This call's own confidence, 0-1, from a provider whose confidence was
   * separately measured to separate right answers from wrong ones. Omit for
   * a provider that has not been measured, or was measured and failed
   * (Anthropic/Ollama, ADR-027) — an omitted value never downgrades a call
   * the account has already earned the right to auto-approve.
   */
  calibratedConfidence?: number;
  /** Below this, an account-earned call downgrades to `suggestion` instead of `automatic`. Default 0.70. */
  confidenceThreshold?: number;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/**
 * The account+type permission is a statement about the class on average
 * (`resolveAutoApprovalEnabled`); a low `calibratedConfidence` is a
 * statement about this one email. Both must hold for `automatic` — the
 * account's history does not vouch for a call the provider itself is unsure
 * of, and a provider's confidence never substitutes for a class the account
 * has not earned.
 */
export function authorizeTicketTypeAction(input: AuthorizeTicketTypeActionInput): ActionAuthorization {
  if (input.abstain) {
    return { allowed: false, mode: 'human_required', reason: 'abstain' };
  }
  if (input.hasBusinessContext === false) {
    return { allowed: false, mode: 'human_required', reason: 'no_business_context' };
  }
  if (!input.autoApprovalEnabled) {
    return { allowed: false, mode: 'suggestion', reason: 'auto_approval_not_earned' };
  }
  if (input.calibratedConfidence !== undefined) {
    const threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
    if (input.calibratedConfidence < threshold) {
      return { allowed: false, mode: 'suggestion', reason: 'low_calibrated_confidence' };
    }
  }
  return { allowed: true, mode: 'automatic', reason: 'auto_approval_earned' };
}
