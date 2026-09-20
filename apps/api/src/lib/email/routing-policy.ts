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
  "spam_filtered",
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
export const ROUTING_POLICY_VERSION = "1.1.1";

// 1.1.1 (KAI-45 F2) — the provider's own spam verdict decides, ahead of
//   everything. See rule 0.
// 1.1.0 (KAI-45 F0b) — the `outbound` rule is gone. See rule 1 below for what
//   it actually did and why it was removed. Historical `messages.skip_reason`
//   rows still carry the string; nothing emits it any more.
// 1.0.0 — the eight rules as they were inside preFilterEmail since KAI-206.

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
  // 0. The receiving server already ran a spam filter. Believe it.
  //
  //    On the 90 real .eml in scripts/eval/data, `X-Spam-Status: Yes` fires on
  //    exactly the ten messages the sheet labels `spam` and on nothing else —
  //    precision and recall 1.0, zero tokens, zero milliseconds. The models
  //    asked the same question score 78–98% and took up to 145 s on email 116,
  //    which carries `X-Spam-Status: Yes, score=11.8` in its own headers.
  //
  //    This is also what makes the derivation table in @kairo/intelligence
  //    fittable: `spam` and an unsolicited vendor offer are both "commercial,
  //    no action needed", so no combination of the two model axes can separate
  //    them. The envelope can, so the envelope does.
  //
  //    `null` means the provider did not scan, which is not a clean bill.
  if (facts.spamFiltered === true) {
    return { kind: "skip", reason: "spam_filtered", signals: [] };
  }

  // 1. REMOVED in 2.0.0 — the rule that dropped mail from the tenant's own
  //    domain, unconditionally and ahead of every override.
  //
  //    It was named `outbound` and it did not detect outbound. Real outbound is
  //    `messages.direction = 'outbound'`, written by the reply flow (ADR-023)
  //    and by the manual ticket module; neither reaches this function, and this
  //    pipeline only ever reads an inbox. What the rule actually caught was the
  //    company's own mail that ARRIVED — one corporate mailbox writing to
  //    another (125: customer service writing to the dispatcher), or a copy of the
  //    house's own thread pulled in by the POP fetch.
  //
  //    Measured on the KAI-93 coverage corpus before removing it: of the ten
  //    emails labelled `internal`, the rule dropped five and `automated_sender`
  //    dropped three, so two reached the classifier. `internal` is the class
  //    that report shows the models recognising ~90% of the time, and it barely
  //    existed in production.
  //
  //    `senderIsTenantDomain` and `senderIsTenantAddress` survive as facts: they
  //    are what tells `internal` from `support`, and F1 hands them to the model
  //    instead of asking it to infer them from prose (es.md:44).

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
