// ---------------------------------------------------------------------------
// KAI-45 — what the envelope says, before anyone decides anything.
//
// The deterministic layer already computed most of this: `preFilterEmail`
// resolved the sender's domain, matched the no-reply regex, looked for
// `List-Unsubscribe`, read the Gmail category — and then returned a two-value
// enum and dropped the rest on the floor. `relevance_signals` was the one
// output that carried any of it, and nothing in production ever read it.
//
// So the model was handed a bare email plus a prose rule asking it to work out,
// in Spanish, whether `De` and `Para` were the same mailbox (es.md:44) — a
// string comparison the function next door had already done.
//
// This module does the computing and nothing else. It emits facts, never a
// label and never a verdict:
//
//   - routing-policy.ts turns facts into a decision
//   - the classifier prompt receives them as given, instead of inferring them
//
// That separation is what makes both testable. A fact is wrong or right against
// an .eml; a policy is a table you can change without touching either.
//
// Shape follows packages/intelligence/src/escalation/detect.ts: a pure function
// over a context object, tables as module constants, no I/O.
// ---------------------------------------------------------------------------

import {
  GMAIL_CATEGORIES,
  type AuthResult,
  type GmailCategory,
  type MailFacts,
} from "@kairo/intelligence";

// Regex covering all "no reply" local-part variants:
//   noreply@, no-reply@, no.reply@, no_reply@
//   -noreply@, .noreply@, +noreply@, -no-reply@, etc.
//   donotreply@, do-not-reply@, do_not_reply@
// Applied to the extracted email address (not the display name).
const NO_REPLY_REGEX = /(^|[-._+])(no[._-]?reply|donotreply|do[-_.]not[-_.]reply)@/i;

export const BLOCKED_SENDER_PATTERNS: string[] = [
  "marketing@",
  "newsletter@",
  "mailer-daemon@",
  "postmaster@",
  "bounce@",
  "bounces@",
  "@mailchimp.com",
  "@sendgrid.net",
  "@constantcontact.com",
];

/**
 * Inherited from the original pre-filter, and **English-only while the pilot is
 * in Spanish** — "urgente", "caído", "ayuda" and "crítico" do not match, so the
 * override this list exists to trigger does not fire on the corpus it serves
 * (KAI-45 E11).
 *
 * It stays as-is here because removing it changes behaviour, and this module's
 * job is to describe the message, not to decide. The routing policy owns
 * whether the signal is still honoured; fixing the vocabulary is a policy
 * change with its own measurement.
 */
const URGENCY_KEYWORDS = [
  "urgent",
  "error",
  "down",
  "broken",
  "help",
  "asap",
  "production",
  "critical",
];

const SYSTEM_SUBJECT_PREFIXES = [
  "Accepted:",
  "Declined:",
  "Delivery Status",
  "Read Receipt",
];

// Public email providers — anyone can register an address here, so "same
// domain" carries no information about who sent the mail. The tenant-domain
// fact is suppressed for these and only the full-address match is meaningful.
// Keep this list short and conservative; corporate domains must NOT be here.
const PUBLIC_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.es",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

export type { AuthResult, GmailCategory, MailFacts };
export { GMAIL_CATEGORIES };

export interface MailFactsInput {
  from: string;
  subject: string;
  /** Headers in their original case — see headers.ts. Keys are lowercased here. */
  headers: Record<string, string>;
  /** Gmail `labelIds` filtered to `CATEGORY_*`. */
  gmailCategories?: string[];
  mimeType?: string;
  /**
   * Every mailbox this account reads — `support_channels.email_address`, one
   * row per connected inbox.
   *
   * A list, not a string. An account is not one inbox: a tenant can connect
   * several, on more than one domain, and the app's own notifier is another.
   * Comparing against a single address called six of the ninety corpus messages
   * `external` when they came from the company's own mailboxes, and provenance
   * is a coordinate of the derivation key — a wrong one puts the message in the
   * wrong row of the table.
   *
   * A bare string is still accepted for the call sites that genuinely have one.
   */
  tenantMailbox: string | readonly string[];
}

/** The bare address out of a `From`-style header value. */
export function extractEmailAddress(raw: string): string {
  const angle = raw.match(/<([^>]+)>/);
  if (angle) return angle[1]!.trim().toLowerCase();
  const bare = raw.match(/\S+@\S+/);
  return (bare ? bare[0] : raw).trim().toLowerCase();
}

/** The domain of an address, or `""` when there is none to read. */
export function extractDomain(raw: string): string {
  const match = raw.match(/@([^>\s,;]+)/);
  return match ? match[1]!.toLowerCase().replace(/[.,;]+$/, "") : "";
}

/** Every address in a comma-separated recipient header, lowercased and deduped. */
function parseAddressList(raw: string): string[] {
  const found = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[A-Za-z0-9]/g) ?? [];
  return [...new Set(found.map((a) => a.toLowerCase()))];
}

/** The account's mailboxes as a lowercased set, from one address or many. */
function normaliseMailboxes(raw: string | readonly string[]): Set<string> {
  const list = typeof raw === "string" ? [raw] : raw;
  return new Set(list.map((m) => m.trim().toLowerCase()).filter((m) => m !== ""));
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = value;
  return out;
}

