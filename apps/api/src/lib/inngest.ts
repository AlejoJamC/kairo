import { Inngest } from "inngest";

export type KairoEvents = {
  "pipeline/tier1.triggered": {
    data: {
      userId: string;
      gmailAccessToken: string;
    };
  };
  "pipeline/tier2.triggered": {
    data: {
      userId: string;
      processedMessageIds: string[];
    };
  };
  "pipeline/tier3.triggered": {
    data: {
      userId: string;
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
export const inngest = new Inngest({ id: "kairo-api" });
