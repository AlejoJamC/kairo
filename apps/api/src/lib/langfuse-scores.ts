// ---------------------------------------------------------------------------
// KAI-45 F6 — a person's correction, as a Langfuse score on the ticket.
//
// Every classification generation is grouped under `sessionId = ticketId`
// (packages/intelligence/src/classification/classify.ts, KAI-189), so a score
// on that session sits next to the generations it judges. Until now a
// correction reached Postgres (`classification_feedback`) and nothing else: in
// Langfuse a wrong classification and a right one looked the same.
//
// Categorical, valued with the type the person chose, so Langfuse can count
// corrections per corrected type and filter the sessions that received one.
// The type it replaced and the versions that produced it ride in metadata.
//
// Best-effort, like the rest of the telemetry: without LANGFUSE_PUBLIC_KEY and
// LANGFUSE_SECRET_KEY nothing is sent, and a failed send is logged and dropped.
// The correction is already saved by the time this runs.
// ---------------------------------------------------------------------------

import { LangfuseAPIClient } from "@langfuse/core";

type ScoreClient = Pick<LangfuseAPIClient, "scores">;
type CreateScoreRequest = Parameters<ScoreClient["scores"]["create"]>[0];

export const TYPE_CORRECTION_SCORE = "ticket_type_correction";

export interface TypeCorrection {
  ticketId: string;
  accountId: string;
  from: string;
  to: string;
  derivationVersion: string | null;
  promptVersion: string | null;
  routingPolicyVersion: string | null;
}

/** The score request for one correction. Pure, so its shape is testable. */
export function typeCorrectionScore(correction: TypeCorrection): CreateScoreRequest {
  return {
    name: TYPE_CORRECTION_SCORE,
    sessionId: correction.ticketId,
    dataType: "CATEGORICAL",
    value: correction.to,
    comment: `${correction.from} -> ${correction.to}`,
    metadata: {
      accountId: correction.accountId,
      fromType: correction.from,
      toType: correction.to,
      derivationVersion: correction.derivationVersion,
      promptVersion: correction.promptVersion,
      routingPolicyVersion: correction.routingPolicyVersion,
    },
  };
}

let defaultClient: ScoreClient | null | undefined;

/**
 * Built from the same variables LangfuseSpanProcessor reads, with the same
 * default host, so scores land in the project the generations went to.
 */
function langfuseClient(): ScoreClient | null {
  if (defaultClient !== undefined) return defaultClient;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  defaultClient =
    publicKey && secretKey
      ? new LangfuseAPIClient({
          environment: process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_BASEURL ?? "https://cloud.langfuse.com",
          username: publicKey,
          password: secretKey,
          xLangfusePublicKey: publicKey,
        })
      : null;
  return defaultClient;
}

/** Sends the score. Never throws; resolves once the send has finished or failed. */
export async function sendTypeCorrectionScore(
  correction: TypeCorrection,
  client: ScoreClient | null = langfuseClient(),
): Promise<void> {
  if (!client) return;
  try {
    await client.scores.create(typeCorrectionScore(correction), { timeoutInSeconds: 5, maxRetries: 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[langfuse-scores] correction score for ticket ${correction.ticketId} not sent: ${message}`);
  }
}
