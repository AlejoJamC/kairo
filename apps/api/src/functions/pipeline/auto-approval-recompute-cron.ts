// ---------------------------------------------------------------------------
// KAI-55 — the computation ticket_type_auto_approval (ADR-027) never got.
//
// Deliberately independent Inngest function, same shape as
// escalation-check-cron.ts. Runs on a schedule (default every 30 minutes,
// configurable via FEATURE_FLAG_AUTO_APPROVAL_RECOMPUTE_INTERVAL_MINUTES)
// and, for every account with human review activity on ticket_type,
// recomputes current_precision / current_sample_count / auto_approval_enabled
// on ticket_type_auto_approval from ticket_classification_history — the
// append-only ledger `/correct-classification` and `/classify-approve`
// already write to, live, today.
//
// Gated OFF by default via `enable_auto_approval_recompute`: until this
// runs, backfill (tier2/tier3) auto-approves nothing, exactly as it does
// today with an empty table.
// ---------------------------------------------------------------------------

import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { getFlag, getNumericFlag } from "@kairo/feature-flags";
import { buildIntervalCronExpression } from "../../lib/cron-interval.js";
import { computeTrustStatsByType, resolveAutoApprovalEnabled } from "@kairo/intelligence";
import { TICKET_TYPES } from "@kairo/types";

const intervalMinutes = Math.max(
  1,
  Math.floor(getNumericFlag("auto_approval_recompute_interval_minutes"))
);
const CRON_EXPRESSION = buildIntervalCronExpression(intervalMinutes);

// The two ticket_classification_history actor_refs that represent a human
// verdict on an existing classification, as opposed to a classification
// pass (AI or human-triggered) setting a value in the first place. See
// trust.ts's evidenceFor() for what each one means.
const REVIEW_ACTOR_REFS = ["tickets.classify-approve", "tickets.correct-classification"];

// Bounds one account's history fetch. Generous relative to
// TRUST_REVIEW_WINDOW (50) x TICKET_TYPES.length (5) so that no type's last
// 50 pieces of evidence fall outside it in ordinary use; not a hard
// guarantee for a single pathologically over-reviewed type, which would
// simply see a shorter effective window that tick.
const HISTORY_FETCH_LIMIT = 500;

// The table's own column defaults (20260926212006 migration) — used only
// when an account has no row yet for a type, so this cron does not have to
// guess at a default independently of the schema that owns it.
const DEFAULT_MIN_PRECISION = 0.9;
const DEFAULT_MIN_SAMPLE_SIZE = 30;

interface HistoryRow {
  actor_ref: string | null;
  to_value: string | null;
  from_value: string | null;
  applied: boolean;
}

interface ThresholdRow {
  ticket_type: string;
  min_precision: number;
  min_sample_size: number;
}

export const autoApprovalRecomputeCron = inngest.createFunction(
  {
    id: "auto-approval-recompute-cron",
    retries: 0,
    triggers: [{ cron: CRON_EXPRESSION }],
  },
  async ({ step, logger }) => {
    if (!getFlag("enable_auto_approval_recompute")) {
      logger.info("[auto-approval-recompute-cron] flag disabled — skipping tick");
      return { accountsUpdated: 0 };
    }

    const accountIds = await step.run("list-accounts-with-review-activity", async () => {
      const { data, error } = await supabase
        .from("ticket_classification_history")
        .select("account_id")
        .eq("dimension", "ticket_type")
        .in("actor_ref", REVIEW_ACTOR_REFS);

      if (error) {
        throw new Error(`[auto-approval-recompute-cron] failed to list accounts: ${error.message}`);
      }
      return [...new Set((data ?? []).map((r) => r["account_id"] as string))];
    });

    let accountsUpdated = 0;

    for (const accountId of accountIds) {
      const rowsWritten = await step.run(`recompute-${accountId}`, async () => recomputeForAccount(accountId, logger));
      accountsUpdated += rowsWritten > 0 ? 1 : 0;
    }

    logger.info(`[auto-approval-recompute-cron] recomputed ${accountsUpdated} account(s)`);
    return { accountsUpdated };
  }
);

async function recomputeForAccount(
  accountId: string,
  logger: { error: (msg: string) => void }
): Promise<number> {
  const { data: history, error: historyErr } = await supabase
    .from("ticket_classification_history")
    .select("actor_ref, to_value, from_value, applied")
    .eq("account_id", accountId)
    .eq("dimension", "ticket_type")
    .in("actor_ref", REVIEW_ACTOR_REFS)
    .order("occurred_at", { ascending: false })
    .limit(HISTORY_FETCH_LIMIT);

  if (historyErr) {
    logger.error(`[auto-approval-recompute-cron] history unreadable for account ${accountId}: ${historyErr.message}`);
    return 0;
  }

  const statsByType = computeTrustStatsByType(
    ((history ?? []) as HistoryRow[]).map((row) => ({
      actorRef: row.actor_ref ?? "",
      toValue: row.to_value,
      fromValue: row.from_value,
      applied: row.applied,
    }))
  );
  const statsMap = new Map(statsByType.map((s) => [s.ticketType, s]));

  const { data: thresholds, error: thresholdsErr } = await supabase
    .from("ticket_type_auto_approval")
    .select("ticket_type, min_precision, min_sample_size")
    .eq("account_id", accountId);

  if (thresholdsErr) {
    logger.error(`[auto-approval-recompute-cron] thresholds unreadable for account ${accountId}: ${thresholdsErr.message}`);
    return 0;
  }

  const thresholdByType = new Map(
    ((thresholds ?? []) as ThresholdRow[]).map((t) => [t.ticket_type, t])
  );
  const now = new Date().toISOString();
  let written = 0;

  for (const ticketType of TICKET_TYPES) {
    const stats = statsMap.get(ticketType) ?? { ticketType, precision: null, sampleCount: 0 };
    const existing = thresholdByType.get(ticketType);
    // Preserves a tenant's own threshold when a row already exists; a type
    // with no row yet gets the schema's own default, never a value this
    // cron invents independently of it.
    const minPrecision = existing?.min_precision ?? DEFAULT_MIN_PRECISION;
    const minSampleSize = existing?.min_sample_size ?? DEFAULT_MIN_SAMPLE_SIZE;

    const { error: upsertErr } = await supabase.from("ticket_type_auto_approval").upsert(
      {
        account_id: accountId,
        ticket_type: ticketType,
        min_precision: minPrecision,
        min_sample_size: minSampleSize,
        current_precision: stats.precision,
        current_sample_count: stats.sampleCount,
        auto_approval_enabled: resolveAutoApprovalEnabled(stats, minPrecision, minSampleSize),
        last_evaluated_at: now,
      },
      { onConflict: "account_id,ticket_type" }
    );

    if (upsertErr) {
      logger.error(
        `[auto-approval-recompute-cron] upsert failed account=${accountId} type=${ticketType}: ${upsertErr.message}`
      );
      continue;
    }
    written++;
  }

  return written;
}
