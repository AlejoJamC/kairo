// ---------------------------------------------------------------------------
// KAI-248 — Real Gmail REST collaborators for the poll worker.
//
// These thin fetch wrappers are the production implementations passed into
// `pollGmailAccount` via `GmailPollDeps`. Kept separate from poll-account.ts
// so tests can inject fakes without touching the network.
// ---------------------------------------------------------------------------

import {
  GmailHistoryExpiredError,
  type GmailHistoryListResponse,
  type GmailMessage,
  type GmailMessageListResponse,
  type GmailProfile,
} from "./types.js";

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1";

// The headers `format=metadata` returns. Unlisted headers are simply absent
// from the response, so this list is the hard limit on what extractMailFacts
// can know about a polled message — the four pipeline tiers use `format=full`
// and receive everything regardless.
//
// Widening it is free: Gmail charges 5 quota units per messages.get whatever
// the format, and only the payload size changes.
const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "X-Auto-Response-Suppress",
  "Precedence",
  "In-Reply-To",
  // KAI-248 Grupo 1: RFC 2822 Message-ID — persisted to messages.message_id_header
  // so outbound replies can set In-Reply-To / References (mirrors tier1-fast-path).
  "Message-ID",

  // KAI-45 — the envelope facts the classifier is told instead of asked to
  // infer. Every one of these was previously unavailable to this path, so the
  // corresponding fact came back null no matter what the message carried.
  //
  // To / Cc      recipient count, and whether the tenant is among them. The
  //              EmailMessage type has carried `to` and `cc` since the rubric
  //              started claiming `internal` is undecidable without them, and
  //              no ingestion path has ever populated either.
  // References   thread depth as the headers report it.
  // X-Spam-Status
  //              the receiving server's own verdict. On the KAI-93 coverage
  //              corpus it separates all ten spam emails from the other thirty
  //              with no error either way.
  // Auto-Submitted
  //              RFC 3834 machine-generated mail that sets no Precedence.
  // Authentication-Results
  //              SPF/DKIM/DMARC — a sender claiming the tenant's own domain and
  //              failing DMARC is the forgery case the same-domain rule used to
  //              hide (see routing-policy.ts 2.0.0).
  "To",
  "Cc",
  "References",
  "X-Spam-Status",
  "Auto-Submitted",
  "Authentication-Results",
];

async function gmailGet<T>(
  token: string,
  path: string,
  params?: Record<string, string | string[]>
): Promise<T> {
  const url = new URL(`${GMAIL_BASE}/${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) {
    throw new GmailHistoryExpiredError(`Gmail API ${path}: 404`);
  }
  if (!res.ok) {
    throw new Error(`Gmail API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function getProfile(token: string): Promise<GmailProfile> {
  return gmailGet<GmailProfile>(token, "users/me/profile");
}

export async function historyList(
  token: string,
  startHistoryId: string
): Promise<GmailHistoryListResponse> {
  return gmailGet<GmailHistoryListResponse>(token, "users/me/history", {
    startHistoryId,
    historyTypes: ["messageAdded"],
    labelId: "INBOX",
  });
}

export async function messagesList(token: string): Promise<GmailMessageListResponse> {
  return gmailGet<GmailMessageListResponse>(token, "users/me/messages", {
    maxResults: "100",
    labelIds: "INBOX",
  });
}

export async function getMessage(token: string, messageId: string): Promise<GmailMessage> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const h of METADATA_HEADERS) params.append("metadataHeaders", h);

  const res = await fetch(
    `${GMAIL_BASE}/users/me/messages/${messageId}?${params.toString()}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    throw new Error(`Gmail API messages.get ${messageId}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<GmailMessage>;
}
