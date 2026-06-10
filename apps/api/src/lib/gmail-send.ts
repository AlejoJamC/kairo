// Gmail send helper — scoped to single Gmail account per tenant.
//
// NOTE: KAI-29 scopes token retrieval to gmail_accounts (one account per tenant).
// Multi-client / multi-Gmail-account selection was considered here but deferred
// to a dedicated task — this architecture must be revisited before supporting
// multiple connected Gmail accounts per tenant or omnichannel token abstraction.

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailSendError =
  | { code: "GMAIL_TOKEN_EXPIRED" }
  | { code: "NO_GMAIL_INTEGRATION" }
  | { code: "INSUFFICIENT_SCOPE" }
  | { code: "GMAIL_API_ERROR"; detail: string };

export class GmailSendException extends Error {
  constructor(public readonly gmailError: GmailSendError) {
    super(gmailError.code);
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
  return { messageId: data.id, threadId: data.threadId };
}
