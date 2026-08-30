// ---------------------------------------------------------------------------
// KAI-248 — Production dependency wiring for pollGmailAccount.
//
// Keeps the Inngest function file thin and keeps poll-account.ts free of
// direct imports of shared modules — everything flows through GmailPollDeps.
// ---------------------------------------------------------------------------

import { classifyEmail } from "@kairo/intelligence";
import { supabase } from "../supabase.js";
import { getFreshGmailToken } from "../gmail-token.js";
import { resolveClassifierContext } from "../classifier-input.js";
import { preFilterEmail } from "../email/pre-filter.js";
import { upsertConversationByThread, getConversationCustomer } from "../conversations.js";
import { findOrCreateTicketForThread } from "../tickets-by-thread.js";
import { linkMessageToTicket } from "../ticket-messages.js";
import { applyCustomerReplyTransition } from "../ticket-thread-transitions.js";
import { extractLastKairoToken, findTicketByKairoToken } from "../ticket-traceability.js";
import { getProfile, historyList, messagesList, getMessage } from "./gmail-client.js";
import type { GmailPollDeps } from "./types.js";

export function createGmailPollDeps(): GmailPollDeps {
  return {
    db: supabase,
    getFreshGmailToken,
    resolveClassifierContext,
    getProfile,
    historyList,
    messagesList,
    getMessage,
    preFilterEmail,
    classifyEmail,
    upsertConversationByThread,
    findOrCreateTicketForThread,
    linkMessageToTicket,
    applyCustomerReplyTransition,
    extractLastKairoToken,
    findTicketByKairoToken,
    getConversationCustomer,
  };
}
