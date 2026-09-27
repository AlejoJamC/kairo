import {
  classifyEmailWithJev,
  createDecisionProvider,
  authorizeTicketTypeAction,
  type DecisionProvider,
  type EmailMessage,
  type TicketType,
} from "@kairo/intelligence";
import { getFlag } from "@kairo/feature-flags";

// ---------------------------------------------------------------------------
// KAI-55 — canary. The one place JEV's decision is allowed to change a real
// ticket, scoped to an explicit account allowlist. Strictly additive: a
// backfill proposal that would already stand on its own is never touched
// here, and this only ever turns a `pending` into `auto_approved`, never the
// reverse — disagreement, low confidence, or any failure of this check
// leaves the proposal exactly as backfillProposalStatus already decided it.
// ---------------------------------------------------------------------------

function canaryAccountIds(): Set<string> {
  const raw = process.env["FEATURE_FLAG_JEV_CANARY_ACCOUNT_IDS"] ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isJevCanaryAccount(accountId: string): boolean {
  return getFlag("enable_jev_canary") && canaryAccountIds().has(accountId);
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

/**
 * Whether JEV's own opinion is enough to upgrade a `pending` backfill
 * proposal to `auto_approved`. Never awaited by any caller that cannot
 * afford to wait for it — this is a synchronous gate on the proposal write,
 * not a fire-and-forget shadow call, so callers only reach it for the
 * accounts `isJevCanaryAccount` names.
 */
export async function jevCanaryUpgrade(
  input: JevCanaryUpgradeInput,
  deps: JevCanaryDeps = defaultDeps,
): Promise<boolean> {
  try {
    const provider = deps.createProvider();
    const { result, decision } = await deps.classify(input.message, provider, { accountId: input.accountId });

    if (result.type !== input.primaryType) return false;

    const rawAnswers = decision.value as unknown as Record<string, RawChoiceAnswer>;
    const ticketTypeConfidence = Math.min(
      rawAnswers["actionability"]?.confidence ?? 0,
      rawAnswers["subject_matter"]?.confidence ?? 0,
    );

    const authorization = authorizeTicketTypeAction({
      autoApprovalEnabled: input.autoApprovalEnabled,
      abstain: false,
      hasBusinessContext: input.hasBusinessContext,
      calibratedConfidence: ticketTypeConfidence,
    });

    return authorization.mode === "automatic";
  } catch (err) {
    console.warn(
      `[jev-canary] upgrade check failed for account ${input.accountId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
