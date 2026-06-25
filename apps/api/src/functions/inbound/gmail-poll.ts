// ---------------------------------------------------------------------------
// KAI-248 — Gmail near-real-time poll worker (per-account)
//
// Deliberately independent Inngest function — NOT part of, and does not
// import, apps/api/src/functions/pipeline/* (tier1-fast-path, incremental-sync,
// tier2, tier3). See KAI-248 description for the architecture rationale.
//
// Trigger: inbound/gmail.poll.requested { accountId }
//   - emitted per-account by the gmail-poll-cron fan-out function
//   - emitted ad-hoc by the reconverted manual "Sync Gmail" button
//
// All Gmail/DB collaborators are injected into pollGmailAccount via
// GmailPollDeps (apps/api/src/lib/gmail-poll/types.ts) so the core logic is
// unit-testable without Bun's global mock.module().
// ---------------------------------------------------------------------------

import { inngest } from "../../lib/inngest.js";
import { pollGmailAccount } from "../../lib/gmail-poll/poll-account.js";
import { createGmailPollDeps } from "../../lib/gmail-poll/deps.js";

export const gmailPoll = inngest.createFunction(
  {
    id: "gmail-poll",
    // One in-flight poll per account at a time — avoids racing cursor
    // updates if the cron tick overlaps with a manual sync trigger.
    concurrency: { limit: 5, key: "event.data.accountId" },
    retries: 2,
    triggers: [{ event: "inbound/gmail.poll.requested" }],
  },
  async ({ event, step, logger }) => {
    const { accountId } = event.data;

    const result = await step.run("poll-account", async () => {
      const deps = createGmailPollDeps();
      return pollGmailAccount(deps, accountId);
    });

    logger.info(
      `[gmail-poll] account=${accountId} outcome=${result.outcome} new=${result.newMessages} created=${result.ticketsCreated} reopened=${result.ticketsReopened} skipped=${result.skipped}`
    );

    return result;
  }
);
