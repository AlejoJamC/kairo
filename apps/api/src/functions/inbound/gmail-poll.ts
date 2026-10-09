
import { inngest } from "../../lib/inngest.js";
import { pollGmailAccount } from "../../lib/gmail-poll/poll-account.js";
import { createGmailPollDeps } from "../../lib/gmail-poll/deps.js";

export const gmailPoll = inngest.createFunction(
  {
    id: "gmail-poll",
    concurrency: { limit: 1, key: "event.data.accountId" },
    retries: 2,
    triggers: [{ event: "inbound/gmail.poll.requested" }],
  },
  async ({ event, step, logger }) => {
    const { accountId } = event.data;

    const deps = createGmailPollDeps();
    deps.runMessage = (key, handler) => step.run(key, handler) as ReturnType<typeof handler>;
    const result = await pollGmailAccount(deps, accountId);
    logger.info(`[gmail-poll] outcome=${result.outcome} new=${result.newMessages} created=${result.ticketsCreated} reopened=${result.ticketsReopened} skipped=${result.skipped}`);

    return result;
  }
);
