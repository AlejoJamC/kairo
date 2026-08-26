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
