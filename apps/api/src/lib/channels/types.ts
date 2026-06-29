// ChannelSender — canal-agnostic outbound sending abstraction (KAI-114 / ADR-023 §2)
//
// Any outbound channel (Gmail today; Instagram/WhatsApp/Slack later) implements
// this interface. The outbox endpoint and the Inngest worker depend only on
// this contract — never on a provider's API directly.

export interface OutboundMessage {
  to: string;
  subject: string;
  bodyPlain: string;
  /** HTML version of the body (multipart/alternative). Null/absent = plain-only send. */
  bodyHtml?: string | null;
  threadExternalId: string;
  /** RFC 2822 Message-ID of the last inbound message — sets In-Reply-To + References. */
  inReplyToExternalId?: string | null;
}

export interface ChannelCredential {
  accessToken: string;
  externalAccountId: string;
}

export interface ChannelSendResult {
  providerMessageId: string;
  providerThreadId: string;
  /**
   * RFC 2822 `Message-ID` header of the message we just sent, when the
   * provider can report it back (KAI-248 Group 2). Persisted on the outbound
   * `messages` row so a future customer reply that threads off this message
   * can be matched via In-Reply-To/References, the same way inbound messages
   * already are (KAI-115). `null`/absent when the provider has no equivalent
   * or the lookup failed — threading then falls back to the provider's native
   * thread id.
   */
  providerMessageIdHeader?: string | null;
}

// Provider-agnostic error vocabulary — the worker branches on these codes
// without needing to know which provider raised them.
export type ChannelSendErrorCode =
  | "TOKEN_EXPIRED"
  | "INSUFFICIENT_SCOPE"
  | "NO_INTEGRATION"
  | "PROVIDER_ERROR";

export class ChannelSendException extends Error {
  readonly code: ChannelSendErrorCode;
  readonly detail?: string;

  constructor(code: ChannelSendErrorCode, detail?: string) {
    super(detail ?? code);
    this.code = code;
    this.detail = detail;
  }
}

export interface ChannelSender {
  send(message: OutboundMessage, credential: ChannelCredential): Promise<ChannelSendResult>;
}
