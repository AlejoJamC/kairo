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
  /** Attachment metadata only — their contents are never read. */
  attachments?: EmailAttachmentRef[];
  date?: Date;
}
