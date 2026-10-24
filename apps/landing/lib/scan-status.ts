export type ScanStatus = "idle" | "in_progress" | "complete" | "failed";

export interface ScanCounts {
  /** Messages of the account, whatever their classification status. */
  messagesTotal: number;
  messagesClassified: number;
  /** `failed` plus `failed_permanent`. */
  messagesFailed: number;
  /** Latest write of the scan: a message created or a ticket classified. */
  lastActivityAt: string | null;
}

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

/**
 * Where the onboarding scan stands, from the messages it writes rather than
 * from tickets alone: with no ticket the scan may still be running, may have
 * found nothing to classify, or may have failed on every email — and the
 * wizard must tell those apart instead of showing "classifying" forever.
 */
export function deriveScanStatus(counts: ScanCounts, now: Date = new Date()): ScanStatus {
  if (counts.messagesTotal === 0) return "idle";
  if (counts.lastActivityAt && now.getTime() - Date.parse(counts.lastActivityAt) < ACTIVE_WINDOW_MS) return "in_progress";
  if (counts.messagesClassified === 0 && counts.messagesFailed > 0) return "failed";
  return "complete";
}
