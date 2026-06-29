import { describe, it, expect, afterEach, mock } from "bun:test";

// gmail-poll-cron.ts imports the real lib/supabase.js, which validates
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY via @kairo/env at import time.
// `bun test` runs with NODE_ENV=test and does NOT load .env.local, so the
// real client would throw on import — mock it out, same as ticket-events.test.ts.
mock.module("../../lib/supabase.js", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

// mock.module is process-wide in bun:test — other files (e.g.
// ticket-acknowledgement.test.ts) replace lib/inngest.js with a partial stub
// missing createFunction(). Provide our own full-enough stub so this file's
// result doesn't depend on test run order.
mock.module("../../lib/inngest.js", () => ({
  inngest: {
    send: () => Promise.resolve(),
    createFunction: (opts: unknown) => ({ opts }),
  },
}));

// The cron interval is read once at module load via getNumericFlag(), so each
// case re-imports the module (cache-busted) after setting the env var — this
// is the only thing that can prove the flag is still wired to the schedule.
const ENV_KEY = "FEATURE_FLAG_GMAIL_POLL_CRON_INTERVAL_MINUTES";
const MODULE_PATH = "./gmail-poll-cron.ts";

afterEach(() => {
  delete process.env[ENV_KEY];
});

describe("gmailPollCron — interval flag wiring", () => {
  it("uses the default 5-minute cron when the flag is unset", async () => {
    delete process.env[ENV_KEY];
    const mod = await import(`${MODULE_PATH}?t=${Date.now()}-a`);
    expect(mod.gmailPollCron.opts.triggers[0].cron).toBe("*/5 * * * *");
  });

  it("reflects the flag override in the cron expression", async () => {
    process.env[ENV_KEY] = "10";
    const mod = await import(`${MODULE_PATH}?t=${Date.now()}-b`);
    expect(mod.gmailPollCron.opts.triggers[0].cron).toBe("*/10 * * * *");
  });
});
