import { describe, expect, it } from "bun:test";
import { ProviderConfigurationError, ProviderError } from "@kairo/intelligence";
import { recordClassificationFailure } from "./classification-outcome";

function fakeDb(attemptCount: number) {
  const upserts: Record<string, unknown>[] = [];
  const db = {
    from() {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { classification_attempt_count: attemptCount }, error: null }) }) }),
        }),
        upsert: async (row: Record<string, unknown>) => { upserts.push(row); return { error: null }; },
      };
    },
  };
  return { db: db as never, upserts };
}

const base = {
  accountId: "acme-account", channelIntegrationId: "acme-integration", externalId: "synthetic-message",
  receivedAt: "2026-01-01T00:00:00.000Z", processingTier: 0, maxAttempts: 3,
};

describe("recordClassificationFailure", () => {
  it("keeps a deployment fault retryable and does not spend an attempt", async () => {
    const { db, upserts } = fakeDb(2);
    await recordClassificationFailure({ ...base, supabase: db, err: new ProviderConfigurationError("Synthetic missing key") });
    expect(upserts[0]).toMatchObject({ classification_status: "failed", classification_attempt_count: 2 });
  });

  it("still marks a non-retriable provider error permanent on the first attempt", async () => {
    const { db, upserts } = fakeDb(0);
    await recordClassificationFailure({ ...base, supabase: db, err: new ProviderError("Synthetic schema mismatch", false) });
    expect(upserts[0]).toMatchObject({ classification_status: "failed_permanent", classification_attempt_count: 1 });
  });

  it("marks a retriable error permanent only after the attempts are spent", async () => {
    const { db, upserts } = fakeDb(2);
    await recordClassificationFailure({ ...base, supabase: db, err: new ProviderError("Synthetic outage", true) });
    expect(upserts[0]).toMatchObject({ classification_status: "failed_permanent", classification_attempt_count: 3 });
  });
});
