export interface Tier3Window {
  /** Inngest step id, stable so a run in flight keeps its place. */
  id: string;
  /** Days back from today, or null for the whole inbox. */
  range: { daysFrom: number; daysTo: number } | null;
}

/**
 * The inbox slices Tier 3 classifies after Tier 2: fixed date windows counted back from today, or,
 * for a test inbox with no recent mail, the whole inbox in one pass. Anything Tiers 1 and 2 already
 * turned into a ticket is skipped.
 */
export function tier3Windows(options: { localTest: boolean; maxEmailAgeDays: number }): Tier3Window[] {
  if (options.localTest) return [{ id: "batch-all-inbox", range: null }];
  return [
    { id: "batch-a-16-30d", range: { daysFrom: 16, daysTo: 30 } },
    { id: "batch-b-31-60d", range: { daysFrom: 31, daysTo: 60 } },
    { id: "batch-c-61-maxd", range: { daysFrom: 61, daysTo: options.maxEmailAgeDays } },
  ];
}

/** Whether Tier 3 takes the whole inbox in one pass. Off unless `FEATURE_FLAG_TIER3_FULL_INBOX` is `true`. */
export function tier3FullInbox(env: Record<string, string | undefined>): boolean {
  return env.FEATURE_FLAG_TIER3_FULL_INBOX?.trim().toLowerCase() === "true";
}
