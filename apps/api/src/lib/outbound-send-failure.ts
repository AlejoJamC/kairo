import { ChannelSendException } from "./channels/types.js";

/**
 * Outbound-send failure classification (KAI-114 / ADR-023 §1).
 *
 * Pure logic shared by the outbound-message-send worker — kept free of
 * supabase/inngest client imports so it can be unit-tested without the
 * service-role env vars those clients require.
 */

// Permanent failures — retrying won't fix a missing scope or integration.
// The agent must reconnect; surfaced via the message's failed state + reply-bar.
export const PERMANENT_FAILURE_CODES = new Set(["INSUFFICIENT_SCOPE", "NO_INTEGRATION"]);

// onFailure only sees the final thrown error — recover the original
// ChannelSendException code (e.g. INSUFFICIENT_SCOPE) so the dashboard can
// tell the agent *why* delivery failed and offer to reconnect when relevant.
// NonRetriableError wraps it via `cause`; exhausted-retry paths throw it directly.
export function extractFailureCode(error: Error): string {
  const cause = (error as { cause?: unknown }).cause;
  if (cause instanceof ChannelSendException) return cause.code;
  if (error instanceof ChannelSendException) return error.code;
  return "SEND_FAILED";
}
