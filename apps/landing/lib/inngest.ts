import { Inngest } from "inngest";
import { env } from "@/env";

// ---------------------------------------------------------------------------
// KAI-202 — Landing-side Inngest event sender
//
// The pipeline functions live in apps/api (registered Inngest app
// "kairo-api"). Events are routed by name through the Inngest cloud, so
// any service holding INNGEST_EVENT_KEY can dispatch them. This file is
// the landing BFF's send-only client.
// ---------------------------------------------------------------------------

// In local dev the Inngest SDK auto-discovers the dev server (default
// http://localhost:8288). In that mode `eventKey` is not required; in
// production we MUST pass it or `send` will fail.
function isDevMode(): boolean {
  return process.env.NODE_ENV !== "production" || !!process.env.INNGEST_DEV;
}

export const inngest = new Inngest({
  id: "kairo-landing",
  eventKey: env.INNGEST_EVENT_KEY,
  isDev: isDevMode(),
});

export type DispatchOutcome =
  | "dispatched"
  | "disabled"        // kill-switch active
  | "missing-config"  // INNGEST_EVENT_KEY not set
  | "send-failed";    // Inngest unreachable / rejected

export interface OnboardingClassificationInput {
  userId: string;
  accountId: string;   // KAI-220: non-nullable — KAI-218 guarantees account exists before dispatch
  gmailAccessToken: string;
  /** Days of inbox history to consider on first classification. */
  sinceDays?: number;
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Dispatch the onboarding/initial classification pipeline for a freshly
 * authorized Gmail account.
 *
 * Design notes:
 *  - Idempotency: the Inngest event `id` field deduplicates events with the
 *    same key within Inngest's window. Key = `tier1-onboard:{userId}:{date}`,
 *    so a user reconnecting Gmail on the same day produces a no-op.
 *  - Failure isolation: this never throws. The OAuth callback uses the
 *    return value purely for logging — auth flow must always proceed.
 *  - Token hygiene: the access token is never written to any log line.
 */
export async function dispatchOnboardingClassification(
  input: OnboardingClassificationInput
): Promise<DispatchOutcome> {
  // KAI-220: defence-in-depth guard — accountId must be set before dispatching.
  // Post-KAI-218 this path should never be reached; if it is, the callback has
  // a bug and we must NOT kick off a pipeline run that will silently fail.
  if (!input.accountId) {
    console.error(
      `[KAI-220] dispatchOnboardingClassification called without accountId for user=${input.userId} — skipping dispatch`
    );
    return "missing-config";
  }

  if (env.DISABLE_ONBOARDING_PIPELINE_DISPATCH === "true") {
    return "disabled";
  }
  // Event key is only mandatory in production. In dev (local Inngest dev
  // server) the SDK works without a key — events flow to localhost:8288
  // and the api app's registered functions consume them. This is what
  // allows the full OAuth → tier1 → Ollama loop to run locally.
  if (!isDevMode() && !env.INNGEST_EVENT_KEY) {
    return "missing-config";
  }

  const sinceDays = input.sinceDays ?? 30;
  const since = new Date(
    Date.now() - sinceDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const idempotencyKey = `tier1-onboard:${input.userId}:${todayUtcDate()}`;

  try {
    await inngest.send({
      id: idempotencyKey,
      name: "pipeline/tier1.triggered",
      data: {
        userId: input.userId,
        gmailAccessToken: input.gmailAccessToken,
        // KAI-202: extra context for observability + future use by
        // the pipeline function. Existing tier1 ignores unknown fields.
        accountId: input.accountId,
        since,
        source: "oauth-callback",
      },
    });
    return "dispatched";
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // NEVER log the token. `input` is not included in the log.
    console.error(
      `[KAI-202] onboarding dispatch failed for user=${input.userId} account=${input.accountId}: ${msg}`
    );
    return "send-failed";
  }
}
