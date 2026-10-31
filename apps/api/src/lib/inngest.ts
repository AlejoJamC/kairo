import { Inngest } from "inngest";
import { localSupabaseConfig } from "@kairo/feature-flags";

export type KairoEvents = {
  'messages/knowledge.requested': {
    data: { accountId: string; ticketId: string; messageId: string };
  };
  "pipeline/tier1.triggered": {
    data: {
      userId: string;
      gmailAccessToken: string;
      supabaseTarget?: "local" | "remote";
    };
  };
  /** The owner finished or skipped the onboarding walkthrough; Tier 1 waits for it before Tier 2. */
  "onboarding/completed": {
    data: { accountId: string; supabaseTarget?: "local" | "remote" };
  };
  "pipeline/tier2.triggered": {
    data: {
      userId: string;
      processedMessageIds: string[];
      supabaseTarget?: "local" | "remote";
    };
  };
  "pipeline/tier3.triggered": {
    data: {
      userId: string;
      supabaseTarget?: "local" | "remote";
    };
  };
  /**
   * Asks classification-retry-sweep to retry failed messages now instead of
   * at its next scheduled tick. Sent when a pass ends and when the API starts
   * with a valid classification model.
   */
  "classification/retry.requested": {
    data: {
      reason: "pass_completed" | "startup";
      /** Wait before retrying, so a transient provider fault has time to clear. */
      delaySeconds?: number;
    };
  };
  "tickets/batch-classify.triggered": {
    data: {
      userId: string;
      ticketIds: string[];
      forceReclassify: boolean;
      jobId: string;
    };
  };
  "pipeline/incremental-sync.triggered": {
    data: {
      userId: string;
      gmailAccessToken: string;
    };
  };
  "tickets/ticket.created": {
    data: {
      ticketId: string;
      accountId: string;
    };
  };
  "admin/thread-dedupe.triggered": {
    data: {
      accountId: string | null; // null = all accounts (use with caution)
    };
  };
  /**
   * KAI-248 — per-account Gmail poll request. Emitted by the new
   * gmail-poll-cron fan-out function (and the reconverted manual sync
   * button) and consumed by the new gmail-poll worker. Independent of
   * apps/api/src/functions/pipeline/* — do NOT wire this into those.
   */
  "inbound/gmail.poll.requested": {
    data: {
      accountId: string;
    };
  };
  "messages/outbound.queued": {
    data: {
      messageId: string;
      ticketId: string;
      accountId: string;
      provider: string;
      to: string;
      subject: string;
      bodyPlain: string;
      /** HTML version for multipart/alternative sends (KAI-115 Templates 2.0). */
      bodyHtml?: string;
      threadExternalId: string;
      /** RFC 2822 Message-ID of last inbound message — sets In-Reply-To + References (KAI-115). */
      inReplyToExternalId?: string;
    };
  };
};

// In inngest v4, EventSchemas was removed. Event types are enforced via
// KairoEvents below and used at createFunction call sites via generics.
export const inngest = new Inngest({ id: "kairo-api", ...(localSupabaseConfig(process.env) ? { isDev: true } : {}) });
