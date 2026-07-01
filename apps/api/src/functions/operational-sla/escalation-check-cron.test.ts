import { describe, it, expect, afterEach, mock } from "bun:test";

// Same rationale as gmail-poll-cron.test.ts: lib/supabase.js validates env
// vars via @kairo/env at import time, which `bun test` doesn't provide.
mock.module("../../lib/supabase.js", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }) }) },
}));

mock.module("../../lib/inngest.js", () => ({
  inngest: {
    send: () => Promise.resolve(),
    createFunction: (opts: unknown) => ({ opts }),
  },
}));

const ENV_KEY_INTERVAL = "FEATURE_FLAG_OPERATIONAL_SLA_ESCALATION_CHECK_INTERVAL_MINUTES";
const MODULE_PATH = "./escalation-check-cron.ts";

afterEach(() => {
  delete process.env[ENV_KEY_INTERVAL];
});

describe("operationalSlaEscalationCron — interval flag wiring", () => {
  it("uses the default 5-minute cron when the flag is unset", async () => {
    delete process.env[ENV_KEY_INTERVAL];
    const mod = await import(`${MODULE_PATH}?t=${Date.now()}-a`);
    expect(mod.operationalSlaEscalationCron.opts.triggers[0].cron).toBe("*/5 * * * *");
  });

  it("reflects the flag override in the cron expression", async () => {
    process.env[ENV_KEY_INTERVAL] = "15";
    const mod = await import(`${MODULE_PATH}?t=${Date.now()}-b`);
    expect(mod.operationalSlaEscalationCron.opts.triggers[0].cron).toBe("*/15 * * * *");
  });
});
