// ChannelSender — canal-agnostic outbound sending abstraction (KAI-114 / ADR-023 §2)
//
// Any outbound channel (Gmail today; Instagram/WhatsApp/Slack later) implements
// this interface. The outbox endpoint and the Inngest worker depend only on
// this contract — never on a provider's API directly.

export interface OutboundMessage {
  to: string;
  subject: string;
  bodyPlain: string;
  threadExternalId: string;
  inReplyToExternalId?: string;
}

export interface ChannelCredential {
  accessToken: string;
  externalAccountId: string;
}

export interface ChannelSendResult {
  providerMessageId: string;
  providerThreadId: string;
}

// Provider-agnostic error vocabulary — the worker branches on these codes
// without needing to know which provider raised them.
export type ChannelSendErrorCode =
  | "TOKEN_EXPIRED"
  | "INSUFFICIENT_SCOPE"
  | "NO_INTEGRATION"
  | "PROVIDER_ERROR";

export class ChannelSendException extends Error {
  constructor(
    public readonly code: ChannelSendErrorCode,
    public readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

export interface ChannelSender {
  send(message: OutboundMessage, credential: ChannelCredential): Promise<ChannelSendResult>;
}
