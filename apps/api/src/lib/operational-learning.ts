import { initialLearningStatus } from "@kairo/intelligence";
import type {
  LearningOrigin,
  LearningStatus,
  OperationalLearning,
  OperationalLearningType,
} from "@kairo/types";

import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// KAI-55 — read/write access to operational_learning. What triggers a
// system_derived candidate is separate, later work; this is only where such
// a candidate (or a human correction) gets written to and read from.
// ---------------------------------------------------------------------------

export interface CreateOperationalLearningInput {
  accountId: string;
  origin: LearningOrigin;
  learningType: OperationalLearningType;
  summary: string;
  ticketIds: string[];
  sourceCount: number;
  /** Null for human_correction — the person's action is the trust signal, not a score. */
  confidence: number | null;
}

interface OperationalLearningRow {
  id: string;
  account_id: string;
  origin: string;
  status: string;
  learning_type: string;
  summary: string;
  ticket_ids: string[];
  source_count: number;
  confidence: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

function rowToOperationalLearning(row: OperationalLearningRow): OperationalLearning {
  return {
    accountId: row.account_id,
    origin: row.origin as LearningOrigin,
    status: row.status as LearningStatus,
    learningType: row.learning_type as OperationalLearningType,
    summary: row.summary,
    evidence: { ticketIds: row.ticket_ids, sourceCount: row.source_count },
    confidence: row.confidence,
    ...(row.reviewed_by ? { reviewedBy: row.reviewed_by } : {}),
    ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
  };
}

/**
 * Writes one row. `status` is never a caller argument — {@link initialLearningStatus}
 * decides it from `origin`, so a human correction cannot be written as anything
 * but already approved, and a system-derived one cannot skip review.
 */
export async function createOperationalLearning(
  input: CreateOperationalLearningInput,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("operational_learning")
    .insert({
      account_id: input.accountId,
      origin: input.origin,
      status: initialLearningStatus(input.origin),
      learning_type: input.learningType,
      summary: input.summary,
      ticket_ids: input.ticketIds,
      source_count: input.sourceCount,
      confidence: input.confidence,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[operational-learning] insert failed account=${input.accountId}: ${error.message}`);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Approved learnings for one account — the only ones a consumer should read
 * unless it is specifically building the review queue.
 *
 * Never throws: an unreadable table yields nothing, the same fail-closed
 * choice {@link autoApprovedTypes} in backfill-proposal-status.ts makes.
 */
export async function listApprovedLearnings(accountId: string): Promise<OperationalLearning[]> {
  return listLearningsByStatus(accountId, "approved");
}

/** Candidates nobody has reviewed yet, for one account. */
export async function listPendingLearnings(accountId: string): Promise<OperationalLearning[]> {
  return listLearningsByStatus(accountId, "pending_review");
}

async function listLearningsByStatus(
  accountId: string,
  status: LearningStatus,
): Promise<OperationalLearning[]> {
  try {
    const { data, error } = await supabase
      .from("operational_learning")
      .select("*")
      .eq("account_id", accountId)
      .eq("status", status);

    if (error) {
      console.warn(`[operational-learning] unreadable for account ${accountId}: ${error.message}`);
      return [];
    }
    return ((data ?? []) as OperationalLearningRow[]).map(rowToOperationalLearning);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[operational-learning] unreadable for account ${accountId}: ${message}`);
    return [];
  }
}

/**
 * A human resolves a `pending_review` candidate. Only `system_derived` rows
 * are ever in that state — a `human_correction` row is written already
 * approved and has nothing to review.
 */
export async function reviewOperationalLearning(
  id: string,
  decision: "approved" | "rejected",
  reviewedBy: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("operational_learning")
    .update({ status: decision, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending_review");

  if (error) {
    console.error(`[operational-learning] review failed id=${id}: ${error.message}`);
    return false;
  }
  return true;
}
