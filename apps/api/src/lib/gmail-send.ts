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

function buildMimeMessage(opts: {
  to: string;
  subject: string;
  bodyPlain: string;
  threadId: string;
  inReplyToMessageId?: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    ...(opts.inReplyToMessageId ? [`In-Reply-To: ${opts.inReplyToMessageId}`] : []),
    "",
    opts.bodyPlain,
  ];
  return Buffer.from(lines.join("\r\n"))
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
  inReplyToMessageId?: string;
}): Promise<GmailSendResult> {
  const raw = buildMimeMessage({
    to: opts.to,
    subject: opts.subject,
    bodyPlain: opts.bodyPlain,
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
