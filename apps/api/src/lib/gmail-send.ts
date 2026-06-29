// Gmail send helper — scoped to single Gmail account per tenant.
//
// NOTE: KAI-29 scopes token retrieval to gmail_accounts (one account per tenant).
// Multi-client / multi-Gmail-account selection was considered here but deferred
// to a dedicated task — this architecture must be revisited before supporting
// multiple connected Gmail accounts per tenant or omnichannel token abstraction.

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * Builds the `messages.get` URL for fetching just the `Message-ID` header of a
 * just-sent message. `format=metadata&metadataHeaders=Message-ID` returns the
 * minimal payload (no body, no full header list) needed to recover the RFC 2822
 * Message-ID Gmail assigned — see KAI-248 Group 2 rationale below.
 */
function buildGetMetadataUrl(messageId: string): string {
  const params = new URLSearchParams({ format: "metadata" });
  params.append("metadataHeaders", "Message-ID");
  return `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?${params.toString()}`;
}

export type GmailSendError =
  | { code: "GMAIL_TOKEN_EXPIRED" }
  | { code: "NO_GMAIL_INTEGRATION" }
  | { code: "INSUFFICIENT_SCOPE" }
  | { code: "GMAIL_API_ERROR"; detail: string };

export class GmailSendException extends Error {
  readonly gmailError: GmailSendError;

  constructor(gmailError: GmailSendError) {
    super(gmailError.code);
    this.gmailError = gmailError;
  }
}

const BOUNDARY = "kairo_mime_boundary_v1";

/** True when the string contains only 7-bit ASCII. */
function isAscii(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

/**
 * RFC 2047 encoded-word for header values. Email headers must be ASCII; any
 * non-ASCII (e.g. "–", "ñ", "¿") must be wrapped as =?UTF-8?B?<base64>?=,
 * otherwise the receiving client misreads the raw UTF-8 bytes as Latin-1 and
 * produces mojibake ("Ã¢Â€Â"). ASCII values are returned unchanged.
 */
function encodeHeader(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/**
 * Base64-encode a body part and wrap at 76 chars per RFC 2045. The declared
 * Content-Transfer-Encoding must match the actual encoding — declaring
 * quoted-printable/7bit while shipping raw 8-bit UTF-8 is malformed and breaks
 * on strict clients.
 */
function base64Body(value: string): string {
  return Buffer.from(value, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
  threadId: string;
  inReplyToMessageId?: string;
}): string {
  const threadingHeaders = opts.inReplyToMessageId
    ? [
        `In-Reply-To: ${opts.inReplyToMessageId}`,
        `References: ${opts.inReplyToMessageId}`,
      ]
    : [];

  let raw: string;

  if (opts.bodyHtml) {
    // multipart/alternative: plain first, then HTML (email clients prefer the last part)
    const lines = [
      `To: ${opts.to}`,
      `Subject: ${encodeHeader(opts.subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${BOUNDARY}"`,
      ...threadingHeaders,
      "",
      `--${BOUNDARY}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(opts.bodyPlain),
      "",
      `--${BOUNDARY}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      base64Body(opts.bodyHtml),
      "",
      `--${BOUNDARY}--`,
    ];
    raw = lines.join("\r\n");
  } else {
    const lines = [
      `To: ${opts.to}`,
      `Subject: ${encodeHeader(opts.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      ...threadingHeaders,
      "",
      base64Body(opts.bodyPlain),
    ];
    raw = lines.join("\r\n");
  }

  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface GmailSendResult {
  messageId: string;
  threadId: string;
  /**
   * RFC 2822 `Message-ID` header (e.g. "<abc@mail.gmail.com>") that Gmail
   * actually stamped on the sent message — distinct from `messageId`, which is
   * Gmail's internal API id and never appears in the wire-format email.
   * `null` when the follow-up metadata lookup fails (KAI-248 Group 2: best
   * effort — a failed lookup must never fail the send itself, since the email
   * has already been delivered at that point).
   */
  messageIdHeader: string | null;
}

export async function sendGmailReply(opts: {
  accessToken: string;
  threadId: string;
  to: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
  inReplyToMessageId?: string;
}): Promise<GmailSendResult> {
  const raw = buildMimeMessage({
    to: opts.to,
    subject: opts.subject,
    bodyPlain: opts.bodyPlain,
    bodyHtml: opts.bodyHtml,
    threadId: opts.threadId,
    inReplyToMessageId: opts.inReplyToMessageId,
  });

  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw, threadId: opts.threadId }),
  });

  if (res.status === 401) {
    throw new GmailSendException({ code: "GMAIL_TOKEN_EXPIRED" });
  }

  if (res.status === 403) {
    const detail = await res.text().catch(() => "");
    if (/insufficient.*(scope|permission)/i.test(detail)) {
      throw new GmailSendException({ code: "INSUFFICIENT_SCOPE" });
    }
    throw new GmailSendException({ code: "GMAIL_API_ERROR", detail });
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => `HTTP ${res.status}`);
    throw new GmailSendException({ code: "GMAIL_API_ERROR", detail });
  }

  const data = (await res.json()) as { id: string; threadId: string };

  // KAI-248 Group 2: `users.messages.send` only returns Gmail's internal
  // message id + thread id — never the RFC 2822 `Message-ID` header that
  // actually goes out on the wire. We need that real header value (not a
  // self-generated one) so a future customer reply that quotes/threads off
  // this message can be matched back via In-Reply-To/References: Gmail is
  // free to rewrite or ignore a client-supplied Message-ID header on send, so
  // generating our own and trusting it to survive would silently break
  // threading. A best-effort `messages.get(format=metadata)` follow-up call
  // is the only reliable way to read back what Gmail actually stamped.
  //
  // This call is intentionally fire-and-forget from the caller's point of
  // view: the email has already been sent by this point, so a failure here
  // must never surface as a send failure. Missing thread continuity on a
  // future reply (falls back to Gmail's native threadId matching) is an
  // acceptable degradation versus retrying/failing an already-sent email.
  const messageIdHeader = await fetchMessageIdHeader(opts.accessToken, data.id);

  return { messageId: data.id, threadId: data.threadId, messageIdHeader };
}

/**
 * Best-effort lookup of the RFC 2822 `Message-ID` header for a message Gmail
 * just sent. Never throws — any failure (network, non-200, missing header)
 * resolves to `null` so the caller can proceed without it.
 */
async function fetchMessageIdHeader(accessToken: string, gmailMessageId: string): Promise<string | null> {
  try {
    const res = await fetch(buildGetMetadataUrl(gmailMessageId), {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const header = data.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id");
    return header?.value ?? null;
  } catch {
    return null;
  }
}
