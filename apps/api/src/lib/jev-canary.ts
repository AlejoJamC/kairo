import {
  classifyEmailWithJev,
  createDecisionProvider,
  authorizeTicketTypeAction,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type DecisionProvider,
  type DecisionResult,
  type EmailMessage,
  type TicketType,
} from "@kairo/intelligence";
import { getFlag } from "@kairo/feature-flags";

// ---------------------------------------------------------------------------
// KAI-55 — canary. The one place JEV's decision is allowed to change a real
// ticket, scoped to an explicit tenant-mailbox allowlist (not account_id —
// an account can be torn down and recreated per run, the tenant's own
// mailbox is the stable thing to gate on). Strictly additive in both paths
// below: a proposal that already stands on its own is never touched, and
// this only ever turns a `pending` into `auto_approved`, never the reverse.
//
// Two different rules, because tier1 and backfill are not the same
// situation:
//
// - Backfill (tier2/tier3) runs with nobody watching, so its own
//   proposal-status gate (backfillProposalStatus) requires a class to have
//   *earned* auto-approval from measured account history
//   (ticket_type_auto_approval). jevCanaryUpgrade adds JEV's confidence on
//   top of that earned permission — it can never substitute for it. An
//   account with no review history yet (freshly created, as onboarding
//   test accounts always are) has earned nothing, so this path does
//   nothing for it — correctly: unsupervised auto-approval past what a
//   human has already vouched for is exactly the case
//   backfillProposalStatus exists to prevent.
//
// - Tier1 (the onboarding fast-path) already runs with a human watching —
//   its own gate (tier1ProposalStatus) auto-approves `support`
//   unconditionally, no earned history required, for that reason.
//   jevCanaryUpgradeTier1 matches that same standard: agreement with the
//   primary classification plus JEV's own confidence is enough, with no
//   ticket_type_auto_approval lookup, because tier1 never required one in
//   the first place.
// ---------------------------------------------------------------------------

function canaryMailboxes(): Set<string> {
  const raw = process.env["FEATURE_FLAG_JEV_CANARY_MAILBOXES"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** `tenantMailbox` is the address Kairo is reading for this account — the same value every classifyEmailWithMeta call already sends. */
export function isJevCanaryTenant(tenantMailbox: string): boolean {
  return getFlag("enable_jev_canary") && canaryMailboxes().has(tenantMailbox.trim().toLowerCase());
}

interface JevCanaryDeps {
  createProvider: () => DecisionProvider;
  classify: typeof classifyEmailWithJev;
}

const defaultDeps: JevCanaryDeps = {
  createProvider: createDecisionProvider,
  classify: classifyEmailWithJev,
};

/** The raw per-question answer shape `decision.value` carries at runtime — see classify-with-jev.ts's own `as unknown as` cast for the same fact. */
interface RawChoiceAnswer {
  confidence: number;
}

function ticketTypeConfidence(decision: DecisionResult<unknown>): number {
  const rawAnswers = decision.value as unknown as Record<string, RawChoiceAnswer>;
  return Math.min(rawAnswers["actionability"]?.confidence ?? 0, rawAnswers["subject_matter"]?.confidence ?? 0);
}

interface AskJevInput {
  accountId: string;
  message: EmailMessage;
  primaryType: TicketType;
}

/** Asks JEV and returns its ticket_type confidence only when it agrees with the primary classification; null on disagreement or any failure. */
async function askJevForAgreement(input: AskJevInput, deps: JevCanaryDeps): Promise<number | null> {
  try {
    const provider = deps.createProvider();
    const { result, decision } = await deps.classify(input.message, provider, { accountId: input.accountId });
    if (result.type !== input.primaryType) return null;
    return ticketTypeConfidence(decision);
  } catch (err) {
    console.warn(
      `[jev-canary] check failed for account ${input.accountId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export interface JevCanaryUpgradeInput {
  accountId: string;
  message: EmailMessage;
  /** The type classifyEmailWithMeta already decided; JEV upgrades a proposal only when it agrees. */
  primaryType: TicketType;
  /** From `ticket_type_auto_approval`, resolved once per run like backfillProposalStatus's own input. */
  autoApprovalEnabled: boolean;
  hasBusinessContext: boolean;
}

/**
 * Backfill path. Whether JEV's own opinion is enough to upgrade a `pending`
 * backfill proposal to `auto_approved` — only ever on top of an
 * already-earned account permission (`authorizeTicketTypeAction`), never
 * instead of one.
 */
export async function jevCanaryUpgrade(
  input: JevCanaryUpgradeInput,
  deps: JevCanaryDeps = defaultDeps,
): Promise<boolean> {
  const confidence = await askJevForAgreement(input, deps);
  if (confidence === null) return false;

  const authorization = authorizeTicketTypeAction({
    autoApprovalEnabled: input.autoApprovalEnabled,
    abstain: false,
    hasBusinessContext: input.hasBusinessContext,
    calibratedConfidence: confidence,
  });
  return authorization.mode === "automatic";
}

export interface JevCanaryUpgradeTier1Input {
  accountId: string;
  message: EmailMessage;
  primaryType: TicketType;
  confidenceThreshold?: number;
}

/**
 * Tier1 (onboarding) path. No `ticket_type_auto_approval` lookup — tier1's
 * own gate never required earned account history either, because a human
 * reviews the onboarding scan already. Agreement plus a confident JEV call
 * is enough, from the very first message a freshly created account ever
 * sees.
 */
export async function jevCanaryUpgradeTier1(
  input: JevCanaryUpgradeTier1Input,
  deps: JevCanaryDeps = defaultDeps,
): Promise<boolean> {
  const confidence = await askJevForAgreement(input, deps);
  if (confidence === null) return false;
  return confidence >= (input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
}
