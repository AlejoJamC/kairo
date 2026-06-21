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

const METADATA_HEADERS = [
  "From",
  "Subject",
  "Date",
  "List-Unsubscribe",
  "X-Auto-Response-Suppress",
  "Precedence",
  "In-Reply-To",
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
