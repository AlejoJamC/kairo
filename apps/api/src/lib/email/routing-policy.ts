// ---------------------------------------------------------------------------
// KAI-45 — what to do with a message, as a table instead of a return.
//
// These rules lived as eight early returns inside `preFilterEmail`, mixed in
// with the code that computed the values they tested. That made two separate
// things impossible: reading the policy without reading the parser, and
// changing the policy without touching either.
//
// It also made the policy invisible to measurement. The rule that drops mail
// from the tenant's own domain has carried a `TODO` since KAI-206 saying it is
// wrong under multi-tenant (pre-filter.ts:118-125), and it took a corpus run to
// find out it removes 8 of the 10 `internal` emails before the classifier ever
// sees them. A rule nobody can enumerate is a rule nobody can audit.
//
// The order below is the order the original returns ran in, deliberately: F0 of
// KAI-45 changes no behaviour, and `routing-equivalence.test.ts` holds that
// against all 90 real .eml files in scripts/eval/data.
// ---------------------------------------------------------------------------

import type { MailFacts } from "./mail-facts.js";

/**
 * Why a message was kept out of the queue.
 *
 * These strings are persisted to `messages.skip_reason`, which carries no CHECK
 * constraint — the union is the only thing keeping the vocabulary closed, so a
 * new reason belongs here rather than inline at a call site.
 */
export const SKIP_REASONS = [
  "outbound",
  "automated_sender",
  "mailing_list",
  "system_notification",
  "gmail_category_filter",
  "auto_generated",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type Route =
  | { kind: "skip"; reason: SkipReason; signals: string[] }
  | { kind: "classify"; signals: string[] };

/**
 * Bumped whenever a rule is added, removed or reordered.
 *
 * Persisted alongside the decision so a classification can be read back
 * against the policy that produced it. Without it, a corpus run and a
 * production row that disagree are indistinguishable from a model that changed
 * its mind.
 */
export const ROUTING_POLICY_VERSION = "1.0.0";

/**
 * Signals describing a message that is being classified.
 *
 * `preFilterEmail` computed this and threw it away — nothing in production ever
 * read `relevance_signals`, and the injected type in gmail-poll/types.ts even
 * removed it from the contract. Returned here so the decision carries its
 * reasons.
 */
function relevanceSignals(facts: MailFacts, overrides: string[]): string[] {
  const signals = [...overrides];
  if (facts.gmailCategory === "PRIMARY") signals.push("gmail_primary");
  if (facts.gmailCategory === "UPDATES") signals.push("gmail_updates");
  signals.push("external_sender");
  return signals;
}

/**
 * The routing decision for one message.
 *
 * Reads atomic facts rather than the aggregates on {@link MailFacts}: the
 * inherited rules distinguish a mailing list from an auto-responder and give
 * each its own stated reason, and `Auto-Submitted` was never part of either —
 * so `facts.isBulk`, which unions all three, would silently widen rule 6.
 */
export function resolveRoute(facts: MailFacts): Route {
  // 1. The tenant's own domain. Highest priority, not overridable by any
  //    pass-through signal.
  //
  //    Named `outbound`, but it does not detect outbound: real outbound is
  //    `messages.direction = 'outbound'` written by the reply flow (ADR-023),
  //    which never reaches this function. What this catches is the company's
  //    own mail that ARRIVED in the monitored inbox — one corporate mailbox
  //    writing to another, or a copy of the house's own thread.
  if (facts.senderIsTenantDomain || facts.senderIsTenantAddress) {
    return { kind: "skip", reason: "outbound", signals: [] };
  }

  // 2. Pass-through overrides. An urgent subject or a reply in an existing
  //    thread beats every remaining skip rule.
  //
  //    `hasUrgencyKeyword` only matches English while the pilot runs in
  //    Spanish (KAI-45 E11), so in practice rule 2 fires almost exclusively on
  //    `isReply` today.
  const overrides: string[] = [];
  if (facts.hasUrgencyKeyword) overrides.push("urgency_keyword");
  if (facts.isReply) overrides.push("in_reply_to");
  if (overrides.length > 0) {
    return { kind: "classify", signals: relevanceSignals(facts, overrides) };
  }

  // 3. no-reply@ senders and known bulk-sender patterns.
  if (facts.isAutomatedSender) {
    return { kind: "skip", reason: "automated_sender", signals: [] };
  }

  // 4. Mailing list.
  if (facts.hasListUnsubscribe) {
    return { kind: "skip", reason: "mailing_list", signals: [] };
  }

  // 5. Calendar invite or system receipt.
  if (facts.isCalendarInvite || facts.hasSystemSubjectPrefix) {
    return { kind: "skip", reason: "system_notification", signals: [] };
  }

  // 6. Gmail's own Promotions / Social buckets.
  if (facts.gmailCategory === "PROMOTIONS" || facts.gmailCategory === "SOCIAL") {
    return { kind: "skip", reason: "gmail_category_filter", signals: [] };
  }

  // 7. Auto-generated headers.
  if (facts.isAutoGenerated) {
    return { kind: "skip", reason: "auto_generated", signals: [] };
  }

  return { kind: "classify", signals: relevanceSignals(facts, []) };
}
