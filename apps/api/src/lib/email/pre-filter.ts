// ---------------------------------------------------------------------------
// KAI-45 — adapter kept for the five ingestion paths that still call it.
//
// The parsing moved to mail-facts.ts and the rules to routing-policy.ts. This
// file is now the seam between them and the old two-value contract, so the
// refactor lands without touching tier1/tier2/tier3/incremental-sync/gmail-poll
// and without editing a single one of the 43 cases in pre-filter.test.ts —
// which is what makes those tests an equivalence proof rather than a rewrite.
//
// Call sites migrate to `extractMailFacts` + `resolveRoute` one at a time in
// F1, and this adapter goes away when the last one has.
// ---------------------------------------------------------------------------

import { recordDecision, routeAttributes } from "../decision-telemetry.js";
import { extractMailFacts, type MailFacts } from "./mail-facts.js";
import { resolveRoute } from "./routing-policy.js";

// Re-exported because pre-filter.test.ts asserts against the list by name.
export { BLOCKED_SENDER_PATTERNS } from "./mail-facts.js";

export interface EmailMetadata {
  from: string;
  subject: string;
  headers: Record<string, string>;
  gmailCategories?: string[];
  mimeType?: string;
  /**
   * Every mailbox this account reads, or the one it has.
   *
   * Still named `userEmail` for the callers that have not migrated, but it is
   * the connected inbox and not a member's address — which is the multi-tenant
   * TODO this file carried since KAI-206. A list because an account is not one
   * inbox: comparing against a single address read six of the ninety corpus
   * messages as external when they came from the company's own mailboxes.
   */
  userEmail: string | readonly string[];
}

export interface PreFilterResult {
  status: "skip" | "relevant";
  skip_reason?: string;
  relevance_signals?: string[];
  /**
   * What the envelope said, so the caller does not have to read it again.
   *
   * The whole point of KAI-45: this function already computed the sender's
   * domain, the recipient list, the provider's spam verdict and the thread
   * position, and every one of them used to die here. Callers hand it to
   * `classifierEnvelope()` on their way to the model.
   */
  facts: MailFacts;
}

export function preFilterEmail(metadata: EmailMetadata): PreFilterResult {
  const facts = extractMailFacts({
    from: metadata.from,
    subject: metadata.subject,
    headers: metadata.headers,
    ...(metadata.gmailCategories ? { gmailCategories: metadata.gmailCategories } : {}),
    ...(metadata.mimeType !== undefined ? { mimeType: metadata.mimeType } : {}),
    tenantMailbox: metadata.userEmail,
  });
  const route = resolveRoute(facts);
  // Every ingestion path passes through here, so this is the one place the
  // routing decision reaches ClickStack — including for the mail that never
  // becomes a ticket, which is the population nothing else can see.
  recordDecision("email.route", routeAttributes(facts, route));

  return route.kind === "skip"
    ? { status: "skip", skip_reason: route.reason, facts }
    : { status: "relevant", relevance_signals: route.signals, facts };
}
