// ---------------------------------------------------------------------------
// KAI-248 — Production dependency wiring for pollGmailAccount.
//
// Keeps the Inngest function file thin and keeps poll-account.ts free of
// direct imports of shared modules — everything flows through GmailPollDeps.
// ---------------------------------------------------------------------------

import { classifyEmailWithMeta, createCompletionProvider, createDecisionProvider, usesDecisionClassification } from "@kairo/intelligence";
import { logLlmCall } from "../llm-logging.js";
import { supabase } from "../supabase.js";
import { getFreshGmailToken } from "../gmail-token.js";
import { resolveClassifierContext, withApprovedKnowledge } from "../classifier-input.js";
import { preFilterEmail } from "../email/pre-filter.js";
import { upsertConversationByThread, getConversationCustomer } from "../conversations.js";
import { findOrCreateTicketForThread } from "../tickets-by-thread.js";
import { linkMessageToTicket } from "../ticket-messages.js";
import { applyCustomerReplyTransition } from "../ticket-thread-transitions.js";
import { extractLastKairoToken, findTicketByKairoToken } from "../ticket-traceability.js";
import { getProfile, historyList, messagesList, getMessage } from "./gmail-client.js";
import type { GmailPollDeps } from "./types.js";
import { getFlag } from '@kairo/feature-flags';
import { inngest } from '../inngest.js';

export function createGmailPollDeps(): GmailPollDeps {
  return {
    requestKnowledge: async input => {
      if (!getFlag('enable_email_knowledge')) return;
      await inngest.send({ name: 'messages/knowledge.requested', id: `email-knowledge:${input.accountId}:${input.messageId}`, data: input });
    },
    db: supabase,
    getFreshGmailToken,
    resolveClassifierContext,
    getProfile,
    historyList,
    messagesList,
    getMessage,
    preFilterEmail,
    classifyEmail: async (message, options) => {
      const accountId = options?.context?.accountId;
      const grounded = getFlag('enable_email_knowledge') && accountId
        ? await withApprovedKnowledge(message, accountId) : message;
      return classifyEmailWithMeta(grounded, options);
    },
    logLlmCall,
    configuredModel: () => usesDecisionClassification()
      ? createDecisionProvider("gateway").model
      : createCompletionProvider().model,
    upsertConversationByThread,
    findOrCreateTicketForThread,
    linkMessageToTicket,
    applyCustomerReplyTransition,
    extractLastKairoToken,
    findTicketByKairoToken,
    getConversationCustomer,
  };
}
