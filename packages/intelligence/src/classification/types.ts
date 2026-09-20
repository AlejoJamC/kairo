export interface EmailAttachmentRef {
  filename: string;
  contentType: string;
}

export interface EmailMessage {
  subject: string;
  body: string;
  from: string;
  /**
   * Recipients. `internal` is decided by who sent the mail relative to who
   * received it, so without `to` that class is not decidable from the text.
   * Optional: callers that only have the sender still work, and the prompt
   * marks the field as unavailable so the model lowers its confidence instead
   * of guessing.
   */
  to?: string;
  cc?: string;
  /** Messages preceding this one in the thread. 0 opens the thread. */
  threadDepth?: number;
  /** Attachment metadata only - their contents are never read. */
  attachments?: EmailAttachmentRef[];
  date?: Date;

  /**
   * The mailbox Kairo is reading, i.e. the tenant's own address. Without it
   * the model has to guess which of `from` and `to` is the house, which is a
   * configuration fact, not something to infer from prose.
   */
  tenantMailbox?: string;

  /**
   * What the envelope states outright, read by apps/api before the message got
   * here (lib/email/mail-facts.ts).
   *
   * Optional because three call sites classify a stored ticket rather than a
   * Gmail message and have no headers to read. The prompt renders whatever is
   * present and says nothing about the rest — the absence of a fact is never
   * presented to the model as a negative one.
   */
  facts?: MailFacts;

  /**
   * What the tenant does for its customers, in one or two sentences. This is
   * what separates `support` from `internal`: an email is support when it can
   * be tied to the service the company provides, and internal when it is the
   * company's own housekeeping. The classifier cannot make that call for an
   * account whose business it has never been told.
   *
   * Left undefined until the account has one; the prompt then says so and asks
   * for lower confidence rather than pretending.
   */
  businessContext?: string;
}

// ---------------------------------------------------------------------------
// KAI-45 — what the envelope says, as the classifier's input contract.
//
// The type lives here, with EmailMessage, because this package is what
// consumes it: the prompt states these as given facts so the model stops being
// asked to infer them from prose. apps/api owns the reader (lib/email/
// mail-facts.ts) — it is the side that has the headers — and imports the shape
// from here, never the other way round.
// ---------------------------------------------------------------------------

export const GMAIL_CATEGORIES = [
  "PRIMARY",
  "SOCIAL",
  "PROMOTIONS",
  "UPDATES",
  "FORUMS",
] as const;
export type GmailCategory = (typeof GMAIL_CATEGORIES)[number];

/** Result of the receiving server's SPF/DKIM/DMARC checks, when it reports them. */
export type AuthResult = "pass" | "fail" | "none";

/**
 * Everything the envelope states outright. No judgement, no label, no verdict —
 * a caller that wants one asks routing-policy.ts.
 *
 * A fact whose header did not arrive is `null`, never `false`: "the provider
 * says this is not spam" and "the provider did not say" are different states,
 * and collapsing them is how a rule ends up trusting a header that was never
 * fetched.
 */
export interface MailFacts {
  /** Bare address from `From`, lowercased. */
  senderAddress: string;
  /** Domain of {@link senderAddress}, lowercased, `""` when unparseable. */
  senderDomain: string;
  /** Sender is one of the account's own mailboxes — a copy of the house's own message. */
  senderIsTenantAddress: boolean;
  /**
   * Sender shares a corporate domain with the account but is **not** one of its
   * mailboxes: another mailbox of the same company.
   *
   * Mutually exclusive with {@link MailFacts.senderIsTenantAddress}, so the pair
   * encodes exactly the three provenance states the derivation key uses. Always
   * false for a public-provider inbox, where the domain identifies nobody.
   */
  senderIsTenantDomain: boolean;
  /** The tenant's inbox is on a public provider, so domain matching is meaningless. */
  tenantDomainIsPublic: boolean;
  /** The connected mailbox appears in `To` or `Cc`. */
  tenantInRecipients: boolean;
  /** Unique addresses across `To` and `Cc`. 0 when neither header arrived. */
  recipientCount: number;
  /**
   * The `To` and `Cc` headers verbatim, `""` when the header did not arrive.
   *
   * Kept raw alongside the derived counts because the classifier prompt renders
   * them as text — `EmailMessage.to` / `.cc` have existed since the rubric
   * started claiming `internal` is undecidable without them, and no ingestion
   * path has ever filled either.
   */
  toHeader: string;
  ccHeader: string;
  /** `no-reply@` and friends, or a known bulk-sender pattern. */
  isAutomatedSender: boolean;
  /** Carries `List-Unsubscribe`: a list the recipient can leave. */
  hasListUnsubscribe: boolean;
  /** `X-Auto-Response-Suppress`, or `Precedence: bulk|list`. */
  isAutoGenerated: boolean;
  /** `Auto-Submitted` present and not `no` — RFC 3834 machine-generated. */
  isAutoSubmitted: boolean;
  /**
   * Any of the three above. The aggregate is what the prompt is told; the
   * routing policy reads the atomic facts, because the rules it inherits
   * distinguish them (a mailing list is skipped for a different stated reason
   * than an auto-responder, and `Auto-Submitted` was never part of either).
   */
  isBulk: boolean;
  /** Carries `In-Reply-To`: this message continues a thread. */
  isReply: boolean;
  /** Number of ids in `References` — thread depth as the headers report it. */
  referencesCount: number;
  /** The receiving server's spam verdict. `null` when it did not give one. */
  spamFiltered: boolean | null;
  spamScore: number | null;
  /** SPF/DKIM/DMARC summary from `Authentication-Results`. */
  authResult: AuthResult | null;
  gmailCategory: GmailCategory | null;
  isCalendarInvite: boolean;
  hasSystemSubjectPrefix: boolean;
  /** Subject matched {@link URGENCY_KEYWORDS}. English-only — see that constant. */
  hasUrgencyKeyword: boolean;
}
