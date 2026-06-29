// Gmail implementation of ChannelSender (KAI-114 / ADR-023 §2)
//
// Thin adapter over the existing sendGmailReply helper — translates the
// generic ChannelSender contract to/from Gmail's send API and maps Gmail-
// specific error codes onto the provider-agnostic ChannelSendException
// vocabulary the worker understands.

import { sendGmailReply, GmailSendException, type GmailSendError } from "../gmail-send.js";
import {
  ChannelSendException,
  type ChannelCredential,
  type ChannelSendResult,
  type ChannelSender,
  type ChannelSendErrorCode,
  type OutboundMessage,
} from "./types.js";

const GMAIL_ERROR_CODE_MAP: Record<GmailSendError["code"], ChannelSendErrorCode> = {
  GMAIL_TOKEN_EXPIRED: "TOKEN_EXPIRED",
  NO_GMAIL_INTEGRATION: "NO_INTEGRATION",
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  GMAIL_API_ERROR: "PROVIDER_ERROR",
};

export class GmailChannelSender implements ChannelSender {
  async send(message: OutboundMessage, credential: ChannelCredential): Promise<ChannelSendResult> {
    try {
      const result = await sendGmailReply({
        accessToken: credential.accessToken,
        threadId: message.threadExternalId,
        to: message.to,
        subject: message.subject,
        bodyPlain: message.bodyPlain,
        bodyHtml: message.bodyHtml ?? undefined,
        inReplyToMessageId: message.inReplyToExternalId ?? undefined,
      });
      return {
        providerMessageId: result.messageId,
        providerThreadId: result.threadId,
        providerMessageIdHeader: result.messageIdHeader,
      };
    } catch (err) {
      if (err instanceof GmailSendException) {
        const code = GMAIL_ERROR_CODE_MAP[err.gmailError.code];
        const detail = "detail" in err.gmailError ? err.gmailError.detail : undefined;
        throw new ChannelSendException(code, detail);
      }
      throw new ChannelSendException("PROVIDER_ERROR", String(err));
    }
  }
}
