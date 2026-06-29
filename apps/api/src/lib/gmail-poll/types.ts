// ---------------------------------------------------------------------------
// KAI-248 — Gmail near-real-time poll worker: shared types
//
// This module is intentionally independent from apps/api/src/functions/pipeline/*.
// It reuses only leaf modules (token refresh, pre-filter, classification,
// threading helpers, transitions) — never the existing pipeline orchestrators.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassificationResult } from "@kairo/intelligence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = SupabaseClient<any>;

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePayload {
  headers?: GmailHeader[];
  mimeType?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePayload;
}

export interface GmailProfile {
  emailAddress: string;
  historyId: string;
}

export interface GmailHistoryMessageAdded {
  message: { id: string; threadId: string };
}

export interface GmailHistoryRecord {
  id: string;
  messagesAdded?: GmailHistoryMessageAdded[];
}

export interface GmailHistoryListResponse {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

export interface GmailMessageListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

/**
 * Thrown by the injected `historyList` collaborator when Gmail responds 404
 * (the startHistoryId is too old — Gmail retains history for ~7 days). The
 * worker catches this specifically to trigger the bounded re-sync fallback.
 */
export class GmailHistoryExpiredError extends Error {
  constructor(message = "Gmail historyId expired (404)") {
    super(message);
    this.name = "GmailHistoryExpiredError";
  }
}

/**
 * Collaborators injected into `pollGmailAccount`. Keeping these as plain
 * functions (rather than importing modules directly inside the poll logic)
 * lets unit tests substitute fakes without relying on Bun's global
 * `mock.module()`, which leaks across test files.
 */
export interface GmailPollDeps {
  db: DbClient;
  getFreshGmailToken: (accountId: string) => Promise<string>;
  getGmailEmailByAccount: (accountId: string) => Promise<string>;
  getProfile: (token: string) => Promise<GmailProfile>;
  historyList: (
    token: string,
    startHistoryId: string
  ) => Promise<GmailHistoryListResponse>;
  messagesList: (token: string) => Promise<GmailMessageListResponse>;
  getMessage: (token: string, messageId: string) => Promise<GmailMessage>;
  preFilterEmail: (metadata: {
    from: string;
    subject: string;
    headers: Record<string, string>;
    gmailCategories?: string[];
    mimeType?: string;
    userEmail: string;
  }) => { status: "skip" | "relevant"; skip_reason?: string };
  classifyEmail: (message: {
    subject: string;
    body: string;
    from: string;
  }) => Promise<ClassificationResult>;
  upsertConversationByThread: (
    client: DbClient,
    args: {
      accountId: string;
      channelIntegrationId: string;
      externalThreadId: string;
      customerExternalId: string;
      customerDisplayName?: string | null;
    }
  ) => Promise<{ conversation_id: string; was_created: boolean }>;
  findOrCreateTicketForThread: (
    client: DbClient,
    args: Parameters<
      typeof import("../tickets-by-thread.js").findOrCreateTicketForThread
    >[1]
  ) => Promise<{
    ticket_id: string;
    ticket_number: number;
    was_created: boolean;
    prior_status: string | null;
  }>;
  linkMessageToTicket: (
    client: DbClient,
    args: { ticket_id: string; message_id: string; is_origin: boolean }
  ) => Promise<void>;
  applyCustomerReplyTransition: (
    client: DbClient,
    ticketId: string,
    priorStatus: string | null
  ) => Promise<{ newStatus: string | null }>;
  /**
   * KAI-248 Grupo 1 — broken-thread re-association via [KAIRO-<n>] subject
   * token (mirrors tier1-fast-path's extractKairoToken usage, but takes the
   * LAST token in the subject rather than the first).
   */
  extractLastKairoToken: (subject: string) => number | null;
  findTicketByKairoToken: (
    client: DbClient,
    accountId: string,
    ticketNumber: number
  ) => Promise<{ ticketId: string; conversationId: string | null } | null>;
  /**
   * KAI-248 Grupo 4 — sender-validation guard for broken-thread re-association.
   * Looks up the `customer_external_id` of a conversation (by id) so the
   * gmail-poll worker can confirm the inbound sender actually owns that
   * conversation before re-attaching a message to it via [KAIRO-<n>] token.
   * Returns null if the conversation does not exist.
   */
  getConversationCustomer: (
    client: DbClient,
    conversationId: string
  ) => Promise<{ customerExternalId: string | null } | null>;
}

export interface PollAccountResult {
  /** Outcome of this poll cycle for observability. */
  outcome: "seeded" | "polled" | "resynced" | "no_integration" | "noop";
  newMessages: number;
  ticketsCreated: number;
  ticketsReopened: number;
  skipped: number;
  newHistoryId: string | null;
}
