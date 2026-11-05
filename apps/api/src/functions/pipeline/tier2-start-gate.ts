import { assertSupabaseTarget } from "@kairo/feature-flags";
import { inngest } from "../../lib/inngest.js";
import { supabase } from "../../lib/supabase.js";
import { waitForOnboarding } from "../../lib/onboarding-gate.js";
import { pipelineLog } from "../../lib/pipeline-logger.js";

/**
 * Starts Tier 2, and with it Tier 3, once the onboarding is recorded. Tier 1 has already ended by
 * the time it runs: only the start of the later tiers waits, never the first pass. The wait is
 * bounded; past it Tier 2 starts with the default settings (see waitForOnboarding).
 */
export const tier2StartGate = inngest.createFunction(
  {
    id: "tier2-start-gate",
    triggers: [{ event: "pipeline/tier1.completed" }],
  },
  async ({ event, step }) => {
    const { userId, accountId, processedMessageIds, supabaseTarget } = event.data;
    assertSupabaseTarget(supabaseTarget, process.env);

    pipelineLog("tier2-start-gate", await waitForOnboarding(step, supabase, accountId));
    await step.sendEvent("trigger-tier2", {
      name: "pipeline/tier2.triggered",
      data: { userId, supabaseTarget, processedMessageIds },
    });
  }
);
