// ---------------------------------------------------------------------------
// KAI-248 — Gmail near-real-time poll cron (fan-out)
//
// Deliberately independent Inngest function — does NOT touch
// apps/api/src/functions/pipeline/*. Runs on a schedule (default every
// minute, configurable via GMAIL_POLL_CRON_INTERVAL_MINUTES) and emits one
// inbound/gmail.poll.requested event per active Gmail channel_integration.
//
// Event IDs are deterministic per (accountId, tick) so that if Inngest
// retries the cron step, duplicate fan-out events within the same minute
// are deduplicated rather than double-triggering the worker.
// ---------------------------------------------------------------------------

import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { env } from "../../env.js";

const intervalMinutes = Math.max(1, Math.floor(env.GMAIL_POLL_CRON_INTERVAL_MINUTES));
const CRON_EXPRESSION = `*/${intervalMinutes} * * * *`;

/** Truncates "now" to the current tick boundary for deterministic event IDs. */
function currentTickIso(): string {
  const now = new Date();
  const tickMs = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(now.getTime() / tickMs) * tickMs).toISOString();
}

export const gmailPollCron = inngest.createFunction(
  {
    id: "gmail-poll-cron",
    retries: 0,
    triggers: [{ cron: CRON_EXPRESSION }],
  },
  async ({ step, logger }) => {
    const activeIntegrations = await step.run("list-active-gmail-integrations", async () => {
      const { data, error } = await supabase
        .from("channel_integrations")
        .select("account_id")
        .eq("provider", "gmail")
        .eq("is_active", true);

      if (error) {
        throw new Error(`[gmail-poll-cron] failed to list channel_integrations: ${error.message}`);
      }
      return data ?? [];
    });

    if (activeIntegrations.length === 0) {
      logger.info("[gmail-poll-cron] no active Gmail integrations — skipping tick");
      return { fannedOut: 0 };
    }

    const tick = currentTickIso();

    await step.sendEvent(
      "fan-out-poll-requests",
      activeIntegrations.map((row: { account_id: string }) => ({
        id: `gmail-poll:${row.account_id}:${tick}`,
        name: "inbound/gmail.poll.requested" as const,
        data: { accountId: row.account_id },
      }))
    );

    logger.info(`[gmail-poll-cron] fanned out ${activeIntegrations.length} poll request(s) for tick ${tick}`);

    return { fannedOut: activeIntegrations.length };
  }
);
