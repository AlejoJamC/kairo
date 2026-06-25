// ---------------------------------------------------------------------------
// KAI-248 — Production dependency wiring for pollGmailAccount.
//
// Keeps the Inngest function file thin and keeps poll-account.ts free of
// direct imports of shared modules — everything flows through GmailPollDeps.
// ---------------------------------------------------------------------------

import { classifyEmail } from "@kairo/intelligence";
import { supabase } from "../supabase.js";
import { getFreshGmailToken, getGmailEmailByAccount } from "../gmail-token.js";
import { preFilterEmail } from "../email/pre-filter.js";
import { upsertConversationByThread } from "../conversations.js";
import { findOrCreateTicketForThread } from "../tickets-by-thread.js";
import { linkMessageToTicket } from "../ticket-messages.js";
import { applyCustomerReplyTransition } from "../ticket-thread-transitions.js";
import { getProfile, historyList, messagesList, getMessage } from "./gmail-client.js";
import type { GmailPollDeps } from "./types.js";

export function createGmailPollDeps(): GmailPollDeps {
  return {
    db: supabase,
    getFreshGmailToken,
    getGmailEmailByAccount,
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
  };
}