/**
 * `X-Spam-Status: Yes, score=11.8` — the verdict and the score the receiving
 * server already reached.
 *
 * On the KAI-93 coverage corpus this header separates the ten `spam` emails
 * from the other thirty with no error either way, while the models that were
 * asked the same question took up to 145 seconds to answer it worse. Absent
 * header means the provider is silent, not that the mail is clean.
 */
function readSpamStatus(value: string | undefined): {
  filtered: boolean | null;
  score: number | null;
} {
  if (!value) return { filtered: null, score: null };
  const verdict = /^\s*(yes|true)\b/i.test(value)
    ? true
    : /^\s*(no|false)\b/i.test(value)
      ? false
      : null;
  const score = value.match(/score=(-?\d+(?:\.\d+)?)/i);
  return { filtered: verdict, score: score ? Number(score[1]) : null };
}

/**
 * `Authentication-Results: mx.google.com; spf=pass; dkim=pass; dmarc=fail`.
 *
 * Any explicit failure wins: a message that passes SPF and fails DMARC is a
 * message whose sender could not be confirmed, which is the only thing a
 * caller wants to know here.
 */
function readAuthResult(value: string | undefined): AuthResult | null {
  if (!value) return null;
  if (/\b(spf|dkim|dmarc)=fail\b/i.test(value)) return "fail";
  if (/\b(spf|dkim|dmarc)=pass\b/i.test(value)) return "pass";
  return "none";
}

function readGmailCategory(labels: string[]): GmailCategory | null {
  for (const category of GMAIL_CATEGORIES) {
    if (labels.includes(`CATEGORY_${category}`)) return category;
  }
  return null;
}

/**
 * Reads the envelope. Pure: no network, no database, no clock.
 *
 * Every field is derived from a header that either arrived or did not, so this
 * is forward-compatible with widening `METADATA_HEADERS` — a header the poller
 * does not request yet simply leaves its fact `null`, and starts populating it
 * the day it is requested, with no change here.
 */
export function extractMailFacts(input: MailFactsInput): MailFacts {
  const h = lowercaseKeys(input.headers);

  const senderAddress = extractEmailAddress(input.from);
  const senderDomain = extractDomain(senderAddress);
  const tenantAddresses = normaliseMailboxes(input.tenantMailbox);
  // Only corporate domains identify a company. A tenant whose inbox is on a
  // public provider shares that domain with millions of strangers, so its
  // domain contributes nothing and only the full address can match.
  const tenantDomains = new Set(
    [...tenantAddresses].map(extractDomain).filter((d) => d !== "" && !PUBLIC_EMAIL_DOMAINS.has(d)),
  );
  const tenantDomainIsPublic = [...tenantAddresses].some((a) =>
    PUBLIC_EMAIL_DOMAINS.has(extractDomain(a)),
  );

  const recipients = [
    ...parseAddressList(h["to"] ?? ""),
    ...parseAddressList(h["cc"] ?? ""),
  ];
  const uniqueRecipients = [...new Set(recipients)];

  const fromLower = input.from.toLowerCase();
  const spam = readSpamStatus(h["x-spam-status"]);
  const precedence = (h["precedence"] ?? "").trim().toLowerCase();
  const autoSubmitted = (h["auto-submitted"] ?? "").trim().toLowerCase();

  const hasListUnsubscribe = "list-unsubscribe" in h;
  const isAutoGenerated =
    "x-auto-response-suppress" in h || precedence === "bulk" || precedence === "list";
  const isAutoSubmitted = autoSubmitted !== "" && autoSubmitted !== "no";

  return {
    senderAddress,
    senderDomain,
    senderIsTenantAddress: senderAddress !== "" && tenantAddresses.has(senderAddress),
    senderIsTenantDomain:
      !tenantAddresses.has(senderAddress) && senderDomain !== "" && tenantDomains.has(senderDomain),
    tenantDomainIsPublic,
    tenantInRecipients: uniqueRecipients.some((r) => tenantAddresses.has(r)),
    recipientCount: uniqueRecipients.length,
    toHeader: h["to"] ?? "",
    ccHeader: h["cc"] ?? "",

    isAutomatedSender:
      NO_REPLY_REGEX.test(senderAddress) ||
      BLOCKED_SENDER_PATTERNS.some((p) => fromLower.includes(p)),
    hasListUnsubscribe,
    isAutoGenerated,
    isAutoSubmitted,
    isBulk: hasListUnsubscribe || isAutoGenerated || isAutoSubmitted,
    isReply: "in-reply-to" in h,
    referencesCount: (h["references"] ?? "").split(/\s+/).filter(Boolean).length,

    spamFiltered: spam.filtered,
    spamScore: spam.score,
    authResult: readAuthResult(h["authentication-results"]),
    gmailCategory: readGmailCategory(input.gmailCategories ?? []),

    isCalendarInvite: input.mimeType === "text/calendar",
    hasSystemSubjectPrefix: SYSTEM_SUBJECT_PREFIXES.some((p) => input.subject.startsWith(p)),
    hasUrgencyKeyword: URGENCY_KEYWORDS.some((kw) => input.subject.toLowerCase().includes(kw)),
  };
}
